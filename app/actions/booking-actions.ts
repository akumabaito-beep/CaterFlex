'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { validateBooking } from '@/lib/rules/bookingValidation'
import type { Booking, DayOfWeek, OperatorSettings } from '@/lib/types'
import { createNotification } from '@/lib/notifications'
import { computeBookingTotal, servingsForBookingItem } from '@/lib/rules/allocation'
import { deliveryFeeForVenue } from '../../lib/pricing'
import { revalidatePath } from 'next/cache'

const BOOKING_FIELDS = 'BookingID, EventType, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status, AllergenConflictFlag, IsArchived, ArchivedAt, DeliveryFee'
const BOOKING_ITEM_FIELDS = 'BookingItemID, BookingID, MenuItemID, Quantity, UnitPrice'

type BookingDetails = {
  eventDate?: string | null
  eventTime?: string | null
  venue?: string | null
  guestCount?: number
  [key: string]: unknown
}

type BookingItemInput = {
  MenuItemID: number
  Quantity?: number
  MealType?: 'breakfast' | 'lunch' | 'dinner'
}

type MealPrepOrderDetails = {
  subscriptionWeeks?: 1 | 2 | 4
  deliveryDays?: number[]
  scheduledDeliveries?: {
    date: string
    subscriptionWeek: number
  }[]
  mealPrepFrequency?: string | null
  guestCount?: number
  eventDate?: string | null
  eventTime?: string | null
  fulfillmentMethod?: string | null
  deliveryAddress?: string | null
}

function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
  }

export async function getOwnerCalendarBookings() {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.', bookings: [] }

  const admin = createAdminClient()
  const operatorId = Number(owner.id)
  const fieldsWithArchive = 'BookingID, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status, IsArchived'
  type OwnerCalendarBookingRow = { BookingID: number; CustomerID: number; OperatorID: number; EventDate: string; EventTime: string; Venue: string; GuestCount: number; Status: string; IsArchived?: boolean | null }
  let query = admin.from('BOOKING').select(fieldsWithArchive).eq('OperatorID', operatorId).in('Status', ['pending', 'confirmed']).order('EventDate')
  let { data, error } = await query as { data: OwnerCalendarBookingRow[] | null; error: { message: string } | null }
  if (error && /isarchived|column/i.test(error.message)) {
    const fallback = await admin.from('BOOKING').select('BookingID, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status').eq('OperatorID', operatorId).in('Status', ['pending', 'confirmed']).order('EventDate')
    data = fallback.data
    error = fallback.error
  }
  if (error) return { ok: false as const, error: error.message, bookings: [] }

  const customerIds = [...new Set((data ?? []).map((booking) => Number(booking.CustomerID)))]
  const { data: customers, error: customerError } = customerIds.length > 0
    ? await admin.from('CUSTOMER').select('CustomerID, Name').in('CustomerID', customerIds)
    : { data: [], error: null }
  if (customerError) return { ok: false as const, error: customerError.message, bookings: [] }
  const names = new Map((customers ?? []).map((customer) => [Number(customer.CustomerID), String(customer.Name)]))
  return { ok: true as const, bookings: (data ?? []).map((booking) => ({ ...booking, customerName: names.get(Number(booking.CustomerID)) ?? `Customer #${booking.CustomerID}` })) }
}


export async function createMealPrepOrder(
  orderDetails: MealPrepOrderDetails,
  items: BookingItemInput[]
) {
  const customer = await requireRole('customer')
  if (!customer) {
    return { ok: false as const, error: 'Customer access required.' }
  }

  const admin = createAdminClient()
  const customerId = Number(customer.id)
  const operatorId = 2

  // Validate subscription details.
  const subscriptionWeeks = Number(orderDetails.subscriptionWeeks)
  const allowedWeeks = [1, 2, 4]

  if (!allowedWeeks.includes(subscriptionWeeks)) {
    return { ok: false as const, error: 'Please select a valid subscription duration.' }
  }

  const eventDate = String(orderDetails.eventDate ?? '').trim()
  const eventTime = String(orderDetails.eventTime ?? '').trim()
  const fulfillmentMethod = String(orderDetails.fulfillmentMethod ?? 'pickup').trim().toLowerCase()
  const deliveryAddress = String(orderDetails.deliveryAddress ?? '').trim()

  const parsedEventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDate)
    ? new Date(`${eventDate}T00:00:00Z`)
    : null

  const isValidEventDate =
    parsedEventDate !== null &&
    !Number.isNaN(parsedEventDate.getTime()) &&
    parsedEventDate.toISOString().slice(0, 10) === eventDate

  if (!isValidEventDate || eventDate < todayInManila()) {
    return { ok: false as const, error: 'Please choose a valid start date.' }
  }

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(eventTime)) {
    return { ok: false as const, error: 'Please choose a valid delivery time.' }
  }

  if (!['pickup', 'delivery'].includes(fulfillmentMethod)) {
    return { ok: false as const, error: 'Please choose pickup or delivery.' }
  }

  if (fulfillmentMethod === 'delivery' && !deliveryAddress) {
    return { ok: false as const, error: 'Please provide your delivery address.' }
  }

  // Validate selected dishes and their meal periods.
  if (!items.length) {
    return { ok: false as const, error: 'Please select at least one dish.' }
  }

  const validMealTypes = ['breakfast', 'lunch', 'dinner'] as const

  for (const item of items) {
    if (
      !Number.isInteger(Number(item.MenuItemID)) ||
      Number(item.MenuItemID) <= 0 ||
      !Number.isInteger(Number(item.Quantity ?? 1)) ||
      Number(item.Quantity ?? 1) <= 0 ||
      !item.MealType ||
      !validMealTypes.includes(item.MealType)
    ) {
      return {
        ok: false as const,
        error: 'One or more selected dishes have invalid meal types or quantities.',
      }
    }
  }

  const selectedMenuItemIds = [
    ...new Set(items.map((item) => Number(item.MenuItemID))),
  ]

  // Validate the generated delivery schedule.
  const scheduledDeliveries = orderDetails.scheduledDeliveries ?? []

  if (!scheduledDeliveries.length) {
    return {
      ok: false as const,
      error: 'Please select at least one scheduled delivery.',
    }
  }

  const seenDates = new Set<string>()

  for (const delivery of scheduledDeliveries) {
    const date = String(delivery.date ?? '').trim()
    const week = Number(delivery.subscriptionWeek)

    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T00:00:00Z`)
      : null

    const validDate =
      parsedDate !== null &&
      !Number.isNaN(parsedDate.getTime()) &&
      parsedDate.toISOString().slice(0, 10) === date

    if (
      !validDate ||
      date < eventDate ||
      !Number.isInteger(week) ||
      week < 1 ||
      week > subscriptionWeeks
    ) {
      return {
        ok: false as const,
        error: 'The delivery schedule contains an invalid date or subscription week.',
      }
    }

    if (seenDates.has(date)) {
      return {
        ok: false as const,
        error: 'The delivery schedule contains duplicate dates.',
      }
    }

    seenDates.add(date)
  }

  const sortedDeliveries = [...scheduledDeliveries].sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  const firstDeliveryDate = sortedDeliveries[0].date

  // Calculate the number of portions in one delivery.
  const mealsPerCycle = items.reduce(
    (total, item) => total + Number(item.Quantity ?? 1),
    0
  )

  if (!Number.isFinite(mealsPerCycle) || mealsPerCycle <= 0) {
    return { ok: false as const, error: 'The total meal quantity must be greater than 0.' }
  }

  const recurrencePattern =
    String(orderDetails.mealPrepFrequency ?? 'weekly').trim() || 'weekly'

  // Check customer allergies.
  const { data: customerAllergies, error: customerAllergyError } = await admin
    .from('CUSTOMER_ALLERGY')
    .select('AllergyTagID')
    .eq('CustomerID', customerId)

  if (customerAllergyError) {
    return { ok: false as const, error: customerAllergyError.message }
  }

  const { data: menuItemAllergies, error: menuItemAllergyError } = await admin
    .from('MENU_ITEM_ALLERGY')
    .select('MenuItemID, AllergyTagID')
    .in('MenuItemID', selectedMenuItemIds)

  if (menuItemAllergyError) {
    return { ok: false as const, error: menuItemAllergyError.message }
  }

  const allergyTagIds = Array.from(
    new Set([
      ...(customerAllergies ?? []).map((allergy) => Number(allergy.AllergyTagID)),
      ...(menuItemAllergies ?? []).map((allergy) => Number(allergy.AllergyTagID)),
    ].filter(Number.isFinite))
  )

  const { data: allergyTags, error: allergyTagError } =
    allergyTagIds.length > 0
      ? await admin
          .from('ALLERGY_TAG')
          .select('AllergyTagID, AllergenName')
          .in('AllergyTagID', allergyTagIds)
      : { data: [], error: null }

  if (allergyTagError) {
    return { ok: false as const, error: allergyTagError.message }
  }

  const allergenNamesById = new Map(
    (allergyTags ?? []).map((tag) => [
      Number(tag.AllergyTagID),
      String(tag.AllergenName).trim().toLowerCase(),
    ])
  )

  const customerAllergenNames = new Set(
    (customerAllergies ?? [])
      .map((allergy) => allergenNamesById.get(Number(allergy.AllergyTagID)))
      .filter(Boolean)
  )

  const hasAllergenConflict = (menuItemAllergies ?? []).some((allergy) =>
    customerAllergenNames.has(
      allergenNamesById.get(Number(allergy.AllergyTagID)) ?? ''
    )
  )

  // Check operator settings and existing meal-prep orders.
  const [
    { data: operatorSettingsRow, error: settingsError },
    { data: existingMealPrepRows, error: existingMealPrepError },
  ] = await Promise.all([
    admin
      .from('OPERATOR_SETTINGS')
      .select(
        'OperatorID, DayOfWeek, OperatingStartTime, OperatingEndTime, MaxCateringEventsPerDay, MaxMealPrepOrdersPerDay, MaxGuestCountPerEvent'
      )
      .eq('OperatorID', operatorId),

    admin
      .from('MEAL_PREP_ORDER')
      .select('MealPrepOrderID, CustomerID, OperatorID, NextFulfillmentDate, MealsPerCycle, Status')
      .eq('OperatorID', operatorId)
      .eq('NextFulfillmentDate', firstDeliveryDate)
      .in('Status', ['pending', 'active']),
  ])

  if (settingsError) {
    return { ok: false as const, error: settingsError.message }
  }

  if (existingMealPrepError) {
    return { ok: false as const, error: existingMealPrepError.message }
  }

  if (!operatorSettingsRow?.length) {
    return {
      ok: false as const,
      error: 'Operator booking settings are unavailable.',
    }
  }

  const maxEventsPerDay = {} as OperatorSettings['maxEventsPerDay']
  const maxMealPrepFulfillmentsPerDay =
    {} as OperatorSettings['maxMealPrepFulfillmentsPerDay']

  for (const row of operatorSettingsRow) {
    const day = Number(row.DayOfWeek) as DayOfWeek
    maxEventsPerDay[day] = Number(row.MaxCateringEventsPerDay ?? 0)
    maxMealPrepFulfillmentsPerDay[day] = Number(
      row.MaxMealPrepOrdersPerDay ?? 0
    )
  }

  const settings: OperatorSettings = {
    operatingDays: Object.keys(maxEventsPerDay).map(Number) as DayOfWeek[],
    operatingHoursStart: String(operatorSettingsRow[0].OperatingStartTime),
    operatingHoursEnd: String(operatorSettingsRow[0].OperatingEndTime),
    maxEventsPerDay,
    maxGuestsPerEvent: Number(operatorSettingsRow[0].MaxGuestCountPerEvent),
    maxMealPrepFulfillmentsPerDay,
  }

  const candidateBooking = {
    id: 'new-meal-prep-order',
    customerId: String(customerId),
    customerName: '',
    customerEmail: '',
    orderType: 'meal_prep',
    eventDate: firstDeliveryDate,
    eventTime,
    eventType: '',
    venue: deliveryAddress,
    guestCount: mealsPerCycle,
    specialRequests: '',
    status: 'pending',
    selectedMenuItemIds: selectedMenuItemIds.map(String),
    dietaryRestrictions: [],
    eventProfileId: '',
    totalCost: 0,
    paymentsReceived: 0,
    createdAt: new Date().toISOString(),
    validationPassed: false,
    ruleViolations: [],
  } satisfies Booking

  const validation = validateBooking(
    candidateBooking,
    settings,
    (existingMealPrepRows ?? []).map((row) => ({
      ...candidateBooking,
      id: String(row.MealPrepOrderID),
      customerId: String(row.CustomerID),
      eventDate: String(row.NextFulfillmentDate),
      guestCount: Number(row.MealsPerCycle),
      status: String(row.Status) as Booking['status'],
    })),
    [],
    []
  )

  if (!validation.valid) {
    const failureMessage = validation.failures
      .map((failure) => failure.message)
      .join(' ')

    await createNotification(
      operatorId,
      'capacity_conflict',
      `A meal-prep order for ${firstDeliveryDate} was blocked: ${failureMessage}`
    )

    return { ok: false as const, error: failureMessage }
  }

  // Get the active prices so the order keeps its original price snapshots.
  const { data: activePrices, error: priceError } = await admin
    .from('PRICES')
    .select('MenuItemID, Price')
    .in('MenuItemID', selectedMenuItemIds)
    .is('EffectiveTo', null)

  if (priceError) {
    return { ok: false as const, error: priceError.message }
  }

  const priceByMenuItemId = new Map(
    (activePrices ?? []).map((row) => [
      Number(row.MenuItemID),
      Number(row.Price),
    ])
  )

  const missingPrice = selectedMenuItemIds.filter(
    (id) => !priceByMenuItemId.has(id)
  )

  if (missingPrice.length > 0) {
    return {
      ok: false as const,
      error: 'Some selected menu items do not have an active price record.',
    }
  }

  // Calculate the cost of one delivery.
  const pricePerDelivery = items.reduce((total, item) => {
    const unitPrice = priceByMenuItemId.get(Number(item.MenuItemID)) ?? 0
    return total + unitPrice * Number(item.Quantity ?? 1)
  }, 0)

  // Create the main subscription record.
  const { data: order, error: orderError } = await admin
    .from('MEAL_PREP_ORDER')
    .insert({
      CustomerID: customerId,
      OperatorID: operatorId,
      RecurrencePattern: recurrencePattern,
      MealsPerCycle: mealsPerCycle,
      Status: 'pending',
      AllergenConflictFlag: hasAllergenConflict,
      NextFulfillmentDate: firstDeliveryDate,
      SubscriptionWeeks: subscriptionWeeks,
      FulfillmentMethod: fulfillmentMethod,
      FulfillmentTime: eventTime,
      DeliveryAddress: fulfillmentMethod === 'delivery' ? deliveryAddress : null,
      PricePerServing: pricePerDelivery,
    })
    .select('MealPrepOrderID')
    .single()

  if (orderError || !order) {
    return {
      ok: false as const,
      error: orderError?.message ?? 'Unable to create the meal-prep order.',
    }
  }

  const mealPrepOrderId = Number(order.MealPrepOrderID)

  // Remove all related records if a later insert fails.
  const rollbackOrder = async () => {
    await admin
      .from('MEAL_PREP_PAYMENT')
      .delete()
      .eq('MealPrepOrderID', mealPrepOrderId)

    await admin
      .from('MEAL_PREP_DELIVERY')
      .delete()
      .eq('MealPrepOrderID', mealPrepOrderId)

    await admin
      .from('MEAL_PREP_ITEM')
      .delete()
      .eq('MealPrepOrderID', mealPrepOrderId)

    await admin
      .from('MEAL_PREP_PLAN_PERIOD')
      .delete()
      .eq('MealPrepOrderID', mealPrepOrderId)

    await admin
      .from('MEAL_PREP_ORDER')
      .delete()
      .eq('MealPrepOrderID', mealPrepOrderId)
  }

  // Create one plan-period record for each selected meal type.
  const mealTypeLabels: Record<
    'breakfast' | 'lunch' | 'dinner',
    string
  > = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
  }

  const selectedMealTypes = [
    ...new Set(items.map((item) => item.MealType!)),
  ]

  const { data: planPeriods, error: planPeriodError } = await admin
    .from('MEAL_PREP_PLAN_PERIOD')
    .insert(
      selectedMealTypes.map((mealType) => ({
        MealPrepOrderID: mealPrepOrderId,
        MealPeriod: mealTypeLabels[mealType],
      }))
    )
    .select('MealPrepPlanPeriodID, MealPeriod')

  if (planPeriodError || !planPeriods) {
    await rollbackOrder()
    return {
      ok: false as const,
      error: planPeriodError?.message ?? 'Unable to save the selected meal periods.',
    }
  }

  const planPeriodIdByMealType = new Map(
    planPeriods.map((period) => [
      String(period.MealPeriod).toLowerCase(),
      Number(period.MealPrepPlanPeriodID),
    ])
  )

  // Link each selected dish to its corresponding meal period.
  const { error: itemError } = await admin
    .from('MEAL_PREP_ITEM')
    .insert(
      items.map((item) => ({
        MealPrepOrderID: mealPrepOrderId,
        MenuItemID: Number(item.MenuItemID),
        Quantity: Number(item.Quantity ?? 1),
        UnitPrice: priceByMenuItemId.get(Number(item.MenuItemID)),
        MealPrepPlanPeriodID: planPeriodIdByMealType.get(
          String(item.MealType).toLowerCase()
        ),
      }))
    )

  if (itemError) {
    await rollbackOrder()
    return { ok: false as const, error: itemError.message }
  }

  // Save all scheduled delivery visits.
  const { error: deliveryError } = await admin
    .from('MEAL_PREP_DELIVERY')
    .insert(
      sortedDeliveries.map((delivery) => ({
        MealPrepOrderID: mealPrepOrderId,
        OriginalDeliveryDate: delivery.date,
        DeliveryDate: delivery.date,
        DeliveryTime: eventTime,
        SubscriptionWeek: Number(delivery.subscriptionWeek),
        Status: 'scheduled',
      }))
    )

  if (deliveryError) {
    await rollbackOrder()
    return { ok: false as const, error: deliveryError.message }
  }

  // Create one payment record for each subscription week.
  const deliveriesByWeek = new Map<number, typeof sortedDeliveries>()

  for (const delivery of sortedDeliveries) {
    const week = Number(delivery.subscriptionWeek)
    const weekDeliveries = deliveriesByWeek.get(week) ?? []
    weekDeliveries.push(delivery)
    deliveriesByWeek.set(week, weekDeliveries)
  }

  const paymentRows = Array.from(deliveriesByWeek.entries()).map(
    ([week, weekDeliveries]) => {
      const firstDateOfWeek = weekDeliveries
        .map((delivery) => delivery.date)
        .sort()[0]

      const dueDateObject = new Date(`${firstDateOfWeek}T00:00:00Z`)
      dueDateObject.setUTCDate(dueDateObject.getUTCDate() - 2)

      const dueDate = dueDateObject.toISOString().slice(0, 10)
      const amountDue = Math.round(
        pricePerDelivery * weekDeliveries.length * 100
      ) / 100

      return {
        MealPrepOrderID: mealPrepOrderId,
        SubscriptionWeek: week,
        AmountDue: amountDue,
        DueDate: dueDate,
        PaymentStatus: 'pending',
      }
    }
  )

  const { error: paymentError } = await admin
    .from('MEAL_PREP_PAYMENT')
    .insert(paymentRows)

  if (paymentError) {
    await rollbackOrder()
    return { ok: false as const, error: paymentError.message }
  }

  // Notify the owner if the selected dishes conflict with customer allergies.
  if (hasAllergenConflict) {
    await createNotification(
      operatorId,
      'allergen_conflict',
      'A customer attempted a meal-prep order with an allergen conflict.',
      {}
    )
  }

  await createNotification(
    operatorId,
    'new_meal_prep_order',
    `New meal-prep order request for ${firstDeliveryDate}.`,
    { mealPrepOrderId }
  )

  revalidatePath('/customer')
  revalidatePath('/owner')

  return {
    ok: true as const,
    mealPrepOrderId,
  }
}

export async function getCustomerMealPrepOrders() {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false as const, error: 'Customer access required.', orders: [], items: [] }

  const admin = createAdminClient()
  const { data: orders, error } = await admin
    .from('MEAL_PREP_ORDER')
    .select('MealPrepOrderID, CustomerID, OperatorID, RecurrencePattern, MealsPerCycle, Status, AllergenConflictFlag, NextFulfillmentDate')
    .eq('CustomerID', Number(customer.id))
    .order('MealPrepOrderID', { ascending: false })
  if (error) return { ok: false as const, error: error.message, orders: [], items: [] }

  const orderIds = (orders ?? []).map((order) => order.MealPrepOrderID)
  if (orderIds.length === 0) return { ok: true as const, orders: orders ?? [], items: [] }

  const { data: items, error: itemError } = await admin
    .from('MEAL_PREP_ITEM')
    .select('MealPrepItemID, MealPrepOrderID, MenuItemID, Quantity, UnitPrice')
    .in('MealPrepOrderID', orderIds)
  if (itemError) return { ok: false as const, error: itemError.message, orders: [], items: [] }

  return { ok: true as const, orders: orders ?? [], items: items ?? [] }
}

export async function getCustomerBookings() {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false as const, error: 'Customer access required.', bookings: [], bookingItems: [] }

  const admin = createAdminClient()
  const { data: bookings, error } = await admin.from('BOOKING').select(BOOKING_FIELDS).eq('CustomerID', Number(customer.id)).order('BookingID', { ascending: false })
  if (error) return { ok: false as const, error: error.message, bookings: [], bookingItems: [] }

  const bookingIds = (bookings ?? []).map((booking) => booking.BookingID)
  if (bookingIds.length === 0) return { ok: true as const, bookings: [], bookingItems: [] }

  const { data: bookingItems, error: itemError } = await admin.from('BOOKING_ITEM').select(BOOKING_ITEM_FIELDS).in('BookingID', bookingIds)
  if (itemError) return { ok: false as const, error: itemError.message, bookings: [], bookingItems: [] }

  return { ok: true as const, bookings: bookings ?? [], bookingItems: bookingItems ?? [] }
}

export async function createBooking(bookingDetails: BookingDetails, items: BookingItemInput[]) {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false as const, error: 'Customer access required.' }

  const admin = createAdminClient()
  const customerId = Number(customer.id)
  const selectedMenuItemIds = items.map((item) => Number(item.MenuItemID)).filter(Number.isFinite)

  const { data: customerAllergies, error: customerAllergyError } = await admin
    .from('CUSTOMER_ALLERGY')
    .select('AllergyTagID')
    .eq('CustomerID', customerId)
  if (customerAllergyError) return { ok: false as const, error: customerAllergyError.message }

  const { data: menuItemAllergies, error: menuItemAllergyError } = selectedMenuItemIds.length > 0
    ? await admin.from('MENU_ITEM_ALLERGY').select('AllergyTagID').in('MenuItemID', selectedMenuItemIds)
    : { data: [], error: null }
  if (menuItemAllergyError) return { ok: false as const, error: menuItemAllergyError.message }

  const allergyTagIds = Array.from(new Set([
    ...(customerAllergies ?? []).map((allergy) => Number(allergy.AllergyTagID)),
    ...(menuItemAllergies ?? []).map((allergy) => Number(allergy.AllergyTagID)),
  ].filter(Number.isFinite)))

  const { data: allergyTags, error: allergyTagError } = allergyTagIds.length > 0
    ? await admin.from('ALLERGY_TAG').select('AllergyTagID, AllergenName').in('AllergyTagID', allergyTagIds)
    : { data: [], error: null }
  if (allergyTagError) return { ok: false as const, error: allergyTagError.message }

  const allergenNamesById = new Map((allergyTags ?? []).map((tag) => [Number(tag.AllergyTagID), String(tag.AllergenName).trim().toLowerCase()]))
  const customerAllergenNames = new Set((customerAllergies ?? []).map((allergy) => allergenNamesById.get(Number(allergy.AllergyTagID))).filter(Boolean))
  const hasAllergenConflict = (menuItemAllergies ?? []).some((allergy) => customerAllergenNames.has(allergenNamesById.get(Number(allergy.AllergyTagID)) ?? ''))
  const operatorId = 2
  if (hasAllergenConflict) {
    await createNotification(operatorId, 'allergen_conflict', `A customer attempted a booking with an allergen conflict.`, {})
  }

  const eventDate = String(bookingDetails.eventDate ?? '').trim()
const eventTime = String(bookingDetails.eventTime ?? '').trim()
const venue = String(bookingDetails.venue ?? '').trim()
const guestCount = Number(bookingDetails.guestCount ?? 0)

if (!eventDate) {
  return {
    ok: false as const,
    error: 'Event date is required.',
  }
}

if (!eventTime) {
  return {
    ok: false as const,
    error: 'Event time is required.',
  }
}

if (!venue) {
  return {
    ok: false as const,
    error: 'Venue is required.',
  }
}

if (!Number.isFinite(guestCount) || guestCount <= 0) {
  return {
    ok: false as const,
    error: 'Guest count must be greater than 0.',
  }
}

const [{ data: operatorSettingsRow, error: settingsError }, { data: existingBookingRows, error: existingBookingsError }] = await Promise.all([
  admin
    .from('OPERATOR_SETTINGS')
    .select('OperatorID, DayOfWeek, OperatingStartTime, OperatingEndTime, MaxCateringEventsPerDay, MaxMealPrepOrdersPerDay, MaxGuestCountPerEvent')
    .eq('OperatorID', operatorId),
  admin
    .from('BOOKING')
    .select('BookingID, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status')
    .eq('EventDate', eventDate)
    .in('Status', ['pending', 'confirmed']),
])

if (settingsError) return { ok: false as const, error: settingsError.message }
if (existingBookingsError) return { ok: false as const, error: existingBookingsError.message }
if (!operatorSettingsRow?.length) return { ok: false as const, error: 'Operator booking settings are unavailable.' }

const maxEventsPerDay = {} as OperatorSettings['maxEventsPerDay']
const maxMealPrepFulfillmentsPerDay = {} as OperatorSettings['maxMealPrepFulfillmentsPerDay']

for (const row of operatorSettingsRow) {
  const day = Number(row.DayOfWeek) as DayOfWeek
  maxEventsPerDay[day] = Number(row.MaxCateringEventsPerDay ?? 0)
  maxMealPrepFulfillmentsPerDay[day] = Number(row.MaxMealPrepOrdersPerDay ?? 0)
}

const settings: OperatorSettings = {
  operatingDays: Object.keys(maxEventsPerDay).map(Number) as DayOfWeek[],
  operatingHoursStart: String(operatorSettingsRow[0].OperatingStartTime),
  operatingHoursEnd: String(operatorSettingsRow[0].OperatingEndTime),
  maxEventsPerDay,
  maxGuestsPerEvent: Number(operatorSettingsRow[0].MaxGuestCountPerEvent),
  maxMealPrepFulfillmentsPerDay,
}

const candidateBooking = {
  id: 'new-booking',
  customerId: String(customerId),
  customerName: '',
  customerEmail: '',
  orderType: 'catering',
  eventDate,
  eventTime,
  eventType: '',
  venue,
  guestCount,
  specialRequests: '',
  status: 'pending',
  selectedMenuItemIds: selectedMenuItemIds.map(String),
  dietaryRestrictions: [],
  eventProfileId: '',
  totalCost: 0,
  paymentsReceived: 0,
  createdAt: new Date().toISOString(),
  validationPassed: false,
  ruleViolations: [],
} satisfies Booking

const validation = validateBooking(
  candidateBooking,
  settings,
  (existingBookingRows ?? []).map((row) => ({
    ...candidateBooking,
    id: String(row.BookingID),
    customerId: String(row.CustomerID),
    eventDate: String(row.EventDate),
    eventTime: String(row.EventTime),
    venue: String(row.Venue),
    guestCount: Number(row.GuestCount),
    status: String(row.Status) as Booking['status'],
  })),
  [],
  [],
)

if (!validation.valid) {
  await createNotification(operatorId, 'capacity_conflict', `A booking attempt for ${eventDate} at ${eventTime} was blocked: ${validation.failures.map((failure) => failure.message).join(' ')}`)
  return { ok: false as const, error: validation.failures.map((failure) => failure.message).join(' ') }
}

  // Get the active menu prices from the price history table.
  const { data: activePrices, error: priceError } = await admin
    .from('PRICES')
    .select('MenuItemID, Price')
    .in('MenuItemID', selectedMenuItemIds)
    .is('EffectiveTo', null)

  if (priceError) {
    return { ok: false as const, error: priceError.message }
  }

  const priceByMenuItemId = new Map(
    (activePrices ?? []).map((row) => [
      Number(row.MenuItemID),
      Number(row.Price),
    ])
  )

  const missingPrice = selectedMenuItemIds.filter(
    (id) => !priceByMenuItemId.has(id)
  )

  if (missingPrice.length > 0) {
    return {
      ok: false as const,
      error: 'Some selected menu items do not have an active price record.',
    }
  }
  
const { data: booking, error } = await admin
  .from('BOOKING')
  .insert({
    CustomerID: customerId,
    OperatorID: 2,
    EventDate: eventDate,
    EventTime: eventTime,
    Venue: venue,
    EventType: String(bookingDetails.eventType ?? '').trim().slice(0, 100) || null,
    GuestCount: guestCount,
    Status: 'pending',
    AllergenConflictFlag: hasAllergenConflict,
    // Calculated on the server from the pinned location, never trusted from the browser.
    DeliveryFee: deliveryFeeForVenue(venue)?.fee ?? 0,
  })
  .select('BookingID')
  .single()

  if (error || !booking) return { ok: false as const, error: error?.message ?? 'Unable to retrieve the booking ID.' }

  await createNotification(operatorId, 'new_booking', `New booking request for ${eventDate} at ${eventTime}.`, { bookingId: booking.BookingID })

  const { error: itemError } = await admin.from('BOOKING_ITEM').insert(
    items.map((item) => ({
      BookingID: booking.BookingID,
      MenuItemID: Number(item.MenuItemID),
      Quantity: guestCount,
      UnitPrice: priceByMenuItemId.get(Number(item.MenuItemID)),
    }))
  )
    if (itemError) {
    await admin.from('BOOKING').delete().eq('BookingID', booking.BookingID)
    return { ok: false as const, error: itemError.message }
  }

  return { ok: true as const, bookingId: booking.BookingID }
}

export async function getOwnerCalendarMealPrep() {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.', orders: [] }

  const admin = createAdminClient()
  const operatorId = Number(owner.id)
  const { data: orders, error } = await admin
    .from('MEAL_PREP_ORDER')
    .select('MealPrepOrderID, CustomerID, OperatorID, Status, NextFulfillmentDate, RecurrencePattern, MealsPerCycle, IsArchived')
    .eq('OperatorID', operatorId)
    .in('Status', ['pending', 'active', 'paused'])
    .or('IsArchived.is.null,IsArchived.eq.false')
    .order('NextFulfillmentDate', { ascending: true })

  if (error) return { ok: false as const, error: error.message, orders: [] }

  const customerIds = [...new Set((orders ?? []).map((order) => Number(order.CustomerID)))]
  const { data: customers, error: customerError } = customerIds.length > 0
    ? await admin.from('CUSTOMER').select('CustomerID, Name').in('CustomerID', customerIds)
    : { data: [], error: null }
  if (customerError) return { ok: false as const, error: customerError.message, orders: [] }

  const names = new Map((customers ?? []).map((customer) => [Number(customer.CustomerID), String(customer.Name)]))
  return {
    ok: true as const,
    orders: (orders ?? []).map((order) => ({
      id: Number(order.MealPrepOrderID),
      customerName: names.get(Number(order.CustomerID)) ?? `Customer #${order.CustomerID}`,
      status: String(order.Status),
      nextFulfillmentDate: String(order.NextFulfillmentDate).slice(0, 10),
      recurrencePattern: String(order.RecurrencePattern ?? 'weekly'),
      mealsPerCycle: Number(order.MealsPerCycle),
      isArchived: Boolean(order.IsArchived),
    })),
  }
}

export async function getOwnerBookings() {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.', bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [] }

  const admin = createAdminClient()
  const operatorId = Number(owner.id)
  const [{ data: bookings, error }, { data: mealPrepOrders, error: mealPrepError }] = await Promise.all([
    admin.from('BOOKING').select(BOOKING_FIELDS).eq('OperatorID', operatorId).order('BookingID', { ascending: false }),
    admin.from('MEAL_PREP_ORDER').select('MealPrepOrderID, CustomerID, OperatorID, RecurrencePattern, MealsPerCycle, Status, AllergenConflictFlag, IsArchived, ArchivedAt, NextFulfillmentDate').eq('OperatorID', operatorId).order('MealPrepOrderID', { ascending: false }),
  ])
  if (error) return { ok: false as const, error: error.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [] }
  if (mealPrepError) return { ok: false as const, error: mealPrepError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [] }

  const bookingIds = (bookings ?? []).map((booking) => booking.BookingID)
  const mealPrepOrderIds = (mealPrepOrders ?? []).map((order) => order.MealPrepOrderID)
  const [{ data: bookingItems, error: itemError }, { data: mealPrepItems, error: mealPrepItemError }] = await Promise.all([
    bookingIds.length > 0
      ? admin.from('BOOKING_ITEM').select(BOOKING_ITEM_FIELDS).in('BookingID', bookingIds)
      : Promise.resolve({ data: [], error: null }),
    mealPrepOrderIds.length > 0
      ? admin.from('MEAL_PREP_ITEM').select('MealPrepItemID, MealPrepOrderID, MenuItemID, Quantity, UnitPrice').in('MealPrepOrderID', mealPrepOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (itemError) return { ok: false as const, error: itemError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [] }
  if (mealPrepItemError) return { ok: false as const, error: mealPrepItemError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [] }

  return { ok: true as const, bookings: bookings ?? [], bookingItems: bookingItems ?? [], mealPrepOrders: mealPrepOrders ?? [], mealPrepItems: mealPrepItems ?? [] }
}

export async function updateBookingItemServings(bookingId: number, items: { bookingItemId: number; servings: number }[]) {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.' }
  const admin = createAdminClient()
  const { data: booking, error: bookingError } = await admin.from('BOOKING').select('BookingID, OperatorID, Status').eq('BookingID', bookingId).maybeSingle()
  if (bookingError) return { ok: false as const, error: bookingError.message }
  if (!booking || Number(booking.OperatorID) !== Number(owner.id)) return { ok: false as const, error: 'You are not authorized to update this booking.' }
  if (booking.Status !== 'pending') return { ok: false as const, error: 'Servings can only be adjusted while the booking is pending.' }
  if (items.some((item) => !Number.isInteger(item.servings) || item.servings < 1)) return { ok: false as const, error: 'Each dish must have at least 1 serving.' }
  const { data: existingItems, error: itemError } = await admin.from('BOOKING_ITEM').select('BookingItemID, MenuItemID').eq('BookingID', bookingId)
  if (itemError) return { ok: false as const, error: itemError.message }
  const validIds = new Set((existingItems ?? []).map((item) => Number(item.BookingItemID)))
  if (items.some((item) => !validIds.has(Number(item.bookingItemId)))) return { ok: false as const, error: 'One or more dishes do not belong to this booking.' }
  const { error: updateError } = await admin.from('BOOKING_ITEM').upsert(
    items.map((item) => ({
      BookingItemID: item.bookingItemId,
      BookingID: bookingId,
      MenuItemID: (existingItems ?? []).find((existing) => Number(existing.BookingItemID) === Number(item.bookingItemId))?.MenuItemID,
      Quantity: item.servings,
    })),
    { onConflict: 'BookingItemID' },
  )
  if (updateError) return { ok: false as const, error: updateError.message }
  revalidatePath('/owner/bookings')
  return { ok: true as const }
}

export async function getOwnerPrepSchedule() {
  const owner = await requireRole('owner')
  if (!owner) {
    return { ok: false as const, error: 'Owner access required.', bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }
  }

  const admin = createAdminClient()
  const operatorId = Number(owner.id)
  const [{ data: bookings, error: bookingError }, { data: mealPrepOrders, error: mealPrepError }, { data: preparationLogs, error: preparationError }] = await Promise.all([
    admin.from('BOOKING').select('BookingID, CustomerID, EventDate, EventTime, Venue, GuestCount, Status').eq('OperatorID', operatorId).eq('Status', 'confirmed'),
    admin.from('MEAL_PREP_ORDER').select('MealPrepOrderID, CustomerID, RecurrencePattern, MealsPerCycle, NextFulfillmentDate, Status').eq('OperatorID', operatorId).in('Status', ['pending', 'confirmed', 'active']),
    admin.from('PREPARATION_LOG').select('BookingID, MealPrepOrderID, CycleDate').not('BookingID', 'is', null).or('BookingID.not.is.null,MealPrepOrderID.not.is.null'),
  ])

  if (bookingError) return { ok: false as const, error: bookingError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }
  if (mealPrepError) return { ok: false as const, error: mealPrepError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }
  if (preparationError) return { ok: false as const, error: preparationError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }

  const bookingIds = (bookings ?? []).map((booking) => booking.BookingID)
  const mealPrepOrderIds = (mealPrepOrders ?? []).map((order) => order.MealPrepOrderID)
  const [{ data: bookingItems, error: bookingItemsError }, { data: mealPrepItems, error: mealPrepItemsError }] = await Promise.all([
    bookingIds.length > 0 ? admin.from('BOOKING_ITEM').select('BookingItemID, BookingID, MenuItemID, Quantity').in('BookingID', bookingIds) : Promise.resolve({ data: [], error: null }),
    mealPrepOrderIds.length > 0 ? admin.from('MEAL_PREP_ITEM').select('MealPrepItemID, MealPrepOrderID, MenuItemID, Quantity, UnitPrice').in('MealPrepOrderID', mealPrepOrderIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (bookingItemsError) return { ok: false as const, error: bookingItemsError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }
  if (mealPrepItemsError) return { ok: false as const, error: mealPrepItemsError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }

  const customerIds = Array.from(new Set([...((bookings ?? []).map((booking) => booking.CustomerID)), ...((mealPrepOrders ?? []).map((order) => order.CustomerID))].filter((id): id is number => id !== null)))
  const menuItemIds = Array.from(new Set([...((bookingItems ?? []).map((item) => item.MenuItemID)), ...((mealPrepItems ?? []).map((item) => item.MenuItemID))]))
  const [{ data: customers, error: customerError }, { data: menuItems, error: menuItemError }] = await Promise.all([
    customerIds.length > 0 ? admin.from('CUSTOMER').select('CustomerID, Name').in('CustomerID', customerIds) : Promise.resolve({ data: [], error: null }),
    menuItemIds.length > 0 ? admin.from('MENU_ITEM').select('MenuItemID, ItemName, PrepTimeDays').in('MenuItemID', menuItemIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (customerError) return { ok: false as const, error: customerError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }
  if (menuItemError) return { ok: false as const, error: menuItemError.message, bookings: [], bookingItems: [], mealPrepOrders: [], mealPrepItems: [], customers: [], menuItems: [] }

  return { ok: true as const, bookings: bookings ?? [], bookingItems: bookingItems ?? [], mealPrepOrders: mealPrepOrders ?? [], mealPrepItems: mealPrepItems ?? [], customers: customers ?? [], menuItems: menuItems ?? [], preparationLogs: preparationLogs ?? [] }
}

export async function getOwnerFinancialData() {
  const owner = await requireRole('owner')
  if (!owner) {
    return { ok: false as const, error: 'Owner access required.', bookings: [], customers: [], invoices: [], payments: [], bookingItems: [], menuItems: [] }
  }

  const admin = createAdminClient()
  const operatorId = Number(owner.id)
  const [{ data: bookings, error: bookingError }, { data: invoices, error: invoiceError }, { data: payments, error: paymentError }, { data: bookingItems, error: bookingItemError }, { data: menuItems, error: menuItemError }] = await Promise.all([
    admin.from('BOOKING').select('BookingID, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status').eq('OperatorID', operatorId).order('EventDate', { ascending: false }),
    admin.from('INVOICE').select('InvoiceID, BookingID, TotalAmount, DateGenerated'),
    admin.from('PAYMENT').select('PaymentID, InvoiceID, Amount, PaymentType, Status, DatePaid').order('DatePaid', { ascending: false }),
    admin.from('BOOKING_ITEM').select('BookingItemID, BookingID, MenuItemID, Quantity'),
    admin.from('MENU_ITEM').select('MenuItemID, ItemName, Price'),
  ])

  const firstError = bookingError ?? invoiceError ?? paymentError ?? bookingItemError ?? menuItemError
  if (firstError) return { ok: false as const, error: 'Could not load payment records.', bookings: [], customers: [], invoices: [], payments: [], bookingItems: [], menuItems: [] }

  const customerIds = Array.from(new Set((bookings ?? []).map((booking) => booking.CustomerID)))
  const { data: customers, error: customerError } = customerIds.length
    ? await admin.from('CUSTOMER').select('CustomerID, Name, Email').in('CustomerID', customerIds)
    : { data: [], error: null }

  if (customerError) return { ok: false as const, error: 'Could not load customer records.', bookings: [], customers: [], invoices: [], payments: [], bookingItems: [], menuItems: [] }

  return { ok: true as const, bookings: bookings ?? [], customers: customers ?? [], invoices: invoices ?? [], payments: payments ?? [], bookingItems: bookingItems ?? [], menuItems: menuItems ?? [] }
}

export async function recordOwnerPayment(input: { invoiceId: number; amount: number; type: string }) {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.' }
  if (!Number.isFinite(input.invoiceId) || !Number.isFinite(input.amount) || input.amount <= 0) return { ok: false as const, error: 'Enter a valid payment.' }

  const admin = createAdminClient()
  const { data: invoice, error: invoiceError } = await admin.from('INVOICE').select('InvoiceID, BookingID, TotalAmount').eq('InvoiceID', input.invoiceId).maybeSingle()
  if (invoiceError || !invoice) return { ok: false as const, error: 'Invoice not found.' }

  const { data: booking, error: bookingError } = await admin.from('BOOKING').select('BookingID, OperatorID, Status').eq('BookingID', invoice.BookingID).maybeSingle()
  if (bookingError || !booking || booking.OperatorID !== Number(owner.id)) return { ok: false as const, error: 'You are not authorized to record this payment.' }
  if (booking.Status !== 'confirmed') return { ok: false as const, error: 'Payments can only be recorded against confirmed bookings.' }

  const { data: existingPayments, error: paymentsError } = await admin.from('PAYMENT').select('Amount').eq('InvoiceID', input.invoiceId)
  if (paymentsError) return { ok: false as const, error: 'Could not validate the outstanding balance.' }
  const paid = (existingPayments ?? []).reduce((sum, payment) => sum + Number(payment.Amount), 0)
  if (input.amount > Math.max(Number(invoice.TotalAmount) - paid, 0)) return { ok: false as const, error: 'Payment cannot be greater than the outstanding balance.' }

  const { error } = await admin.from('PAYMENT').insert({ InvoiceID: input.invoiceId, Amount: input.amount, PaymentType: input.type, Status: 'paid', DatePaid: new Date().toISOString() })
  if (error) return { ok: false as const, error: 'Could not record payment.' }
  return { ok: true as const }
}

export async function updateBookingStatus(bookingId: number, newStatus: 'confirmed' | 'rejected') {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.' }

  const admin = createAdminClient()
  const { data: booking, error: fetchError } = await admin.from('BOOKING').select('BookingID, OperatorID, DeliveryFee').eq('BookingID', bookingId).maybeSingle()
  if (fetchError) return { ok: false as const, error: fetchError.message }
  if (!booking || booking.OperatorID !== Number(owner.id)) return { ok: false as const, error: 'You are not authorized to update this booking.' }

  if (newStatus === 'confirmed') {
    const { data: existingInvoice, error: invoiceLookupError } = await admin
      .from('INVOICE')
      .select('InvoiceID')
      .eq('BookingID', bookingId)
      .maybeSingle()
    if (invoiceLookupError) return { ok: false as const, error: invoiceLookupError.message }

    if (!existingInvoice) {
      const { data: bookingItems, error: bookingItemsError } = await admin
  .from('BOOKING_ITEM')
  .select('MenuItemID, Quantity, UnitPrice')
  .eq('BookingID', bookingId)

if (bookingItemsError) {
  return { ok: false as const, error: bookingItemsError.message }
}

// Do not generate an invoice using current menu prices when a snapshot is missing.
const hasMissingPrice = (bookingItems ?? []).some(
  (item) => item.UnitPrice == null
)

if (hasMissingPrice) {
  return {
    ok: false as const,
    error: 'A booking item is missing its saved price. Please review this booking before generating its invoice.',
  }
}

if ((bookingItems ?? []).some((item) => item.UnitPrice == null)) {
  return {
    ok: false as const,
    error: 'Cannot generate invoice: one or more booking items have no saved historical price.',
  };
}

const pricesByMenuItemId = new Map(
  (bookingItems ?? []).map((item) => [
    Number(item.MenuItemID),
    Number(item.UnitPrice),
  ])
);

const totalAmount = computeBookingTotal(
  (bookingItems ?? []).map((item) => ({
    menuItemId: Number(item.MenuItemID),
    quantity: Number(item.Quantity ?? 0),
  })),
  pricesByMenuItemId,
) + Number(booking.DeliveryFee ?? 0)

      const { error: invoiceInsertError } = await admin.from('INVOICE').insert({
        BookingID: bookingId,
        TotalAmount: totalAmount,
        DateGenerated: new Date().toISOString(),
      })
      if (invoiceInsertError) return { ok: false as const, error: invoiceInsertError.message }
    }
  }

  const { error } = await admin.from('BOOKING').update({ Status: newStatus }).eq('BookingID', bookingId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

async function updateCustomerMealPrepStatus(mealPrepOrderId: number, expectedStatuses: string[], nextStatus: 'active' | 'paused' | 'cancelled') {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false as const, error: 'Customer access required.' }

  const admin = createAdminClient()
  const { data: mealPrepOrder, error: fetchError } = await admin
    .from('MEAL_PREP_ORDER')
    .select('MealPrepOrderID, CustomerID, Status')
    .eq('MealPrepOrderID', mealPrepOrderId)
    .maybeSingle()
  if (fetchError) return { ok: false as const, error: fetchError.message }
  if (!mealPrepOrder || mealPrepOrder.CustomerID !== Number(customer.id)) {
    return { ok: false as const, error: 'You are not authorized to update this meal-prep order.' }
  }
  if (!expectedStatuses.includes(String(mealPrepOrder.Status))) {
    return { ok: false as const, error: `This meal-prep order cannot be ${nextStatus}.` }
  }

  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({ Status: nextStatus })
    .eq('MealPrepOrderID', mealPrepOrderId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function pauseMealPrepOrder(mealPrepOrderId: number) {
  return updateCustomerMealPrepStatus(mealPrepOrderId, ['active'], 'paused')
}

export async function resumeMealPrepOrder(mealPrepOrderId: number) {
  return updateCustomerMealPrepStatus(mealPrepOrderId, ['paused'], 'active')
}

export async function cancelMealPrepOrder(mealPrepOrderId: number) {
  return updateCustomerMealPrepStatus(mealPrepOrderId, ['pending', 'confirmed', 'active', 'paused'], 'cancelled')
}

async function setArchiveState(kind: 'booking' | 'meal_prep', id: number, archived: boolean) {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.' }
  const admin = createAdminClient()
  const table = kind === 'booking' ? 'BOOKING' : 'MEAL_PREP_ORDER'
  const idColumn = kind === 'booking' ? 'BookingID' : 'MealPrepOrderID'
  const archiveFields = kind === 'booking'
    ? `${idColumn}, OperatorID, Status, EventDate, IsArchived`
    : `${idColumn}, OperatorID, Status, IsArchived`
  const { data: rawRow, error: fetchError } = await admin.from(table).select(archiveFields).eq(idColumn, id).maybeSingle()
  if (fetchError) return { ok: false as const, error: fetchError.message }
  const row = rawRow as {
    OperatorID: number | string
    Status: string | null
    EventDate?: string | null
    IsArchived: boolean | null
  } | null
  if (!row || Number(row.OperatorID) !== Number(owner.id)) return { ok: false as const, error: 'You are not authorized to update this order.' }
  if (archived && !row.IsArchived) {
    const status = String(row.Status ?? '').toLowerCase()
    const finished = kind === 'meal_prep'
      ? status === 'rejected' || status === 'cancelled'
      : status === 'rejected' || status === 'cancelled' || status === 'prepared' || (status === 'confirmed' && String(row.EventDate ?? '') < todayInManila())
    if (!finished) return { ok: false as const, error: 'Only finished orders can be archived. Pending, active, and paused orders must remain visible.' }
  }
  const { error } = await admin.from(table).update({ IsArchived: archived, ArchivedAt: archived ? new Date().toISOString() : null }).eq(idColumn, id)
  if (error) return { ok: false as const, error: error.message }
  revalidatePath('/owner/bookings')
  return { ok: true as const }
}

export async function archiveBooking(bookingId: number) { return setArchiveState('booking', bookingId, true) }
export async function restoreBooking(bookingId: number) { return setArchiveState('booking', bookingId, false) }
export async function archiveMealPrepOrder(id: number) { return setArchiveState('meal_prep', id, true) }
export async function restoreMealPrepOrder(id: number) { return setArchiveState('meal_prep', id, false) }

export async function updateMealPrepOrderStatus(mealPrepOrderId: number, newStatus: 'active' | 'rejected') {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false as const, error: 'Owner access required.' }

  const admin = createAdminClient()
  const { data: mealPrepOrder, error: fetchError } = await admin
    .from('MEAL_PREP_ORDER')
    .select('MealPrepOrderID, OperatorID')
    .eq('MealPrepOrderID', mealPrepOrderId)
    .maybeSingle()
  if (fetchError) return { ok: false as const, error: fetchError.message }
  if (!mealPrepOrder || mealPrepOrder.OperatorID !== Number(owner.id)) {
    return { ok: false as const, error: 'You are not authorized to update this meal-prep order.' }
  }

  const { error } = await admin
    .from('MEAL_PREP_ORDER')
    .update({ Status: newStatus })
    .eq('MealPrepOrderID', mealPrepOrderId)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
