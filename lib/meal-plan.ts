
export type MealType = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_TYPES: { value: MealType; label: string; hint: string }[] = [
  { value: 'breakfast', label: 'Breakfast', hint: 'Morning meals' },
  { value: 'lunch', label: 'Lunch', hint: 'Midday meals' },
  { value: 'dinner', label: 'Dinner', hint: 'Evening meals' },
]


export const SUBSCRIPTION_WEEK_OPTIONS = [1, 2, 4] as const
export type SubscriptionWeeks = (typeof SUBSCRIPTION_WEEK_OPTIONS)[number]

export const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

export type MealPlanSelection = {
  mealType: MealType
  menuItemId: number
  quantity: number
}

export function isSubscriptionWeeks(
  value: unknown
): value is SubscriptionWeeks {
  return SUBSCRIPTION_WEEK_OPTIONS.includes(
    value as SubscriptionWeeks
  )
}

export function isValidDeliveryDays(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (day) =>
        Number.isInteger(day) &&
        day >= 0 &&
        day <= 6
    ) &&
    new Set(value).size === value.length
  )
}

/** Generate delivery dates from a start date, selected weekdays, and term length. */

/** Generate delivery dates based on the selected weekdays and subscription duration. */
export function generateDeliveryDates(
  startDate: string,
  weekdays: number[],
  subscriptionWeeks: SubscriptionWeeks
): { date: string; subscriptionWeek: number }[] {
  if (!isValidDeliveryDays(weekdays)) return []
  if (!isSubscriptionWeeks(subscriptionWeeks)) return []

  const dates: { date: string; subscriptionWeek: number }[] = []
  const startDay = new Date(`${startDate}T12:00:00Z`).getUTCDay()

  for (let week = 1; week <= subscriptionWeeks; week++) {
    for (const weekday of weekdays) {
      const offset = (weekday - startDay + 7) % 7
      const date = addDaysISO(
        addDaysISO(startDate, (week - 1) * 7),
        offset
      )

      dates.push({
        date,
        subscriptionWeek: week,
      })
    }
  }

  return dates.sort((a, b) => a.date.localeCompare(b.date))
}


export type DeliveryDate = {
  date: string
  subscriptionWeek: number
}

/** Calculate total servings for one dish across all scheduled deliveries. */
export function totalDishServings(
  quantityPerDelivery: number,
  deliveryCount: number
): number {
  if (
    !Number.isInteger(quantityPerDelivery) ||
    quantityPerDelivery <= 0 ||
    !Number.isInteger(deliveryCount) ||
    deliveryCount < 0
  ) {
    return 0
  }

  return quantityPerDelivery * deliveryCount
}

/** Count generated deliveries for each subscription week. */
export function countDeliveriesPerWeek(
  deliveries: DeliveryDate[]
): Record<number, number> {
  return deliveries.reduce<Record<number, number>>((counts, delivery) => {
    counts[delivery.subscriptionWeek] =
      (counts[delivery.subscriptionWeek] ?? 0) + 1

    return counts
  }, {})
}

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
export function termEndDate(
  start: string,
  frequency: string,
  cycles: number
): string {
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
