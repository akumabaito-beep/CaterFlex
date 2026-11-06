import { PAUSE_CUTOFF_DAYS, addDaysISO, cycleTotal, parseDeliveryDays } from './meal-plan'

/**
 * Keeps John's per-delivery rows (MEAL_PREP_DELIVERY) and the weekly payment rows
 * (MEAL_PREP_PAYMENT) in step with what the customer does to a plan (skip, pause/resume, renew,
 * cancel). Only rows with Status 'scheduled' are ever changed, so delivered / past rows are safe.
 * Every function returns an error string instead of throwing; the plan itself is already saved
 * by the caller, so a failure here is logged and never blocks the customer.
 */

type Row = Record<string, any>
export type DeliveryRow = { DeliveryID: number; DeliveryDate: string; SubscriptionWeek: number }

export type SyncPlan = {
  moves: { id: number; date: string }[]
  inserts: string[]
  dropIds: number[]
}

/** Pure: line the scheduled rows up with the target dates (both in date order). */
export function planSync(rows: DeliveryRow[], dates: string[]): SyncPlan {
  const sorted = [...rows].sort((a, b) => String(a.DeliveryDate).localeCompare(String(b.DeliveryDate)) || a.DeliveryID - b.DeliveryID)
  const moves: SyncPlan['moves'] = []
  for (let i = 0; i < Math.min(sorted.length, dates.length); i++) {
    if (String(sorted[i].DeliveryDate).slice(0, 10) !== dates[i]) moves.push({ id: sorted[i].DeliveryID, date: dates[i] })
  }
  return {
    moves,
    inserts: dates.slice(sorted.length),
    dropIds: sorted.slice(dates.length).map((r) => r.DeliveryID),
  }
}

/** Pure: the subscription week (1-based) of the delivery at `index` (0-based) in the whole plan. */
export function weekOfDelivery(index: number, perWeek: number): number {
  return Math.floor(index / Math.max(perWeek, 1)) + 1
}

/** Pure: which pending weekly payments a cancellation cancels (the ones not yet due within the cutoff). */
export function paymentsToCancel(payments: { PaymentID: number; DueDate: string; PaymentStatus: string }[], today: string): number[] {
  const cutoff = addDaysISO(today, PAUSE_CUTOFF_DAYS)
  return payments
    .filter((p) => String(p.PaymentStatus).toLowerCase() === 'pending' && String(p.DueDate).slice(0, 10) >= cutoff)
    .map((p) => p.PaymentID)
}

async function scheduledRows(admin: any, orderId: number): Promise<{ rows: DeliveryRow[]; error?: string }> {
  const { data, error } = await admin
    .from('MEAL_PREP_DELIVERY')
    .select('DeliveryID, DeliveryDate, SubscriptionWeek')
    .eq('MealPrepOrderID', orderId)
    .eq('Status', 'scheduled')
    .order('DeliveryDate', { ascending: true })
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []).map((r: Row) => ({ DeliveryID: Number(r.DeliveryID), DeliveryDate: String(r.DeliveryDate).slice(0, 10), SubscriptionWeek: Number(r.SubscriptionWeek ?? 1) })) }
}

function fail(where: string, message?: string): string | undefined {
  if (!message) return undefined
  console.error(`MEAL_PREP_DELIVERY ${where} failed:`, message)
  return message
}

/**
 * Make the scheduled rows match `dates`. Extra rows are marked `dropStatus`; missing rows are
 * inserted (continuing the subscription week count). Used after resume, skip and renew.
 */
export async function syncDeliveries(
  admin: any,
  orderId: number,
  dates: string[],
  opts: { time?: string | null; perWeek?: number; dropStatus?: string } = {}
): Promise<string | undefined> {
  const { rows, error } = await scheduledRows(admin, orderId)
  if (error) return fail('read', error)
  const plan = planSync(rows, dates)
  for (const m of plan.moves) {
    const r = await admin.from('MEAL_PREP_DELIVERY').update({ DeliveryDate: m.date }).eq('DeliveryID', m.id)
    if (r.error) return fail('move', r.error.message)
  }
  if (plan.dropIds.length) {
    const r = await admin.from('MEAL_PREP_DELIVERY').update({ Status: opts.dropStatus ?? 'cancelled' }).in('DeliveryID', plan.dropIds)
    if (r.error) return fail('drop', r.error.message)
  }
  if (plan.inserts.length) {
    const all = await admin.from('MEAL_PREP_DELIVERY').select('DeliveryID', { count: 'exact', head: true }).eq('MealPrepOrderID', orderId)
    if (all.error) return fail('count', all.error.message)
    let index = Number(all.count ?? rows.length)
    const perWeek = opts.perWeek ?? 1
    const insert = plan.inserts.map((date) => ({
      MealPrepOrderID: orderId,
      OriginalDeliveryDate: date,
      DeliveryDate: date,
      DeliveryTime: opts.time ?? null,
      SubscriptionWeek: weekOfDelivery(index++, perWeek),
      Status: 'scheduled',
    }))
    const r = await admin.from('MEAL_PREP_DELIVERY').insert(insert)
    if (r.error) return fail('insert', r.error.message)
  }
  return undefined
}

/** Skip: the earliest scheduled delivery is marked skipped. Call syncDeliveries afterwards. */
export async function markFirstSkipped(admin: any, orderId: number): Promise<string | undefined> {
  const { rows, error } = await scheduledRows(admin, orderId)
  if (error) return fail('read', error)
  if (rows.length === 0) return undefined
  const r = await admin.from('MEAL_PREP_DELIVERY').update({ Status: 'skipped' }).eq('DeliveryID', rows[0].DeliveryID)
  return fail('skip', r.error?.message)
}

/** Cancel: scheduled deliveries after the 2-day cutoff are cancelled; ones inside it stay (already prepared). */
export async function cancelDeliveries(admin: any, orderId: number, today: string): Promise<string | undefined> {
  const cutoff = addDaysISO(today, PAUSE_CUTOFF_DAYS)
  const r = await admin
    .from('MEAL_PREP_DELIVERY')
    .update({ Status: 'cancelled' })
    .eq('MealPrepOrderID', orderId)
    .eq('Status', 'scheduled')
    .gte('DeliveryDate', cutoff)
  return fail('cancel', r.error?.message)
}

/** Cancel: weekly payments not yet due inside the cutoff and still unpaid are cancelled. */
export async function cancelPendingPayments(admin: any, orderId: number, today: string): Promise<string | undefined> {
  const { data, error } = await admin.from('MEAL_PREP_PAYMENT').select('PaymentID, DueDate, PaymentStatus').eq('MealPrepOrderID', orderId)
  if (error) return fail('payment read', error.message)
  const ids = paymentsToCancel(data ?? [], today)
  if (ids.length === 0) return undefined
  const r = await admin.from('MEAL_PREP_PAYMENT').update({ PaymentStatus: 'cancelled' }).in('PaymentID', ids)
  return fail('payment cancel', r.error?.message)
}

/** Renew: add one pending weekly payment for each new subscription week. */
export async function addRenewalPayments(
  admin: any,
  orderId: number,
  newDates: string[],
  perWeek: number,
  amounts: { pricePerServing: number; servings: number; deliveryFee: number }
): Promise<string | undefined> {
  if (newDates.length === 0) return undefined
  const last = await admin.from('MEAL_PREP_PAYMENT').select('SubscriptionWeek').eq('MealPrepOrderID', orderId).order('SubscriptionWeek', { ascending: false }).limit(1)
  if (last.error) return fail('payment read', last.error.message)
  const firstWeek = Number(last.data?.[0]?.SubscriptionWeek ?? 0) + 1
  const perDelivery = cycleTotal(amounts.pricePerServing, amounts.servings, amounts.deliveryFee)
  const byWeek = new Map<number, string[]>()
  newDates.forEach((d, i) => {
    const week = firstWeek + Math.floor(i / Math.max(perWeek, 1))
    byWeek.set(week, [...(byWeek.get(week) ?? []), d])
  })
  const rows = Array.from(byWeek.entries()).map(([week, ds]) => ({
    MealPrepOrderID: orderId,
    SubscriptionWeek: week,
    AmountDue: Math.round(perDelivery * ds.length * 100) / 100,
    DueDate: addDaysISO([...ds].sort()[0], -2),
    PaymentStatus: 'pending',
  }))
  const r = await admin.from('MEAL_PREP_PAYMENT').insert(rows)
  return fail('payment insert', r.error?.message)
}

export { parseDeliveryDays }
