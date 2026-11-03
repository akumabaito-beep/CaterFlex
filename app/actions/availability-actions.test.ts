import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient }))

import { getEventAvailability } from './availability-actions'

const rows = [0, 1, 2, 3, 4, 5, 6].map((d) => ({
  DayOfWeek: String(d),
  OperatingStartTime: '08:00:00',
  OperatingEndTime: '18:00:00',
  MaxCateringEventsPerDay: d === 0 ? 0 : 2,
  MaxMealPrepOrdersPerDay: 3,
  MaxGuestCountPerEvent: 100,
}))

function db(tables: Record<string, { data: unknown; error: unknown }>) {
  createAdminClient.mockReturnValue({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) chain[m] = () => chain
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(tables[table]).then(resolve)
      return chain
    },
  })
}

describe('getEventAvailability', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the operating rules and only date + status of bookings', async () => {
    db({
      OPERATOR_SETTINGS: { data: rows, error: null },
      BOOKING: { data: [{ BookingID: 9, EventDate: '2026-12-05', Status: 'confirmed', Venue: 'secret', GuestCount: 80 }], error: null },
    })
    const result = await getEventAvailability()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.settings.operatingDays).toEqual([1, 2, 3, 4, 5, 6])
    expect(result.settings.operatingHoursStart).toBe('08:00')
    expect(result.settings.maxEventsPerDay[1]).toBe(2)
    expect(result.bookings).toEqual([{ id: '9', orderType: 'catering', eventDate: '2026-12-05', status: 'confirmed' }])
  })

  it('fails safely when the database errors or settings are missing', async () => {
    db({ OPERATOR_SETTINGS: { data: null, error: { message: 'x' } }, BOOKING: { data: [], error: null } })
    expect((await getEventAvailability()).ok).toBe(false)
    db({ OPERATOR_SETTINGS: { data: [], error: null }, BOOKING: { data: [], error: null } })
    expect((await getEventAvailability()).ok).toBe(false)
  })
})
