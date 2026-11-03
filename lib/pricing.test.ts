import { describe, it, expect } from 'vitest'
import { deliveryFeeForKm, estimateOrder } from './pricing'
import { formatPinnedAddress } from './kitchen'

describe('pricing', () => {
  it('rounds delivery fee up to nearest 5', () => {
    expect(deliveryFeeForKm(0)).toBe(50)
    expect(deliveryFeeForKm(2)).toBe(80)
    expect(deliveryFeeForKm(2.1)).toBe(85)
  })
  it('estimates food x servings plus delivery', () => {
    const venue = formatPinnedAddress('Somewhere', 13.625025, 123.180531)
    const e = estimateOrder({ itemPrices: [100, 50], servings: 10, venue, delivers: true })
    expect(e.foodSubtotal).toBe(1500)
    expect(e.deliveryFee).toBe(50)
    expect(e.total).toBe(1550)
  })
  it('no fee when pickup', () => {
    const e = estimateOrder({ itemPrices: [100], servings: 2, venue: '', delivers: false })
    expect(e.total).toBe(200)
  })
})
