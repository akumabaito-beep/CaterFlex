import { addDaysISO } from './meal-plan'

/**
 * Helpers for fixing unavailable meal-plan delivery dates without the customer
 * losing servings. Pure functions so they can be tested without the page.
 */

export type DeliverySlot = { date: string; subscriptionWeek: number }

export type DateSuggestion = { date: string; onPreferredDay: boolean }

const DAY_MS = 86_400_000

function dayDiff(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS
  )
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

/** Which plan week a date falls in, counted from the start date (1 to `weeks`). */
export function weekForDate(start: string, date: string, weeks: number): number {
  const week = Math.floor(dayDiff(start, date) / 7) + 1
  return Math.min(Math.max(week, 1), Math.max(weeks, 1))
}

/**
 * Open dates close to `original`, so a delivery can be moved instead of dropped.
 * Dates on the customer's chosen delivery days come first, then the nearest others.
 * Dates already in the schedule and dates before the plan start are skipped.
 */
export function suggestDates(args: {
  original: string
  planStart: string
  taken: Iterable<string>
  preferredDays: number[]
  isAvailable: (date: string) => boolean
  limit?: number
  daysBefore?: number
  daysAfter?: number
}): DateSuggestion[] {
  const {
    original,
    planStart,
    preferredDays,
    isAvailable,
    limit = 3,
    daysBefore = 2,
    daysAfter = 21,
  } = args
  const taken = new Set(args.taken)
  const found: (DateSuggestion & { distance: number })[] = []

  for (let offset = -daysBefore; offset <= daysAfter; offset++) {
    const date = addDaysISO(original, offset)
    if (date < planStart || date === original || taken.has(date)) continue
    if (!isAvailable(date)) continue
    found.push({
      date,
      onPreferredDay: preferredDays.includes(weekdayOf(date)),
      distance: Math.abs(offset),
    })
  }

  found.sort((a, b) => {
    if (a.onPreferredDay !== b.onPreferredDay) return a.onPreferredDay ? -1 : 1
    return a.distance - b.distance || a.date.localeCompare(b.date)
  })

  return found
    .slice(0, limit)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ date, onPreferredDay }) => ({ date, onPreferredDay }))
}

/** First open date on a chosen delivery day after the last scheduled delivery. */
export function nextDateAfterPlanEnd(args: {
  lastDate: string
  taken: Iterable<string>
  preferredDays: number[]
  isAvailable: (date: string) => boolean
  searchDays?: number
}): string | null {
  // No plan start yet (empty form on first render): nothing to search from.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.lastDate)) return null

  const taken = new Set(args.taken)
  const searchDays = args.searchDays ?? 42

  for (let offset = 1; offset <= searchDays; offset++) {
    const date = addDaysISO(args.lastDate, offset)
    if (taken.has(date)) continue
    if (!args.preferredDays.includes(weekdayOf(date))) continue
    if (args.isAvailable(date)) return date
  }

  return null
}

/**
 * Move every unavailable delivery to the nearest open date.
 * Returns the new dates by delivery index, and the indexes that could not be moved.
 */
export function autoMoveUnavailable(args: {
  deliveries: { index: number; date: string }[]
  planStart: string
  preferredDays: number[]
  isAvailable: (date: string) => boolean
}): { moves: Record<number, string>; stuck: number[] } {
  const { deliveries, planStart, preferredDays, isAvailable } = args
  const taken = new Set(deliveries.map((delivery) => delivery.date))
  const moves: Record<number, string> = {}
  const stuck: number[] = []

  for (const delivery of deliveries) {
    if (isAvailable(delivery.date)) continue

    const [best] = suggestDates({
      original: delivery.date,
      planStart,
      taken,
      preferredDays,
      isAvailable,
      limit: 1,
    })

    if (!best) {
      stuck.push(delivery.index)
      continue
    }

    taken.delete(delivery.date)
    taken.add(best.date)
    moves[delivery.index] = best.date
  }

  return { moves, stuck }
}

/**
 * When a lot of dates are unavailable, look for a later start date where the whole plan fits.
 * Returns null when no later start (within `maxShiftDays`) has fewer blocked dates than today.
 */
export function findBetterStart(args: {
  currentStart: string
  generate: (start: string) => DeliverySlot[]
  isAvailable: (date: string) => boolean
  maxShiftDays?: number
}): { start: string; blocked: number } | null {
  const maxShiftDays = args.maxShiftDays ?? 21
  const countBlocked = (start: string) =>
    args.generate(start).filter((slot) => !args.isAvailable(slot.date)).length

  const currentBlocked = countBlocked(args.currentStart)
  if (currentBlocked === 0) return null

  let best: { start: string; blocked: number } | null = null

  for (let shift = 1; shift <= maxShiftDays; shift++) {
    const start = addDaysISO(args.currentStart, shift)
    const blocked = countBlocked(start)
    if (blocked >= currentBlocked) continue
    if (!best || blocked < best.blocked) best = { start, blocked }
    if (blocked === 0) break
  }

  return best
}

/** True when enough of the plan is blocked that moving dates one by one is the wrong tool. */
export function tooManyUnavailable(blocked: number, total: number): boolean {
  return total > 0 && blocked >= 3 && blocked / total >= 0.25
}
