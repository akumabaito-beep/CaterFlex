import type { MealType, MealPrepSelection, ScheduledDelivery } from './types';
export type { MealType } from './types';
export const MEAL_TYPES: { value: MealType; label: string; hint: string }[] = [
  { value: 'breakfast', label: 'Breakfast', hint: 'Morning meals' },
  { value: 'lunch', label: 'Lunch', hint: 'Midday meals' },
  { value: 'dinner', label: 'Dinner', hint: 'Evening meals' },
]


export const SUBSCRIPTION_WEEK_OPTIONS = [1, 2, 4] as const
export type SubscriptionWeeks = (typeof SUBSCRIPTION_WEEK_OPTIONS)[number]

/** 0 = Sunday ... 6 = Saturday (same numbers as Date#getUTCDay). */
export const WEEKDAYS = [
  { value: 0, short: 'Sun', label: 'Sunday' },
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
] as const

/** Monday-first order for showing days to people. */
export const WEEKDAYS_MON_FIRST = [...WEEKDAYS.slice(1), WEEKDAYS[0]] as const

export type MealPlanSelection = MealPrepSelection;

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


export type DeliveryDate = ScheduledDelivery;

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

/* ------------------------------------------------------------------ */
/* Subscription model: a plan LENGTH (1, 2 or 4 weeks) + chosen DAYS   */
/* ------------------------------------------------------------------ */

export const PLAN_WEEKS = [1, 2, 4] as const
export type PlanWeeks = (typeof PLAN_WEEKS)[number]

export function isPlanWeeks(v: unknown): v is PlanWeeks {
  return PLAN_WEEKS.includes(v as PlanWeeks)
}


export const PAUSE_CUTOFF_DAYS = 2 // same cutoff as skipping a delivery
export const MAX_PAUSE_DAYS = 14

export function parseDeliveryDays(value: unknown): number[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',')
  const days = raw.map((v) => String(v).trim()).filter((v) => v !== '').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

export function deliveryDaysToString(days: number[]): string {
  return parseDeliveryDays(days).join(',')
}

export function deliveryDaysLabel(days: number[]): string {
  const d = parseDeliveryDays(days)
  if (d.length === 0) return ''
  if (d.length === 7) return 'Every day'
  const set = new Set(d)
  if ([1, 2, 3, 4, 5].every((x) => set.has(x)) && d.length === 5) return 'Mon to Fri'
  return WEEKDAYS_MON_FIRST.filter((w) => set.has(w.value)).map((w) => w.short).join(', ')
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/** First delivery day on or after `from`. */
export function firstDeliveryOnOrAfter(from: string, days: number[]): string {
  const set = new Set(parseDeliveryDays(days))
  if (set.size === 0) return from
  let d = from
  for (let i = 0; i < 8; i++) {
    if (set.has(weekdayOf(d))) return d
    d = addDaysISO(d, 1)
  }
  return from
}

/** The delivery day after `date`. With no chosen days (older plans) it steps by the old weekly/bi-weekly gap. */
export function nextDeliveryAfter(date: string, days: number[], frequency?: string | null): string {
  if (parseDeliveryDays(days).length === 0) return addDaysISO(date, stepDays(frequency))
  return firstDeliveryOnOrAfter(addDaysISO(date, 1), days)
}

/** `count` delivery dates in a row, starting on the first chosen day on or after `start`. */
export function deliveryDates(start: string, count: number, days: number[]): string[] {
  const out: string[] = []
  let d = firstDeliveryOnOrAfter(start, days)
  while (out.length < count && out.length < 400) {
    out.push(d)
    d = nextDeliveryAfter(d, days)
  }
  return out
}

export function totalDeliveries(weeks: number, days: number[]): number {
  return Math.max(weeks, 0) * parseDeliveryDays(days).length
}

/** Date of the last delivery for a plan of `weeks` weeks on the chosen days. */
export function planEndDate(start: string, weeks: number, days: number[]): string {
  const dates = deliveryDates(start, totalDeliveries(weeks, days), days)
  return dates[dates.length - 1] ?? start
}

/** Deliveries from `from` up to and including `end` (works for new and older plans). */
export function scheduleDates(from: string, end: string, days: number[], frequency?: string | null, limit = 400): string[] {
  const out: string[] = []
  if (parseDeliveryDays(days).length === 0) return remainingDeliveries(from, end, frequency, limit)
  for (let d = firstDeliveryOnOrAfter(from, days); d <= end && out.length < limit; d = nextDeliveryAfter(d, days)) out.push(d)
  return out
}

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

export type PlanLike = {
  nextDate: string
  termEnd: string | null
  days: number[]
  frequency?: string | null
}

/**
 * PAUSE / RESUME: every paid delivery is kept. The deliveries that are left start again on
 * `resumeFrom` (or the next chosen day after it), so the end date moves out by the pause.
 */
export function rescheduleAfterPause(plan: PlanLike, resumeFrom: string): { nextDate: string; termEnd: string } | null {
  if (!plan.termEnd) return null
  const left = scheduleDates(plan.nextDate, plan.termEnd, plan.days, plan.frequency).length
  if (left === 0) return null
  if (parseDeliveryDays(plan.days).length === 0) {
    // older plans: keep the same weekday rhythm, just push everything back whole steps
    const step = stepDays(plan.frequency)
    const next = nextAlignedDate(plan.nextDate, resumeFrom, plan.frequency)
    return { nextDate: next, termEnd: addDaysISO(next, (left - 1) * step) }
  }
  const dates = deliveryDates(resumeFrom, left, plan.days)
  return { nextDate: dates[0], termEnd: dates[dates.length - 1] }
}

/** CANCEL: deliveries inside the cutoff are treated as committed; the rest are refunded at the locked price. */
export function cancellationRefund(args: {
  nextDate: string
  termEnd: string | null
  days: number[]
  frequency?: string | null
  today: string
  pricePerServing: number
  servings: number
  deliveryFee: number
}): { refundedDeliveries: number; committedDeliveries: number; refund: number } {
  if (!args.termEnd) return { refundedDeliveries: 0, committedDeliveries: 0, refund: 0 }
  const cutoff = addDaysISO(args.today, PAUSE_CUTOFF_DAYS)
  const all = scheduleDates(args.nextDate, args.termEnd, args.days, args.frequency)
  const refunded = all.filter((d) => d >= cutoff).length
  const perDelivery = cycleTotal(args.pricePerServing, args.servings, args.deliveryFee)
  return {
    refundedDeliveries: refunded,
    committedDeliveries: all.length - refunded,
    refund: Math.round(refunded * perDelivery * 100) / 100,
  }
}

/** The inquiry page stores the subscription choices on the booking draft. */
export function readSubscriptionDraft(draft: object): { mealType: MealType; planWeeks: PlanWeeks; deliveryDays: number[] } {
  const d = draft as { mealType?: unknown; planWeeks?: unknown; deliveryDays?: unknown }
  const days = parseDeliveryDays(d.deliveryDays)
  return {
    mealType: isMealType(d.mealType) ? d.mealType : 'lunch',
    planWeeks: isPlanWeeks(d.planWeeks) ? d.planWeeks : 2,
    deliveryDays: days.length ? days : [1, 2, 3, 4, 5],
  }
}
