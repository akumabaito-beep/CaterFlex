'use server'

import { createAdminClient } from '@/lib/supabase-admin'
import type { Booking, DayOfWeek, OperatorSettings } from '@/lib/types'

const OPERATOR_ID = 2 // the single catering operator, same as the rest of the app
const DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6]

type SettingsRow = {
  DayOfWeek: string
  OperatingStartTime: string | null
  OperatingEndTime: string | null
  MaxCateringEventsPerDay: number | null
  MaxMealPrepOrdersPerDay: number | null
  MaxGuestCountPerEvent: number | null
}

export type EventAvailability =
  | { ok: true; settings: OperatorSettings; bookings: Booking[] }
  | { ok: false; error: string }

/**
 * Everything a customer needs to see which event dates are open, and nothing else:
 * the operating rules plus the date and status of bookings that take up capacity.
 * No customer names, venues or guest counts leave the server.
 */
export async function getEventAvailability(): Promise<EventAvailability> {
  const admin = createAdminClient()
  const [settingsResult, bookingsResult] = await Promise.all([
    admin
      .from('OPERATOR_SETTINGS')
      .select('DayOfWeek, OperatingStartTime, OperatingEndTime, MaxCateringEventsPerDay, MaxMealPrepOrdersPerDay, MaxGuestCountPerEvent')
      .eq('OperatorID', OPERATOR_ID)
      .order('DayOfWeek'),
    admin
      .from('BOOKING')
      .select('BookingID, EventDate, Status')
      .eq('OperatorID', OPERATOR_ID)
      .in('Status', ['pending', 'confirmed']),
  ])

  if (settingsResult.error || bookingsResult.error) {
    console.error('getEventAvailability failed:', settingsResult.error ?? bookingsResult.error)
    return { ok: false, error: 'Could not load availability.' }
  }

  const rows = (settingsResult.data ?? []) as SettingsRow[]
  if (rows.length === 0) return { ok: false, error: 'Availability has not been set up yet.' }

  const maxEventsPerDay = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<DayOfWeek, number>
  const maxMealPrepFulfillmentsPerDay = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 } as Record<DayOfWeek, number>
  for (const row of rows) {
    const day = Number(row.DayOfWeek) as DayOfWeek
    if (!DAYS.includes(day)) continue
    maxEventsPerDay[day] = row.MaxCateringEventsPerDay ?? 0
    maxMealPrepFulfillmentsPerDay[day] = row.MaxMealPrepOrdersPerDay ?? 0
  }

  const first = rows[0]
  const settings: OperatorSettings = {
    operatingDays: DAYS.filter((day) => maxEventsPerDay[day] > 0),
    operatingHoursStart: (first.OperatingStartTime ?? '').slice(0, 5),
    operatingHoursEnd: (first.OperatingEndTime ?? '').slice(0, 5),
    maxEventsPerDay,
    maxGuestsPerEvent: first.MaxGuestCountPerEvent ?? 0,
    maxMealPrepFulfillmentsPerDay,
  }

  const bookings = (bookingsResult.data ?? []).map((row) => ({
    id: String(row.BookingID),
    orderType: 'catering',
    eventDate: String(row.EventDate),
    status: row.Status,
  })) as unknown as Booking[]

  return { ok: true, settings, bookings }
}
