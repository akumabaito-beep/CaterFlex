// Kitchen location (Plus Code J5GJ+267, Naga City, Camarines Sur).
export const KITCHEN = { lat: 13.625025, lng: 123.180531, label: 'CaterFlex Kitchen, Naga City' }

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(bLat - aLat)
  const dLng = rad(bLng - aLng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Stored in the Venue/address text so no DB change is needed: "Address [pin: lat, lng]"
export function formatPinnedAddress(address: string, lat: number, lng: number): string {
  return `${address.trim()} [pin: ${lat.toFixed(6)}, ${lng.toFixed(6)}]`
}

export function parsePinnedAddress(value: string): { address: string; lat: number; lng: number } | null {
  const m = value.match(/^([\s\S]*?)\s*\[pin: (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)\]$/)
  return m ? { address: m[1], lat: Number(m[2]), lng: Number(m[3]) } : null
}
