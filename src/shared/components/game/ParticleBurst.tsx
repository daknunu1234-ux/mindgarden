import { cn } from '@/shared/utils/cn'
import { burstParticles } from './particles'

// A one-shot burst of leaves/sparkles from the centre of its (relative) parent. Re-mount it
// (change `key`) to replay. Hidden entirely for reduced-motion users (see globals.css).
function ParticleBurst({ count = 18, radius = 110, className }: { count?: number; radius?: number; className?: string }) {
  return (
    <span aria-hidden className={cn('pointer-events-none absolute inset-0 z-20 flex items-center justify-center', className)}>
      {burstParticles(count, radius).map((p, i) => (
        <span
          key={i}
          className="mg-burst absolute leading-none"
          style={
            {
              fontSize: p.size,
              '--mg-dx': `${p.dx}px`,
              '--mg-dy': `${p.dy}px`,
              '--mg-spin': `${p.spin}deg`,
              '--mg-delay': `${p.delay}s`,
            } as React.CSSProperties
          }
        >
          {p.glyph}
        </span>
      ))}
    </span>
  )
}

export { ParticleBurst }
