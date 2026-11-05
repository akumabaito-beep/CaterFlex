'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { deliveryFeeForVenue } from '../../lib/pricing'
import {
  MAX_PAUSE_DAYS,
  PAUSE_CUTOFF_DAYS,
  addDaysISO,
  cancellationRefund,
  daysBetween,
  deliveryDaysToString,
  deliveryDates,
  firstDeliveryOnOrAfter,
  isMealType,
  isPlanWeeks,
  nextDeliveryAfter,
  parseDeliveryDays,
  planEndDate,
  scheduleDates,
  totalDeliveries,
  type MealType,
} from '../../lib/meal-plan'
import { resumeDuePlans, resumePausedPlan } from '../../lib/meal-plan-resume'

const SKIP_CUTOFF_DAYS = PAUSE_CUTOFF_DAYS
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

const PLAN_FIELDS =
  'MealPrepOrderID, CustomerID, OperatorID, RecurrencePattern, MealsPerCycle, Status, NextFulfillmentDate, MealType, TermCycles, TermEndDate, RenewedCount, FulfillmentMethod, FulfillmentTime, DeliveryAddress, DeliveryFee, PricePerServing, SkippedCount, PlanWeeks, DeliveryDays, PausedFrom, PausedUntil, PausedDays, RefundAmount, CancelledAt'

type Fail = { ok: false; error: string }

type Loaded =
  | { error: string }
  | { error?: undefined; admin: ReturnType<typeof createAdminClient>; plan: Record<string, any> }

async function loadOwnPlan(orderId: number): Promise<Loaded> {
  const customer = await requireRole('customer')
  if (!customer) return { error: 'Customer access required.' }
  if (!Number.isInteger(orderId) || orderId <= 0) return { error: 'Invalid meal plan.' }
  const admin = createAdminClient()
  const { data, error } = await admin.from('MEAL_PREP_ORDER').select(PLAN_FIELDS).eq('MealPrepOrderID', orderId).maybeSingle()
  if (error) return { error: error.message }
  if (!data || Number(data.CustomerID) !== Number(customer.id)) return { error: 'You are not authorized to change this meal plan.' }
  return { admin, plan: data }
}

/** Sum of the menu prices for a plan's dishes, read now. This is the price that gets locked. */
async function currentPricePerServing(
  admin: ReturnType<typeof createAdminClient>,
  orderId: number
): Promise<{ error: string; price?: undefined } | { error?: undefined; price: number }> {
  const { data: items, error } = await admin.from('MEAL_PREP_ITEM').select('MenuItemID').eq('MealPrepOrderID', orderId)
  if (error) return { error: error.message }
  const ids = (items ?? []).map((i) => Number(i.MenuItemID))
  if (ids.length === 0) return { error: 'This meal plan has no dishes.' }
  const { data: menu, error: menuError } = await admin.from('MENU_ITEM').select('MenuItemID, Price').in('MenuItemID', ids)
  if (menuError) return { error: menuError.message }
  return { price: (menu ?? []).reduce((sum, m) => sum + Number(m.Price ?? 0), 0) }
}

export type MealPlanDetailsInput = {
  mealType: string
  planWeeks: number
  deliveryDays: number[]
  fulfillmentMethod: string
  fulfillmentTime: string
  deliveryAddress?: string | null
}

/**
 * Called right after createMealPrepOrder. Saves the subscription details, calculates the
 * delivery fee on the server, and LOCKS the price per serving at today's menu prices.
 */
export async function saveMealPlanDetails(orderId: number, input: MealPlanDetailsInput): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded

  if (String(plan.Status) !== 'pending' || plan.MealType) return { ok: false, error: 'This meal plan was already set up.' }
  if (!isMealType(input.mealType)) return { ok: false, error: 'Choose breakfast, lunch or dinner.' }
  if (!isPlanWeeks(input.planWeeks)) return { ok: false, error: 'Choose a plan length of 1, 2 or 4 weeks.' }
  const days = parseDeliveryDays(input.deliveryDays)
  if (days.length === 0) return { ok: false, error: 'Choose at least one delivery day.' }
  if (!TIME_RE.test(input.fulfillmentTime)) return { ok: false, error: 'Choose a delivery time.' }
  const method = input.fulfillmentMethod === 'delivery' ? 'delivery' : 'pickup'

  let address: string | null = null
  let fee = 0
  if (method === 'delivery') {
    address = String(input.deliveryAddress ?? '').trim().slice(0, 500)
    const d = deliveryFeeForVenue(address)
    if (!address || !d) return { ok: false, error: 'Pin the delivery location on the map.' }
    fee = d.fee
  }

  const priced = await currentPricePerServing(admin, orderId)
  if (priced.error !== undefined) return { ok: false, error: priced.error }

  // the first delivery is the first chosen day on or after the date the customer picked
  const start = firstDeliveryOnOrAfter(String(plan.NextFulfillmentDate).slice(0, 10), days)
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({
      MealType: input.mealType as MealType,
      PlanWeeks: input.planWeeks,
      DeliveryDays: deliveryDaysToString(days),
      RecurrencePattern: 'weekly',
      NextFulfillmentDate: start,
      TermCycles: totalDeliveries(input.planWeeks, days),
      TermEndDate: planEndDate(start, input.planWeeks, days),
      FulfillmentMethod: method,
      FulfillmentTime: input.fulfillmentTime,
      DeliveryAddress: address,
      DeliveryFee: fee,
      PricePerServing: priced.price,
    })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type MealPlan = {
  id: number
  status: string
  frequency: 'weekly' | 'biweekly'
  servings: number
  nextDate: string
  mealType: string | null
  termCycles: number | null
  planWeeks: number | null
  days: number[]
  pausedUntil: string | null
  refund: number | null
  termEnd: string | null
  renewedCount: number
  skippedCount: number
  method: 'pickup' | 'delivery'
  time: string | null
  address: string | null
  deliveryFee: number
  pricePerServing: number | null
  dishes: { id: number; name: string }[]
}

export async function getMyMealPlans(): Promise<{ ok: true; plans: MealPlan[]; today: string } | (Fail & { plans: [] })> {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false, error: 'Customer access required.', plans: [] }
  const admin = createAdminClient()
  // plans whose planned return date has arrived start delivering again
  await resumeDuePlans(admin, todayInManila(), Number(customer.id))
  const { data: orders, error } = await admin
    .from('MEAL_PREP_ORDER')
    .select(PLAN_FIELDS)
    .eq('CustomerID', Number(customer.id))
    .order('MealPrepOrderID', { ascending: false })
  if (error) return { ok: false, error: error.message, plans: [] }

  const ids = (orders ?? []).map((o) => Number(o.MealPrepOrderID))
  const { data: items } = ids.length
    ? await admin.from('MEAL_PREP_ITEM').select('MealPrepOrderID, MenuItemID').in('MealPrepOrderID', ids)
    : { data: [] as { MealPrepOrderID: number; MenuItemID: number }[] }
  const menuIds = Array.from(new Set((items ?? []).map((i) => Number(i.MenuItemID))))
  const { data: menu } = menuIds.length
    ? await admin.from('MENU_ITEM').select('MenuItemID, ItemName').in('MenuItemID', menuIds)
    : { data: [] as { MenuItemID: number; ItemName: string }[] }
  const names = new Map((menu ?? []).map((m) => [Number(m.MenuItemID), String(m.ItemName)]))

  const plans: MealPlan[] = (orders ?? []).map((o) => ({
    id: Number(o.MealPrepOrderID),
    status: String(o.Status ?? '').toLowerCase(),
    frequency: o.RecurrencePattern === 'biweekly' ? 'biweekly' : 'weekly',
    servings: Number(o.MealsPerCycle ?? 0),
    nextDate: String(o.NextFulfillmentDate ?? '').slice(0, 10),
    mealType: o.MealType ?? null,
    termCycles: o.TermCycles === null || o.TermCycles === undefined ? null : Number(o.TermCycles),
    planWeeks: o.PlanWeeks === null || o.PlanWeeks === undefined ? null : Number(o.PlanWeeks),
    days: parseDeliveryDays(o.DeliveryDays),
    pausedUntil: o.PausedUntil ? String(o.PausedUntil).slice(0, 10) : null,
    refund: o.RefundAmount === null || o.RefundAmount === undefined ? null : Number(o.RefundAmount),
    termEnd: o.TermEndDate ? String(o.TermEndDate).slice(0, 10) : null,
    renewedCount: Number(o.RenewedCount ?? 0),
    skippedCount: Number(o.SkippedCount ?? 0),
    method: o.FulfillmentMethod === 'delivery' ? 'delivery' : 'pickup',
    time: o.FulfillmentTime ?? null,
    address: o.DeliveryAddress ?? null,
    deliveryFee: Number(o.DeliveryFee ?? 0),
    pricePerServing: o.PricePerServing === null || o.PricePerServing === undefined ? null : Number(o.PricePerServing),
    dishes: (items ?? [])
      .filter((i) => Number(i.MealPrepOrderID) === Number(o.MealPrepOrderID))
      .map((i) => ({ id: Number(i.MenuItemID), name: names.get(Number(i.MenuItemID)) ?? `Dish #${i.MenuItemID}` })),
  }))
  return { ok: true, plans, today: todayInManila() }
}

/**
 * Renew: add more weeks. If the plan is still running, the new weeks are added after the last
 * delivery and the price stays locked. If it already ended, a fresh term starts on the next chosen
 * day and the price is locked again at the CURRENT menu prices (renewal is a new purchase).
 */
export async function renewMealPlan(orderId: number, weeks: number): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!isPlanWeeks(weeks)) return { ok: false, error: 'Choose 1, 2 or 4 more weeks.' }
  const status = String(plan.Status).toLowerCase()
  if (!['active', 'confirmed', 'paused', 'ended'].includes(status)) {
    return { ok: false, error: 'Only confirmed meal plans can be renewed.' }
  }
  if (!plan.TermEndDate) return { ok: false, error: 'This meal plan has no subscription term yet.' }

  const today = todayInManila()
  const days = parseDeliveryDays(plan.DeliveryDays)
  const freq = String(plan.RecurrencePattern)
  const end = String(plan.TermEndDate).slice(0, 10)
  const add = days.length ? totalDeliveries(weeks, days) : weeks

  if (end >= today && status !== 'ended') {
    let newEnd = end
    for (let i = 0; i < add; i++) newEnd = nextDeliveryAfter(newEnd, days, freq)
    const { error } = await admin
      .from('MEAL_PREP_ORDER')
      .update({
        TermEndDate: newEnd,
        TermCycles: Number(plan.TermCycles ?? 0) + add,
        PlanWeeks: Number(plan.PlanWeeks ?? 0) + weeks,
        RenewedCount: Number(plan.RenewedCount ?? 0) + 1,
      })
      .eq('MealPrepOrderID', orderId)
    if (error) return { ok: false, error: error.message }
  } else {
    const priced = await currentPricePerServing(admin, orderId)
    if (priced.error !== undefined) return { ok: false, error: priced.error }
    const earliest = addDaysISO(today, SKIP_CUTOFF_DAYS)
    const dates = deliveryDates(earliest, add, days.length ? days : [new Date(`${String(plan.NextFulfillmentDate).slice(0, 10)}T00:00:00Z`).getUTCDay()])
    const { error } = await admin
      .from('MEAL_PREP_ORDER')
      .update({
        Status: 'active',
        NextFulfillmentDate: dates[0],
        TermCycles: add,
        PlanWeeks: weeks,
        TermEndDate: dates[dates.length - 1],
        RenewedCount: Number(plan.RenewedCount ?? 0) + 1,
        PricePerServing: priced.price,
      })
      .eq('MealPrepOrderID', orderId)
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/customer/active-orders')
  return { ok: true }
}

/** Skip the next delivery. The plan keeps its paid deliveries, so the end date moves back too. */
export async function skipNextDelivery(orderId: number): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!['active', 'confirmed'].includes(String(plan.Status).toLowerCase())) {
    return { ok: false, error: 'Only active meal plans can skip a delivery.' }
  }
  if (!plan.TermEndDate) return { ok: false, error: 'This meal plan has no subscription term yet.' }
  const today = todayInManila()
  const next = String(plan.NextFulfillmentDate).slice(0, 10)
  if (daysBetween(today, next) < SKIP_CUTOFF_DAYS) {
    return { ok: false, error: `Deliveries can be skipped up to ${SKIP_CUTOFF_DAYS} days before the delivery date.` }
  }
  const days = parseDeliveryDays(plan.DeliveryDays)
  const freq = String(plan.RecurrencePattern)
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({
      NextFulfillmentDate: nextDeliveryAfter(next, days, freq),
      TermEndDate: nextDeliveryAfter(String(plan.TermEndDate).slice(0, 10), days, freq),
      SkippedCount: Number(plan.SkippedCount ?? 0) + 1,
    })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true }
}

/**
 * Pause until a return date (at most 14 days away). Every paid delivery is kept: when the plan
 * resumes, the deliveries that are left start again and the end date moves out by the pause.
 */
export async function pauseMealPlan(orderId: number, returnDate: string): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!['active', 'confirmed'].includes(String(plan.Status).toLowerCase())) {
    return { ok: false, error: 'Only active meal plans can be paused.' }
  }
  const today = todayInManila()
  const next = String(plan.NextFulfillmentDate).slice(0, 10)
  if (daysBetween(today, next) < PAUSE_CUTOFF_DAYS) {
    return { ok: false, error: `Your next delivery is less than ${PAUSE_CUTOFF_DAYS} days away and is already being prepared. You can pause after it.` }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnDate)) return { ok: false, error: 'Choose the date you want deliveries to start again.' }
  const length = daysBetween(today, returnDate)
  if (length < 1) return { ok: false, error: 'Choose a return date after today.' }
  if (length > MAX_PAUSE_DAYS) return { ok: false, error: `A plan can be paused for up to ${MAX_PAUSE_DAYS} days at a time.` }

  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({ Status: 'paused', PausedFrom: today, PausedUntil: returnDate })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true }
}

/** Resume early. Deliveries restart on the first chosen day at least 2 days from now. */
export async function resumeMealPlan(orderId: number): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (String(plan.Status).toLowerCase() !== 'paused') return { ok: false, error: 'This meal plan is not paused.' }
  const today = todayInManila()
  const { error } = await resumePausedPlan(admin, plan, addDaysISO(today, SKIP_CUTOFF_DAYS), today)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true }
}

async function refundFor(admin: ReturnType<typeof createAdminClient>, plan: Record<string, any>, orderId: number) {
  const status = String(plan.Status).toLowerCase()
  const today = todayInManila()
  let price = plan.PricePerServing === null || plan.PricePerServing === undefined ? null : Number(plan.PricePerServing)
  if (price === null) {
    const priced = await currentPricePerServing(admin, orderId)
    price = priced.error === undefined ? priced.price : 0
  }
  // a plan nobody has confirmed or paid for yet has nothing to refund
  if (status === 'pending') return { refundedDeliveries: 0, committedDeliveries: 0, refund: 0 }
  return cancellationRefund({
    nextDate: String(plan.NextFulfillmentDate).slice(0, 10),
    termEnd: plan.TermEndDate ? String(plan.TermEndDate).slice(0, 10) : null,
    days: parseDeliveryDays(plan.DeliveryDays),
    frequency: plan.RecurrencePattern,
    today,
    pricePerServing: price,
    servings: Number(plan.MealsPerCycle ?? 0),
    deliveryFee: Number(plan.DeliveryFee ?? 0),
  })
}

/** What cancelling would do, shown before the customer confirms. */
export async function previewMealPlanCancellation(
  orderId: number
): Promise<{ ok: true; refundedDeliveries: number; committedDeliveries: number; refund: number } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const r = await refundFor(loaded.admin, loaded.plan, orderId)
  return { ok: true, ...r }
}

/**
 * Cancel right away. Deliveries inside the 2-day cutoff are treated as committed; the unused
 * deliveries after that are refunded at the LOCKED price. The system works out the amount and the
 * owner pays it back manually (there is no payment gateway).
 */
export async function cancelMealPlan(
  orderId: number
): Promise<{ ok: true; refund: number; refundedDeliveries: number } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!['pending', 'confirmed', 'active', 'paused'].includes(String(plan.Status).toLowerCase())) {
    return { ok: false, error: 'This meal plan cannot be cancelled.' }
  }
  const r = await refundFor(admin, plan, orderId)
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({ Status: 'cancelled', RefundAmount: r.refund, CancelledAt: todayInManila(), PausedFrom: null, PausedUntil: null })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true, refund: r.refund, refundedDeliveries: r.refundedDeliveries }
}

/** Change delivery time / method / address. The delivery fee is recalculated; food prices stay locked. */
export async function updateMealPlanDelivery(
  orderId: number,
  input: { fulfillmentTime: string; fulfillmentMethod: string; deliveryAddress?: string | null }
): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!['pending', 'active', 'confirmed', 'paused'].includes(String(plan.Status).toLowerCase())) {
    return { ok: false, error: 'This meal plan can no longer be changed.' }
  }
  if (!TIME_RE.test(input.fulfillmentTime)) return { ok: false, error: 'Choose a delivery time.' }
  const method = input.fulfillmentMethod === 'delivery' ? 'delivery' : 'pickup'
  let address: string | null = null
  let fee = 0
  if (method === 'delivery') {
    address = String(input.deliveryAddress ?? '').trim().slice(0, 500)
    const d = deliveryFeeForVenue(address)
    if (!address || !d) return { ok: false, error: 'Pin the delivery location on the map.' }
    fee = d.fee
  }
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({ FulfillmentTime: input.fulfillmentTime, FulfillmentMethod: method, DeliveryAddress: address, DeliveryFee: fee })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true }
}
