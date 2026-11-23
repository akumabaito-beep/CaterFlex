import { WalkingLoader } from '@/components/ui/WalkingLoader'

/** Centered CaterFlex logo animation for a page or panel that is still loading. */
export function PageLoader({ label = 'Loading', compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center justify-center ${compact ? 'py-6' : 'min-h-[50vh] py-12'}`}>
      <WalkingLoader height={compact ? 84 : 150} label={label} showLabel={!compact} />
    </div>
  )
}
