import { describe, expect, it } from 'vitest'
import { buildMonth, toLocalISO } from './calendar'
import type { Booking, OperatorSettings } from '../types'

const settings: OperatorSettings = {
  operatingDays: [1, 2, 3, 4, 5, 6], // closed on Sundays
  operatingHoursStart: '08:00',
  operatingHoursEnd: '18:00',
  maxEventsPerDay: { 0: 0, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
  maxGuestsPerEvent: 100,
  maxMealPrepFulfillmentsPerDay: { 0: 0, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
}

const booking = (eventDate: string, status: Booking['status'] = 'confirmed') =>
  ({ id: eventDate + status, orderType: 'catering', eventDate, status }) as unknown as Booking

// Nov 1 2026 is a Sunday. "Today" is Tuesday Nov 3.
const today = new Date(2026, 10, 3)
const find = (days: ReturnType<typeof buildMonth>, date: string) => days.find((d) => d.date === date)!

describe('buildMonth', () => {
  it('builds a 6-week grid starting on a Sunday', () => {
    const days = buildMonth(2026, 10, 'catering', settings, [], today)
    expect(days).toHaveLength(42)
    expect(new Date(`${days[0].date}T00:00:00`).getDay()).toBe(0)
  })

  it('marks past dates, closed days, open days', () => {
    const days = buildMonth(2026, 10, 'catering', settings, [], today)
    expect(find(days, '2026-11-02').status).toBe('past')
    expect(find(days, '2026-11-08').status).toBe('unavailable') // a Sunday
    expect(find(days, '2026-11-09')).toMatchObject({ status: 'available', remaining: 2 })
  })

  it('marks one remaining slot as limited and a full day as unavailable', () => {
    const days = buildMonth(2026, 10, 'catering', settings, [booking('2026-11-03'), booking('2026-11-04'), booking('2026-11-04')], today)
    expect(find(days, '2026-11-03')).toMatchObject({ status: 'limited', remaining: 1 })
    expect(find(days, '2026-11-04').status).toBe('unavailable')
  })

  it('does not count rejected or completed bookings against capacity', () => {
    const days = buildMonth(2026, 10, 'catering', settings, [booking('2026-11-04', 'rejected'), booking('2026-11-04', 'completed')], today)
    expect(find(days, '2026-11-04')).toMatchObject({ status: 'available', remaining: 2 })
  })

  it('formats local dates without a timezone shift', () => {
    expect(toLocalISO(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})