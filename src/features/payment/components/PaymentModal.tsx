'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import QRCode from 'react-qr-code'
import { GameButton, GameDialog, GameDialogContent, ParticleBurst } from '@/shared/components/game'
import { formatVnd } from '@/shared/lib/economy'
import { useCoins } from '@/shared/stores/CoinsProvider'
import { useLoginDialog } from '@/shared/stores/LoginDialogProvider'
import { usePaymentDialog } from '@/shared/stores/PaymentDialogProvider'
import type { ActionResult } from '@/shared/types/result'
import { cn } from '@/shared/utils/cn'
import { getPaymentStatus } from '../actions/getPaymentStatus'
import { COIN_PRODUCTS, findProduct, PRO_PRODUCTS, type Membership, type PaymentProduct } from '../lib/plans'
import type { Checkout } from '../services/orders'

// How often an open checkout asks whether the transfer arrived (the webhook settles it on the server;
// this read also settles it from PayOS when the webhook can't reach the server, e.g. on localhost).
export const POLL_MS = 3000

type PaymentModalProps = {
  signedIn: boolean
  // PayOS is configured on this server.
  paymentsEnabled: boolean
  membership: Membership
}

type Stage =
  | { name: 'choose' }
  | { name: 'pay'; checkout: Checkout }
  | { name: 'paid'; product: PaymentProduct; coinsAdded: number; totalCoins: number | null }
  | { name: 'cancelled' }

// ⭐ Upgrade: pick Pro (1 month / lifetime) or a coin pack, then pay by bank transfer with PayOS:
// scan the VietQR code in any banking app, or open PayOS's checkout page. The modal waits for the
// payment (POLL_MS), then celebrates, updates the purse and refreshes the page (Pro badge).
function PaymentModal({ signedIn, paymentsEnabled, membership }: PaymentModalProps) {
  const { isOpen, setOpen, productId } = usePaymentDialog()
  return (
    <GameDialog open={isOpen} onOpenChange={setOpen}>
      <GameDialogContent title="⭐ Upgrade" ribbon="gold" tone="parchment" size="lg" description="Pay by bank transfer with VietQR (PayOS). Pro or coins arrive as soon as the transfer does.">
        {isOpen && <PaymentBody key={productId ?? 'default'} signedIn={signedIn} paymentsEnabled={paymentsEnabled} membership={membership} initialProductId={productId} onClose={() => setOpen(false)} />}
      </GameDialogContent>
    </GameDialog>
  )
}

function PaymentBody({ signedIn, paymentsEnabled, membership, initialProductId, onClose }: PaymentModalProps & { initialProductId: string | null; onClose: () => void }) {
  const router = useRouter()
  const { setCoins } = useCoins()
  const { open: openLogin } = useLoginDialog()
  const [selected, setSelected] = useState<PaymentProduct['id']>(() => findProduct(initialProductId ?? '')?.id ?? (membership.lifetime ? 'coins-100' : 'pro-1m'))
  const [stage, setStage] = useState<Stage>({ name: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const product = findProduct(selected)!

  const startPayment = () => {
    setError(null)
    startTransition(async () => {
      try {
        const res = await fetch('/api/payment/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: selected }) })
        const result = (await res.json()) as ActionResult<Checkout>
        if (!result.success) {
          setError(result.error.message)
          return
        }
        setStage({ name: 'pay', checkout: result.data })
      } catch {
        setError('Could not reach the server. Check your connection and try again')
      }
    })
  }

  // Wait for the transfer while the QR code is shown.
  const orderCode = stage.name === 'pay' ? stage.checkout.orderCode : null
  const settledRef = useRef(false)
  useEffect(() => {
    if (orderCode === null) return
    settledRef.current = false
    const timer = setInterval(async () => {
      const res = await getPaymentStatus({ orderCode })
      if (!res.success || settledRef.current) return
      if (res.data.status === 'PAID') {
        settledRef.current = true
        if (res.data.totalCoins !== null) setCoins(res.data.totalCoins)
        setStage({ name: 'paid', product: findProduct(res.data.productId) ?? product, coinsAdded: res.data.coins, totalCoins: res.data.totalCoins })
        // The header's ⭐ Pro badge and coin pill are server-rendered: refresh them.
        router.refresh()
      } else if (res.data.status === 'CANCELLED') {
        settledRef.current = true
        setStage({ name: 'cancelled' })
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [orderCode, product, router, setCoins])

  if (stage.name === 'paid') {
    return (
      <div className="relative space-y-4 text-center">
        <ParticleBurst variant="gold" count={28} radius={170} />
        <p className="font-game text-2xl font-extrabold text-[#5a2a02]">{stage.product.planType === 'COIN_PACK' ? `+${stage.coinsAdded} 🪙 added!` : '⭐ You are Pro!'}</p>
        <p className="text-sm text-amber-900/80">
          {stage.product.planType === 'COIN_PACK'
            ? `Your purse: ${stage.totalCoins ?? '…'} 🪙. Thank you for supporting MindGarden.`
            : `${stage.product.name} is active. Thank you for supporting MindGarden.`}
        </p>
        <GameButton tone="leaf" size="lg" className="w-full" onClick={onClose}>
          Back to my garden
        </GameButton>
      </div>
    )
  }

  if (stage.name === 'cancelled') {
    return (
      <div className="space-y-4 text-center">
        <p role="status" className="rounded-xl bg-orange-100 px-3 py-2 font-game text-base font-extrabold text-amber-900">
          This payment was cancelled or expired. Nothing was charged.
        </p>
        <GameButton tone="sun" size="lg" className="w-full" onClick={() => setStage({ name: 'choose' })}>
          Choose again
        </GameButton>
      </div>
    )
  }

  if (stage.name === 'pay') {
    const { checkout } = stage
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div data-payment-qr className="shrink-0 rounded-2xl border-[3px] border-[#c9955e] bg-white p-3 shadow-[0_4px_0_#b07a45]">
            <QRCode value={checkout.qrCode} size={184} level="M" aria-label={`VietQR code: pay ${formatVnd(checkout.amount)}`} />
          </div>
          <dl className="w-full space-y-1.5 font-game text-sm text-[#4a2511]">
            <Row label="Amount" value={formatVnd(checkout.amount)} strong />
            <Row label="Account" value={checkout.accountName} />
            <Row label="Number" value={checkout.accountNumber} />
            <Row label="Message" value={checkout.description} />
            <Row label="Order" value={String(checkout.orderCode)} />
          </dl>
        </div>
        <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-center font-game text-sm font-bold text-sky-900">
          <span aria-hidden className="inline-block size-2.5 animate-pulse rounded-full bg-sky-500 motion-reduce:animate-none" />
          Scan with your banking app. This window updates as soon as the transfer arrives.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <GameButton asChild tone="sky" size="lg" className="flex-1">
            <a href={checkout.checkoutUrl}>Open PayOS checkout</a>
          </GameButton>
          <GameButton tone="wood" size="lg" onClick={onClose}>
            Close
          </GameButton>
        </div>
        <p className="text-center text-xs text-amber-900/60">Closed this window? The order still completes when the transfer arrives.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {membership.isPro && (
        <p className="rounded-xl bg-gradient-to-b from-[#fff7ae] to-[#fcd34d] px-3 py-2 text-center font-game text-sm font-extrabold text-[#5a2a02]">
          ⭐ You are Pro {membership.lifetime ? 'for life' : `until ${formatDate(membership.proUntil)}`}. {membership.lifetime ? '' : 'Another month adds 30 days.'}
        </p>
      )}
      <ProductGroup label="Pro membership" products={membership.lifetime ? [] : PRO_PRODUCTS} selected={selected} onSelect={setSelected} />
      <ProductGroup label="Coin packs" products={COIN_PRODUCTS} selected={selected} onSelect={setSelected} />

      {error && (
        <p role="alert" className="rounded-xl bg-orange-100 px-3 py-2 text-center font-game text-sm font-extrabold text-amber-900">
          {error}.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {!signedIn ? (
          <GameButton
            tone="leaf"
            size="lg"
            className="flex-1"
            onClick={() => {
              onClose()
              openLogin()
            }}
          >
            Sign in to upgrade
          </GameButton>
        ) : (
          <GameButton tone="sun" size="lg" className="flex-1" onClick={startPayment} disabled={!paymentsEnabled || isPending}>
            {!paymentsEnabled ? 'Payments are not set up yet' : isPending ? 'Creating your QR…' : `Pay ${formatVnd(product.amountVnd)} with VietQR`}
          </GameButton>
        )}
        <GameButton tone="wood" size="lg" onClick={onClose}>
          Close
        </GameButton>
      </div>
    </div>
  )
}

function ProductGroup({ label, products, selected, onSelect }: { label: string; products: readonly PaymentProduct[]; selected: string; onSelect: (id: PaymentProduct['id']) => void }) {
  if (products.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 font-game text-sm font-extrabold tracking-wide text-[#4a2511]/70 uppercase">{label}</h3>
      <ul role="radiogroup" aria-label={label} className={cn('grid gap-3', products.length > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
        {products.map((p) => {
          const picked = p.id === selected
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => onSelect(p.id)}
                className={cn(
                  'relative flex h-full w-full flex-col items-center gap-1 rounded-[18px] border-[3px] px-2 pt-4 pb-3 text-center font-game transition-transform duration-150 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
                  picked
                    ? '-translate-y-0.5 border-[#d69e12] bg-gradient-to-b from-[#fffdf0] to-[#ffe28a] shadow-[inset_0_2px_0_#fff,0_5px_0_#b7830c]'
                    : 'border-[#dcb98c] bg-gradient-to-b from-white to-[#fff6e6] shadow-[inset_0_2px_0_#fff,0_4px_0_#d2ac7c] hover:-translate-y-0.5',
                )}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-[#8a1033] bg-gradient-to-b from-[#fb7185] to-[#e11d48] px-2 py-0.5 text-[10px] leading-none font-extrabold whitespace-nowrap text-white">
                    {p.highlight}
                  </span>
                )}
                <span className="text-lg leading-tight font-extrabold text-[#5a2a02]">{p.planType === 'COIN_PACK' ? `${p.coins} 🪙` : p.planType === 'PRO_LIFETIME' ? '⭐ Lifetime' : '⭐ 1 month'}</span>
                <span className="rounded-full bg-[#4a2511]/10 px-2 py-0.5 text-sm font-extrabold text-[#4a2511] tabular-nums">{formatVnd(p.amountVnd)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dashed border-[#c9955e]/50 pb-1">
      <dt className="text-xs font-bold text-[#4a2511]/65">{label}</dt>
      <dd className={cn('text-right break-all', strong ? 'text-lg font-extrabold text-[#5a2a02]' : 'font-bold')}>{value}</dd>
    </div>
  )
}

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '')

export { PaymentModal }
