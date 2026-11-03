import { KITCHEN, distanceKm, parsePinnedAddress } from './kitchen'

// Edit these to change delivery pricing (pesos).
export const DELIVERY_BASE_FEE = 50
export const DELIVERY_FEE_PER_KM = 15
export const DELIVERY_FEE_ROUNDING = 5
export const MAX_DELIVERY_KM = 30

export function deliveryFeeForKm(km: number): number {
  const raw = DELIVERY_BASE_FEE + DELIVERY_FEE_PER_KM * Math.max(0, km)
  return Math.ceil(raw / DELIVERY_FEE_ROUNDING) * DELIVERY_FEE_ROUNDING
}

export function deliveryFeeForVenue(venue: string): { km: number; fee: number; withinRange: boolean } | null {
  const pin = parsePinnedAddress(venue)
  if (!pin) return null
  const km = distanceKm(KITCHEN.lat, KITCHEN.lng, pin.lat, pin.lng)
  return { km, fee: deliveryFeeForKm(km), withinRange: km <= MAX_DELIVERY_KM }
}

export type Estimate = {
  foodSubtotal: number
  deliveryFee: number
  total: number
  servings: number
  perServing: number
  distanceKm: number | null
  withinRange: boolean
}

/** Food = (sum of selected dish prices) x servings. Matches how bookings store Quantity = guest count. */
export function estimateOrder(input: {
  itemPrices: number[]
  servings: number
  venue: string
  delivers: boolean
}): Estimate {
  const perServing = input.itemPrices.reduce((a, b) => a + b, 0)
  const servings = Math.max(0, input.servings)
  const foodSubtotal = perServing * servings
  const d = input.delivers ? deliveryFeeForVenue(input.venue) : null
  const deliveryFee = d?.fee ?? 0
  return {
    foodSubtotal,
    deliveryFee,
    total: foodSubtotal + deliveryFee,
    servings,
    perServing,
    distanceKm: d?.km ?? null,
    withinRange: d?.withinRange ?? true,
  }
}
