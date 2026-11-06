import {
  PAUSE_CUTOFF_DAYS,
  addDaysISO,
  daysBetween,
  parseDeliveryDays,
  rescheduleAfterPause,
  scheduleDates,
} from './meal-plan'
import { syncDeliveries } from './meal-plan-deliveries'

type Row = Record<string, any>

export function todayInManilaISO(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

/**
 * Resume a paused plan. The deliveries that are left start again on the first chosen day on or after
 * `resumeFrom`, so no paid delivery is lost and the end date moves out by the length of the pause.
 */
export async function resumePausedPlan(admin: any, plan: Row, resumeFrom: string, today = todayInManilaISO()) {
  const earliest = addDaysISO(today, PAUSE_CUTOFF_DAYS)
  const from = resumeFrom < earliest ? earliest : resumeFrom
  const rescheduled = rescheduleAfterPause(
    {
      nextDate: String(plan.NextFulfillmentDate).slice(0, 10),
      termEnd: plan.TermEndDate ? String(plan.TermEndDate).slice(0, 10) : null,
      days: parseDeliveryDays(plan.DeliveryDays),
      frequency: plan.RecurrencePattern,
    },
    from
  )
  const pausedFrom = plan.PausedFrom ? String(plan.PausedFrom).slice(0, 10) : today
  const pausedDays = rescheduled ? Math.max(daysBetween(String(plan.NextFulfillmentDate).slice(0, 10), rescheduled.nextDate), 0) : 0
  const update: Row = rescheduled
    ? { Status: 'active', NextFulfillmentDate: rescheduled.nextDate, TermEndDate: rescheduled.termEnd }
    : { Status: 'ended' } // nothing left to deliver
  update.PausedFrom = null
  update.PausedUntil = null
  update.PausedDays = Number(plan.PausedDays ?? 0) + (rescheduled ? pausedDays : 0)
  void pausedFrom
  const result = await admin.from('MEAL_PREP_ORDER').update(update).eq('MealPrepOrderID', plan.MealPrepOrderID)
  if (!result.error && rescheduled && rescheduled.termEnd) {
    const days = parseDeliveryDays(plan.DeliveryDays)
    await syncDeliveries(admin, Number(plan.MealPrepOrderID), scheduleDates(rescheduled.nextDate, rescheduled.termEnd, days, plan.RecurrencePattern), { perWeek: days.length || 1 })
  }
  return result
}

/** Resume every paused plan whose return date has arrived. Safe to call often. */
export async function resumeDuePlans(admin: any, today = todayInManilaISO(), onlyCustomerId?: number) {
  let query = admin
    .from('MEAL_PREP_ORDER')
    .select('MealPrepOrderID, CustomerID, Status, NextFulfillmentDate, TermEndDate, RecurrencePattern, DeliveryDays, PausedFrom, PausedUntil, PausedDays')
    .eq('Status', 'paused')
    .not('PausedUntil', 'is', null)
    .lte('PausedUntil', today)
  if (onlyCustomerId !== undefined) query = query.eq('CustomerID', onlyCustomerId)
  const { data } = await query
  const due = (data ?? []).filter(
    (plan: Row) => String(plan.Status).toLowerCase() === 'paused' && /^\d{4}-\d{2}-\d{2}/.test(String(plan.PausedUntil ?? '')) && String(plan.PausedUntil).slice(0, 10) <= today
  )
  for (const plan of due) await resumePausedPlan(admin, plan, String(plan.PausedUntil).slice(0, 10), today)
  return due.length
}
