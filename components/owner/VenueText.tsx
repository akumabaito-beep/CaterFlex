import { MapPin } from 'lucide-react'
import { parsePinnedAddress } from '../../lib/kitchen'

// Shows a venue without the raw "[pin: lat, lng]" suffix and, when a pin was
// saved, adds a "View map" link on its own line under the address.
export function VenueText({ value, className = '' }: { value: string | null | undefined; className?: string }) {
  if (!value) return <span className={className}>No venue provided</span>
  const pinned = parsePinnedAddress(value)
  if (!pinned) return <span className={className}>{value}</span>
  const href = `https://www.openstreetmap.org/?mlat=${pinned.lat}&mlon=${pinned.lng}#map=17/${pinned.lat}/${pinned.lng}`
  return (
    <span className={className}>
      {pinned.address}
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-1 flex w-fit items-center gap-1 whitespace-nowrap text-sm font-medium text-[#C8431B] hover:underline"
      >
        <MapPin className="size-3.5" />View map
      </a>
    </span>
  )
}
