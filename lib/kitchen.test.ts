import { describe, it, expect } from 'vitest'
import { KITCHEN, distanceKm, formatPinnedAddress, parsePinnedAddress } from './kitchen'

describe('kitchen helpers', () => {
  it('round-trips a pinned address', () => {
    const v = formatPinnedAddress('Magsaysay Ave, Naga City', 13.6301, 123.1851)
    expect(parsePinnedAddress(v)).toEqual({ address: 'Magsaysay Ave, Naga City', lat: 13.6301, lng: 123.1851 })
  })
  it('returns null for plain text', () => {
    expect(parsePinnedAddress('Some hall')).toBeNull()
  })
  it('computes distance', () => {
    expect(distanceKm(KITCHEN.lat, KITCHEN.lng, KITCHEN.lat, KITCHEN.lng)).toBe(0)
    expect(distanceKm(13.625, 123.18, 13.715, 123.18)).toBeGreaterThan(9.9)
  })
})
