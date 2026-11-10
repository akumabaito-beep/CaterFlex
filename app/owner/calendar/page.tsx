'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Users, UtensilsCrossed } from 'lucide-react'
import { DashboardLayout } from '@/app/dashboard-layout'
import { Card } from '@/components/ui/card'
import { VenueText } from '@/components/owner/VenueText'
import { eventTypeIcon } from '@/components/booking/EventTypePicker'
import { getOwnerCalendarBookings, getOwnerCalendarMealPrep } from '@/app/actions/booking-actions'
import {
  calendarStatusClass,
  expandMealPrepOrdersForMonth,
  groupCalendarItemsByDate,
  statusLabel,
  type CalendarBooking,
  type CalendarItem,
  type CalendarMealPrepOrder,
} from '@/lib/calendar-meal-prep'

type CalBooking = CalendarBooking & { EventType?: string | null }
type Filter = 'all' | 'catering' | 'meal' | 'pending'

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'catering', label: 'Catering' },
  { key: 'meal', label: 'Meal prep' },
  { key: 'pending', label: 'Needs approval' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthKey = (date: string) => date.slice(0, 7)

/** "18:00:00" -> "6:00 PM"; anything else is returned as it is. */
function formatTime(value: string | null | undefined): string {
  if (!value) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return value
  const hours = Number(match[1])
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`
}

function longDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
}

function relativeDate(date: string, today: string) {
  const diff = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })
}

const typeLabel = (item: CalendarItem) => (item.kind === 'meal' ? 'Meal prep' : (item.booking as CalBooking).EventType?.trim() || 'Catering event')
const itemTime = (item: CalendarItem) => (item.kind === 'catering' ? item.booking.EventTime ?? '' : '')
const isPending = (item: CalendarItem) => item.status.toLowerCase() === 'pending'

const matches = (item: CalendarItem, filter: Filter) =>
  filter === 'all' ? true : filter === 'pending' ? isPending(item) : filter === 'catering' ? item.kind === 'catering' : item.kind === 'meal'

const byTime = (a: CalendarItem, b: CalendarItem) => a.date.localeCompare(b.date) || itemTime(a).localeCompare(itemTime(b)) || a.name.localeCompare(b.name)

/** Small coloured chip inside a day cell. Catering is maroon, meal prep is teal; pending ones are dashed. */
function chipClass(item: CalendarItem) {
  const base = item.kind === 'meal' ? 'bg-teal-50 text-teal-800 border-teal-600/40' : 'bg-[#F6E3D3] text-[#C8431B] border-[#C8431B]/30'
  const state = isPending(item) ? 'border-dashed' : item.status.toLowerCase() === 'paused' ? 'opacity-60' : ''
  return `border ${base} ${state}`
}

function CalendarDay({ day, date, items, selected, isToday, isPast, onSelect }: { day: number; date: string; items: CalendarItem[]; selected: boolean; isToday: boolean; isPast: boolean; onSelect: () => void }) {
  const shown = items.slice(0, 2)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${longDate(date)}: ${items.length} ${items.length === 1 ? 'event' : 'events'}`}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      className={`flex min-h-16 cursor-pointer flex-col rounded-xl border p-1.5 transition-all duration-150 hover:bg-[#F6E3D3]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] sm:min-h-28 sm:p-2 ${
        selected ? 'border-[#C8431B] bg-[#F6E3D3] shadow-sm ring-1 ring-[#C8431B]' : 'border-[#E8D8C4] bg-white'
      } ${isPast && !isToday ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <span className={`inline-flex size-6 items-center justify-center rounded-full text-sm font-semibold ${isToday ? 'bg-[#C8431B] text-white' : 'text-[#2B1D16]'}`}>{day}</span>
        {items.length > 0 && <span className="hidden rounded-full bg-[#C8431B]/10 px-1.5 text-[10px] font-bold text-[#C8431B] sm:inline">{items.length}</span>}
      </div>
      {/* Phones: just coloured dots. Larger screens: labelled chips. */}
      <div className="mt-1 flex flex-wrap gap-1 sm:hidden">
        {items.slice(0, 4).map((item) => <i key={`${item.kind}-${item.id}-dot`} className={`size-2 rounded-full ${item.kind === 'meal' ? 'bg-teal-600' : 'bg-[#C8431B]'}`} />)}
      </div>
      <div className="mt-1.5 hidden flex-col gap-1 sm:flex">
        {shown.map((item) => (
          <div key={`${item.kind}-${item.id}`} title={`${typeLabel(item)} – ${item.name} – ${statusLabel(item.status)}`} className={`truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium ${chipClass(item)}`}>
            {item.kind === 'catering' ? `${formatTime(itemTime(item))} ${typeLabel(item)}` : `Meal prep · ${item.name}`}
          </div>
        ))}
        {items.length > shown.length && <span className="px-1 text-[11px] font-semibold text-[#C8431B]">+{items.length - shown.length} more</span>}
      </div>
    </div>
  )
}

function AgendaCard({ item }: { item: CalendarItem }) {
  const Icon = item.kind === 'meal' ? UtensilsCrossed : eventTypeIcon((item.booking as CalBooking).EventType)
  return (
    <li className="rounded-xl border border-[#E8D8C4] bg-white p-4">
      <div className="flex items-start gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.kind === 'meal' ? 'bg-teal-50 text-teal-700' : 'bg-[#F6E3D3] text-[#C8431B]'}`}><Icon className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-heading text-base font-bold uppercase leading-tight tracking-tight text-[#2B1D16]">{typeLabel(item)}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${calendarStatusClass(item.status)}`}>{statusLabel(item.status)}</span>
          </div>
          <p className="text-sm text-muted-foreground">{item.name}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm text-[#2B1D16]">
        {item.kind === 'catering' ? (
          <>
            <div className="flex items-center gap-2"><Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{formatTime(item.booking.EventTime) || 'Time not set'}</dd></div>
            <div className="flex items-center gap-2"><Users className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{item.booking.GuestCount} guests</dd></div>
            <div className="flex items-start gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd className="min-w-0"><VenueText value={item.booking.Venue} /></dd></div>
          </>
        ) : (
          <div className="flex items-center gap-2"><UtensilsCrossed className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><dd>{item.mealPrep.mealsPerCycle} {item.mealPrep.mealsPerCycle === 1 ? 'meal' : 'meals'} per delivery · order #{item.id}</dd></div>
        )}
      </dl>
      <Link href={item.kind === 'meal' ? '/owner/prep-schedule' : '/owner/bookings'} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-[#C8431B] hover:underline">
        {item.kind === 'meal' ? 'Open prep schedule' : isPending(item) ? 'Review booking' : 'Open booking'} <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </li>
  )
}

export default function CalendarPage() {
  const todayDate = useMemo(() => ymd(new Date()), [])
  const [bookings, setBookings] = useState<CalBooking[]>([])
  const [mealPrepOrders, setMealPrepOrders] = useState<CalendarMealPrepOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedDate, setSelectedDate] = useState<string | null>(todayDate)
  const [viewDate, setViewDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [bookingResult, mealPrepResult] = await Promise.all([getOwnerCalendarBookings(), getOwnerCalendarMealPrep()])
        if (!bookingResult.ok) throw new Error(bookingResult.error)
        if (!mealPrepResult.ok) throw new Error(mealPrepResult.error)
        if (!active) return
        setBookings(bookingResult.bookings as CalBooking[])
        setMealPrepOrders(mealPrepResult.orders as CalendarMealPrepOrder[])
        setErrorMessage('')
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : 'Failed to load calendar.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [])

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthName = viewDate.toLocaleString('en-PH', { month: 'long', year: 'numeric' })
  const days = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const dateForDay = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

  // Everything in the viewed month (before filtering) feeds the summary numbers.
  const monthGrouped = useMemo(
    () => groupCalendarItemsByDate(bookings, expandMealPrepOrdersForMonth(mealPrepOrders, year, month + 1)),
    [bookings, mealPrepOrders, year, month],
  )
  const monthItems = useMemo(() => Object.values(monthGrouped).flat().filter((item) => monthKey(item.date) === `${year}-${pad(month + 1)}`), [monthGrouped, year, month])
  const stats = useMemo(() => {
    const catering = monthItems.filter((i) => i.kind === 'catering')
    const meal = monthItems.filter((i) => i.kind === 'meal')
    return {
      catering: catering.length,
      meal: meal.length,
      guests: catering.reduce((sum, i) => sum + (i.kind === 'catering' ? Number(i.booking.GuestCount) || 0 : 0), 0),
      pending: monthItems.filter(isPending).length,
    }
  }, [monthItems])

  const grouped = useMemo(() => {
    const out: Record<string, CalendarItem[]> = {}
    for (const [date, items] of Object.entries(monthGrouped)) {
      const kept = items.filter((item) => matches(item, filter)).sort(byTime)
      if (kept.length > 0) out[date] = kept
    }
    return out
  }, [monthGrouped, filter])

  // The next events from today on, looking three months ahead so it is not limited to the viewed month.
  const upcoming = useMemo(() => {
    const start = new Date()
    const window = [0, 1, 2].flatMap((k) => {
      const d = new Date(start.getFullYear(), start.getMonth() + k, 1)
      return expandMealPrepOrdersForMonth(mealPrepOrders, d.getFullYear(), d.getMonth() + 1)
    })
    return Object.values(groupCalendarItemsByDate(bookings, window)).flat()
      .filter((item) => item.date >= todayDate && matches(item, filter))
      .sort(byTime)
      .slice(0, 8)
  }, [bookings, mealPrepOrders, filter, todayDate])

  const goToMonth = (next: Date) => {
    setViewDate(next)
    setSelectedDate(monthKey(todayDate) === `${next.getFullYear()}-${pad(next.getMonth() + 1)}` ? todayDate : null)
  }
  const openDate = (date: string) => {
    const [y, m] = date.split('-').map(Number)
    setViewDate(new Date(y, m - 1, 1))
    setSelectedDate(date)
  }

  const selectedItems = selectedDate ? grouped[selectedDate] ?? [] : []
  const upcomingByDate = upcoming.reduce<Record<string, CalendarItem[]>>((groups, item) => { (groups[item.date] ??= []).push(item); return groups }, {})

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Calendar</h1>
            <p className="mt-2 text-surface-muted-foreground">Catering events and meal prep deliveries at a glance</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous month" onClick={() => goToMonth(new Date(year, month - 1, 1))} className="flex size-10 items-center justify-center rounded-xl border border-[#E8D8C4] bg-white hover:bg-[#F6E3D3]"><ChevronLeft className="size-5" /></button>
            <button type="button" onClick={() => goToMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="h-10 rounded-xl border border-[#E8D8C4] bg-white px-4 text-sm font-semibold hover:bg-[#F6E3D3]">Today</button>
            <button type="button" aria-label="Next month" onClick={() => goToMonth(new Date(year, month + 1, 1))} className="flex size-10 items-center justify-center rounded-xl border border-[#E8D8C4] bg-white hover:bg-[#F6E3D3]"><ChevronRight className="size-5" /></button>
          </div>
        </header>

        {errorMessage && <Card className="border-destructive/40 bg-destructive/10 p-4"><p className="text-sm text-destructive">{errorMessage}</p></Card>}

        <section aria-label={`${monthName} summary`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Catering events', value: stats.catering },
            { label: 'Meal prep deliveries', value: stats.meal },
            { label: 'Guests to serve', value: stats.guests },
            { label: 'Need approval', value: stats.pending, highlight: stats.pending > 0 },
          ].map((stat) => (
            <Card key={stat.label} className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stat.label}</p>
              <p className={`mt-1 font-heading text-3xl font-bold ${stat.highlight ? 'text-[#C8431B]' : 'text-[#2B1D16]'}`}>{loading ? '–' : stat.value}</p>
            </Card>
          ))}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-heading text-2xl font-bold text-card-foreground"><CalendarDays className="size-6 text-[#C8431B]" aria-hidden="true" />{monthName}</h2>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter events">
                {filters.map((f) => (
                  <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${filter === f.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>{f.label}</button>
                ))}
              </div>
            </div>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-[#C8431B]" />Catering</span>
              <span><i className="mr-1.5 inline-block size-2.5 rounded-full bg-teal-600" />Meal prep</span>
              <span><i className="mr-1.5 inline-block size-2.5 rounded-full border border-dashed border-[#C8431B]" />Dashed = pending</span>
            </div>
            {loading ? <p className="py-16 text-center text-muted-foreground">Loading calendar...</p> : (
              <>
                <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">{dayLabels.map((d) => <div key={d} className="py-1 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d}</div>)}</div>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                  {Array.from({ length: firstDay }, (_, i) => <div key={`empty-${i}`} aria-hidden="true" />)}
                  {Array.from({ length: days }, (_, i) => {
                    const date = dateForDay(i + 1)
                    return <CalendarDay key={date} day={i + 1} date={date} items={grouped[date] ?? []} selected={selectedDate === date} isToday={date === todayDate} isPast={date < todayDate} onSelect={() => setSelectedDate(date)} />
                  })}
                </div>
              </>
            )}
          </Card>

          <aside className="flex flex-col gap-6 xl:sticky xl:top-24 xl:self-start">
            <Card className="p-5">
              <h2 className="font-heading text-lg font-bold text-card-foreground">{selectedDate ? longDate(selectedDate) : 'Pick a day'}</h2>
              {selectedDate === null ? (
                <p className="mt-3 text-sm text-muted-foreground">Select a day on the calendar to see its events here.</p>
              ) : selectedItems.length === 0 ? (
                <p className="mt-3 rounded-xl border border-dashed border-[#E8D8C4] p-4 text-center text-sm text-muted-foreground">Nothing scheduled{filter !== 'all' ? ' for this filter' : ''}. A free day.</p>
              ) : (
                <ul key={selectedDate} className="owner-list-page mt-3 flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">{selectedItems.map((item) => <AgendaCard key={`${item.kind}-${item.id}`} item={item} />)}</ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="font-heading text-lg font-bold text-card-foreground">Coming up</h2>
              {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading...</p> : upcoming.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No upcoming events{filter !== 'all' ? ' for this filter' : ''}.</p>
              ) : (
                <div className="mt-3 flex flex-col gap-4">
                  {Object.entries(upcomingByDate).map(([date, items]) => (
                    <div key={date}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{relativeDate(date, todayDate)}</p>
                      <ul className="flex flex-col gap-1.5">
                        {items.map((item) => (
                          <li key={`${item.kind}-${item.id}-${date}`}>
                            <button type="button" onClick={() => openDate(date)} className="flex w-full items-center gap-3 rounded-xl border border-[#E8D8C4] bg-white px-3 py-2 text-left hover:bg-[#F6E3D3]">
                              <i className={`size-2.5 shrink-0 rounded-full ${item.kind === 'meal' ? 'bg-teal-600' : 'bg-[#C8431B]'}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-[#2B1D16]">{typeLabel(item)} · {item.name}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {item.kind === 'catering' ? `${formatTime(item.booking.EventTime)} · ${item.booking.GuestCount} guests` : `${item.mealPrep.mealsPerCycle} meals per delivery`}
                                </span>
                              </span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${calendarStatusClass(item.status)}`}>{statusLabel(item.status)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
