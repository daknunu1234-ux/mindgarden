'use client'

import { usePaymentDialog } from '@/shared/stores/PaymentDialogProvider'
import { cn } from '@/shared/utils/cn'
import type { Membership } from '../lib/plans'

type UpgradeButtonProps = { membership: Membership; paymentsEnabled: boolean; className?: string }

// Header pill: "⭐ Pro" for a Pro gardener (opens the dialog to extend it or buy coins), "⭐ Upgrade"
// for everyone else when this server takes payments; nothing when it doesn't and they aren't Pro.
function UpgradeButton({ membership, paymentsEnabled, className }: UpgradeButtonProps) {
  const { open } = usePaymentDialog()
  if (!membership.isPro && !paymentsEnabled) return null
  const until = membership.lifetime ? 'Pro for life' : membership.proUntil ? `Pro until ${new Date(membership.proUntil).toLocaleDateString('vi-VN')}` : ''
  return (
    <button
      type="button"
      onClick={() => open(membership.isPro ? (membership.lifetime ? 'coins-100' : 'pro-1m') : 'pro-1m')}
      title={membership.isPro ? until : 'Upgrade to Pro or buy coins'}
      aria-label={membership.isPro ? `${until}. Open the upgrade shop` : 'Upgrade to Pro or buy coins'}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1 rounded-full border-2 px-2.5 font-game text-sm font-extrabold shadow-[0_2px_0_rgba(69,26,3,0.45)] focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none',
        membership.isPro ? 'border-yellow-600 bg-gradient-to-b from-yellow-200 to-amber-400 text-[#5a2a02]' : 'border-amber-950/40 bg-amber-50/95 text-amber-900 hover:bg-white',
        className,
      )}
    >
      <span aria-hidden>⭐</span>
      <span>{membership.isPro ? 'Pro' : 'Upgrade'}</span>
    </button>
  )
}

export { UpgradeButton }
