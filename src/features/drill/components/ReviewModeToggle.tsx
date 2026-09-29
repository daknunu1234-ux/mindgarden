import Link from 'next/link'
import { cn } from '@/shared/utils/cn'

type ReviewModeToggleProps = {
  on: boolean
  // Where the switch leads (same round with review mode flipped).
  href: string
  // Mastered items this round would rest / mix in.
  masteredCount: number
  className?: string
}

// "Include Mastered Items (Review Mode)": a chunky switch rendered as a link, so the mode lives in
// the URL (?review=1), survives refreshes and works without client JS.
function ReviewModeToggle({ on, href, masteredCount, className }: ReviewModeToggleProps) {
  return (
    <Link
      href={href}
      role="switch"
      aria-checked={on}
      className={cn(
        'group inline-flex items-center gap-3 rounded-full border-[3px] border-[#b98a5a] bg-gradient-to-b from-white to-[#fff6e6] py-1.5 pr-4 pl-1.5 font-game text-sm font-extrabold text-[#4a2511] shadow-[inset_0_2px_0_rgba(255,255,255,0.9),0_4px_0_#b98a5a] transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none active:translate-y-0.5',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full border-[3px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] transition-colors',
          on ? 'border-emerald-700 bg-emerald-500' : 'border-stone-400 bg-stone-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-[18px] rounded-full border-2 border-white bg-gradient-to-b from-white to-stone-100 shadow-[0_2px_0_rgba(0,0,0,0.25)] transition-[left] duration-200 ease-[cubic-bezier(.34,1.56,.64,1)]',
            on ? 'left-[21px]' : 'left-0.5',
          )}
        />
      </span>
      <span className="text-left leading-tight">
        🌿 Include Mastered Items
        <span className="block font-sans text-xs font-semibold text-[#8a5a2b]">
          Review Mode · {masteredCount} {masteredCount === 1 ? 'statement' : 'statements'} at 5/5 {on ? 'mixed in' : 'resting'}
        </span>
      </span>
    </Link>
  )
}

export { ReviewModeToggle }
