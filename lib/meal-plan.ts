import type { MealPrepFrequency } from '@/lib/types'

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_TYPES: { value: MealType; label: string; hint: string }[] = [
  { value: 'breakfast', label: 'Breakfast', hint: 'Morning meals' },
  { value: 'lunch', label: 'Lunch', hint: 'Midday meals' },
  { value: 'dinner', label: 'Dinner', hint: 'Evening meals' },
]

export const TERM_OPTIONS = [4, 8, 12] as const
export type TermCycles = (typeof TERM_OPTIONS)[number]

export function isMealType(v: unknown): v is MealType {
  return v === 'breakfast' || v === 'lunch' || v === 'dinner'
}
export function isTermCycles(v: unknown): v is TermCycles {
  return TERM_OPTIONS.includes(v as TermCycles)
}

export function mealTypeLabel(v: string | null | undefined): string {
  return MEAL_TYPES.find((m) => m.value === v)?.label ?? 'Meal'
}

export function frequencyLabel(f: string | null | undefined): string {
  return f === 'biweekly' ? 'Every 2 weeks' : 'Weekly'
}

export function stepDays(f: string | null | undefined): number {
  return f === 'biweekly' ? 14 : 7
}

/** "Dinner meal plan", "Lunch meal plan" ... */
export function planTitle(mealType: string | null | undefined): string {
  return mealType ? `${mealTypeLabel(mealType)} meal plan` : 'Meal plan'
}

export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Date of the last delivery in a term that starts on `start` and has `cycles` deliveries. */
export function termEndDate(start: string, frequency: MealPrepFrequency | string, cycles: number): string {
  return addDaysISO(start, (Math.max(cycles, 1) - 1) * stepDays(frequency))
}

/** Delivery dates from `next` up to and including `end`. */
export function remainingDeliveries(next: string, end: string, frequency: string | null | undefined, limit = 60): string[] {
  const out: string[] = []
  const step = stepDays(frequency)
  for (let d = next; d <= end && out.length < limit; d = addDaysISO(d, step)) out.push(d)
  return out
}

export function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
}

export type PlanState = 'pending' | 'active' | 'paused' | 'ended' | 'cancelled' | 'rejected'

/** A plan whose last delivery date has passed is "ended" until the customer renews it. */
export function planState(status: string | null | undefined, termEnd: string | null | undefined, today: string): PlanState {
  const s = String(status ?? '').toLowerCase()
  if (s === 'cancelled' || s === 'rejected' || s === 'pending') return s
  if (termEnd && termEnd < today) return 'ended'
  if (s === 'paused') return 'paused'
  return 'active'
}

export function cycleTotal(pricePerServing: number, servings: number, deliveryFee: number): number {
  return pricePerServing * servings + deliveryFee
}

/** First delivery date on or after `today` that is aligned to the plan schedule. */
export function nextAlignedDate(from: string, today: string, frequency: string | null | undefined): string {
  const step = stepDays(frequency)
  let d = from
  let guard = 0
  while (d < today && guard++ < 520) d = addDaysISO(d, step)
  return d
}

/** The inquiry page stores the subscription choices on the booking draft. */
export function readMealPlanDraft(draft: object): { mealType: MealType; termCycles: TermCycles } {
  const d = draft as { mealType?: unknown; termCycles?: unknown }
  return {
    mealType: isMealType(d.mealType) ? d.mealType : 'lunch',
    termCycles: isTermCycles(d.termCycles) ? d.termCycles : 4,
  }
}
