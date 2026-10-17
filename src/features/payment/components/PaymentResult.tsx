'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { GameButton, ParticleBurst } from '@/shared/components/game'
import { useCoins } from '@/shared/stores/CoinsProvider'
import type { ActionResult } from '@/shared/types/result'
import { getPaymentStatus } from '../actions/getPaymentStatus'
import type { PaymentStatus } from '../services/orders'
import { POLL_MS } from './PaymentModal'

// How long the return page keeps checking a payment PayOS hasn't confirmed yet.
const MAX_CHECKS = 15

type PaymentResultProps = {
  orderCode: number | null
  // PayOS's own query on the way back (cancel=true / status=CANCELLED). Shown at once, but the order's
  // fate is still read from the server, never from the URL.
  cancelledHint: boolean
  initial: ActionResult<PaymentStatus> | null
}

// The page PayOS sends the buyer back to (/payment/result?orderCode=…): it settles the order on the
// server (getPaymentStatus checks with PayOS), keeps checking a few times while the bank confirms,
// then shows the coins that arrived and refreshes the header's purse.
function PaymentResult({ orderCode, cancelledHint, initial }: PaymentResultProps) {
  const router = useRouter()
  const { setCoins } = useCoins()
  const [status, setStatus] = useState<ActionResult<PaymentStatus> | null>(initial)
  const [checks, setChecks] = useState(0)
  const state = status?.success ? status.data.status : null

  useEffect(() => {
    if (orderCode === null || state !== 'PENDING' || checks >= MAX_CHECKS) return
    const timer = setTimeout(async () => {
      setStatus(await getPaymentStatus({ orderCode }))
      setChecks((n) => n + 1)
    }, POLL_MS)
    return () => clearTimeout(timer)
  }, [orderCode, state, checks])

  useEffect(() => {
    if (state !== 'PAID' || !status?.success) return
    if (status.data.totalCoins !== null) setCoins(status.data.totalCoins)
    router.refresh()
  }, [state, status, setCoins, router])

  let title: string
  let body: string
  if (orderCode === null || !status) {
    title = 'No order to show'
    body = 'This link has no order code.'
  } else if (!status.success) {
    title = 'We could not find this order'
    body = status.error.code === 'AUTH_UNAUTHORIZED' ? 'Sign in with the account that paid to see it.' : `${status.error.message}.`
  } else if (state === 'PAID') {
    title = `+${status.data.coins} 🪙 added!`
    body = `Your purse: ${status.data.totalCoins ?? '…'} 🪙.`
  } else if (state === 'CANCELLED') {
    title = 'Payment cancelled'
    body = 'Nothing was charged. You can buy coins again any time from the Coin Shop.'
  } else {
    title = cancelledHint ? 'Payment cancelled' : 'Waiting for your bank…'
    body =
      checks >= MAX_CHECKS
        ? 'Your bank has not confirmed the transfer yet. It will be added as soon as it does; you can leave this page.'
        : 'Checking with PayOS. This usually takes a few seconds.'
  }

  return (
    <div className="relative space-y-4 rounded-[24px] border-[3px] border-[#c9955e] bg-gradient-to-b from-[#fffcf3] to-[#f5dcb2] p-6 text-center shadow-[0_8px_0_#b07a45]">
      {state === 'PAID' && <ParticleBurst variant="gold" count={28} radius={170} />}
      <h1 className="font-game text-2xl font-extrabold text-[#5a2a02]">{title}</h1>
      <p role="status" aria-live="polite" className="text-sm text-amber-900/80">
        {body}
      </p>
      {orderCode !== null && <p className="text-xs text-amber-900/55">Order {orderCode}</p>}
      <GameButton asChild tone="leaf" size="lg" className="w-full">
        <Link href="/">Back to my garden</Link>
      </GameButton>
    </div>
  )
}

export { PaymentResult }
