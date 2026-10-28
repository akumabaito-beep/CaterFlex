import { WalkingLoader } from '@/components/ui/WalkingLoader'

// Shown by Next.js while a route is loading. Place at app/loading.tsx.
export default function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <WalkingLoader height={220} />
    </div>
  )
}