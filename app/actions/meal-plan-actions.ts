'use server'

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { deliveryFeeForVenue } from '../../lib/pricing'
import {
  addDaysISO,
  isMealType,
  isTermCycles,
  nextAlignedDate,
  stepDays,
  termEndDate,
  type MealType,
} from '../../lib/meal-plan'

const SKIP_CUTOFF_DAYS = 2
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

const PLAN_FIELDS =
  'MealPrepOrderID, CustomerID, OperatorID, RecurrencePattern, MealsPerCycle, Status, NextFulfillmentDate, MealType, TermCycles, TermEndDate, RenewedCount, FulfillmentMethod, FulfillmentTime, DeliveryAddress, DeliveryFee, PricePerServing, SkippedCount'

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
  termCycles: number
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
  if (!isTermCycles(input.termCycles)) return { ok: false, error: 'Choose how many deliveries the plan covers.' }
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

  const start = String(plan.NextFulfillmentDate).slice(0, 10)
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({
      MealType: input.mealType as MealType,
      TermCycles: input.termCycles,
      TermEndDate: termEndDate(start, String(plan.RecurrencePattern), input.termCycles),
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
 * Renew: add more deliveries. If the plan already ended, a fresh term starts on the next
 * scheduled date and the price is locked again at the CURRENT menu prices (renewal is a new purchase).
 */
export async function renewMealPlan(orderId: number, cycles: number): Promise<{ ok: true } | Fail> {
  const loaded = await loadOwnPlan(orderId)
  if (loaded.error !== undefined) return { ok: false, error: loaded.error }
  const { admin, plan } = loaded
  if (!isTermCycles(cycles)) return { ok: false, error: 'Choose how many deliveries to add.' }
  const status = String(plan.Status).toLowerCase()
  if (!['active', 'confirmed', 'paused', 'ended'].includes(status)) {
    return { ok: false, error: 'Only confirmed meal plans can be renewed.' }
  }
  if (!plan.TermEndDate) return { ok: false, error: 'This meal plan has no subscription term yet.' }

  const today = todayInManila()
  const freq = String(plan.RecurrencePattern)
  const end = String(plan.TermEndDate).slice(0, 10)

  if (end >= today && status !== 'ended') {
    // extend the running term; price stays locked
    const { error } = await admin
      .from('MEAL_PREP_ORDER')
      .update({
        TermEndDate: addDaysISO(end, cycles * stepDays(freq)),
        TermCycles: Number(plan.TermCycles ?? 0) + cycles,
        RenewedCount: Number(plan.RenewedCount ?? 0) + 1,
      })
      .eq('MealPrepOrderID', orderId)
    if (error) return { ok: false, error: error.message }
  } else {
    const priced = await currentPricePerServing(admin, orderId)
    if (priced.error !== undefined) return { ok: false, error: priced.error }
    const start = nextAlignedDate(String(plan.NextFulfillmentDate).slice(0, 10), today, freq)
    const { error } = await admin
      .from('MEAL_PREP_ORDER')
      .update({
        Status: 'active',
        NextFulfillmentDate: start,
        TermCycles: cycles,
        TermEndDate: termEndDate(start, freq, cycles),
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
  const days = Math.round((Date.parse(`${next}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  if (days < SKIP_CUTOFF_DAYS) {
    return { ok: false, error: `Deliveries can be skipped up to ${SKIP_CUTOFF_DAYS} days before the delivery date.` }
  }
  const step = stepDays(String(plan.RecurrencePattern))
  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({
      NextFulfillmentDate: addDaysISO(next, step),
      TermEndDate: addDaysISO(String(plan.TermEndDate).slice(0, 10), step),
      SkippedCount: Number(plan.SkippedCount ?? 0) + 1,
    })
    .eq('MealPrepOrderID', orderId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/customer/active-orders')
  return { ok: true }
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
