import type { Booking, OperatorSettings, OrderType } from '../types'
import { getDateAvailability } from './bookingValidation'

export type DayStatus = 'past' | 'unavailable' | 'limited' | 'available'

export interface CalendarDay {
  date: string // YYYY-MM-DD in local time
  day: number
  inMonth: boolean
  status: DayStatus
  reason?: string
  remaining?: number
}

/** Local-time YYYY-MM-DD. (toISOString() would shift the date by the timezone offset.) */
export function toLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Builds the 6-week grid for a month. Each day is marked past, unavailable (closed day or full),
 * limited (one slot left) or available, using the same rules the booking form validates against.
 */
export function buildMonth(
  year: number,
  month: number, // 0-11
  orderType: OrderType,
  settings: OperatorSettings,
  bookings: Booking[],
  today: Date = new Date()
): CalendarDay[] {
  const todayISO = toLocalISO(today)
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay()) // back up to Sunday
  const days: CalendarDay[] = []

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const date = toLocalISO(d)
    const inMonth = d.getMonth() === month

    if (date < todayISO) {
      days.push({ date, day: d.getDate(), inMonth, status: 'past', reason: 'This date has passed.' })
      continue
    }

    const availability = getDateAvailability(date, orderType, settings, bookings)
    if (!availability.available) {
      days.push({ date, day: d.getDate(), inMonth, status: 'unavailable', reason: availability.reason })
    } else {
      const remaining = availability.remainingCapacity
      days.push({
        date,
        day: d.getDate(),
        inMonth,
        status: remaining !== undefined && remaining <= 1 ? 'limited' : 'available',
        remaining,
      })
    }
  }
  return days
}