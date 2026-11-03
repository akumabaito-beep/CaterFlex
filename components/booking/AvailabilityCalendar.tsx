'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buildMonth, toLocalISO, type DayStatus } from '@/lib/rules/calendar'
import type { Booking, OperatorSettings, OrderType } from '@/lib/types'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_MONTHS_AHEAD = 12

const statusLabel: Record<DayStatus, string> = {
  past: 'passed',
  unavailable: 'unavailable',
  limited: 'last slot available',
  available: 'available',
}

function Dot({ className }: { className: string }) {
  return <span className={`inline-block size-3 rounded-sm ${className}`} aria-hidden="true" />
}

/**
 * Month calendar that shows which dates the caterer can still take.
 * Unavailable dates (closed days, full days, past dates) cannot be selected.
 */
export function AvailabilityCalendar({
  value,
  onChange,
  orderType,
  settings,
  bookings,
  hint = 'Pick a green or amber date to continue.',
  fill = false,
}: {
  value: string
  onChange: (date: string) => void
  orderType: OrderType
  settings: OperatorSettings
  bookings: Booking[]
  hint?: string
  /** Stretch to the full width of the container with larger day cells. */
  fill?: boolean
}) {
  const now = new Date()
  const initial = value ? new Date(`${value}T00:00:00`) : now
  const [cursor, setCursor] = useState({ year: initial.getFullYear(), month: initial.getMonth() })

  const days = useMemo(
    () => buildMonth(cursor.year, cursor.month, orderType, settings, bookings),
    [cursor, orderType, settings, bookings]
  )

  const monthIndex = cursor.year * 12 + cursor.month
  const nowIndex = now.getFullYear() * 12 + now.getMonth()
  const canGoBack = monthIndex > nowIndex
  const canGoForward = monthIndex < nowIndex + MAX_MONTHS_AHEAD
  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }

  const monthTitle = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const selected = days.find((d) => d.date === value) ?? null
  const todayISO = toLocalISO(now)

  return (
    <div className={`w-full rounded-xl border border-border bg-card shadow-sm ${fill ? 'p-4 sm:p-6' : 'max-w-md p-4'}`}>
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} disabled={!canGoBack} aria-label="Previous month" className="rounded-md p-2 text-[#8E1F2C] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C] disabled:pointer-events-none disabled:opacity-30">
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <p className={`font-heading font-bold uppercase tracking-tight text-[#2A1B1F] ${fill ? "text-2xl" : "text-lg"}`} aria-live="polite">{monthTitle}</p>
        <button type="button" onClick={() => step(1)} disabled={!canGoForward} aria-label="Next month" className="rounded-md p-2 text-[#8E1F2C] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C] disabled:pointer-events-none disabled:opacity-30">
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className={`mt-3 grid grid-cols-7 text-center font-semibold text-muted-foreground ${fill ? 'gap-2 text-sm' : 'gap-1 text-xs'}`} aria-hidden="true">
        {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
      </div>

      <div className={`mt-1 grid grid-cols-7 ${fill ? 'gap-2' : 'gap-1'}`} role="grid" aria-label={`${monthTitle} availability`}>
        {days.map((d) => {
          const isSelected = d.date === value
          const disabled = d.status === 'past' || d.status === 'unavailable'
          const fullDate = new Date(`${d.date}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

          let tone = 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          if (d.status === 'limited') tone = 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100'
          if (d.status === 'unavailable') tone = 'border-transparent bg-neutral-100 text-neutral-400 line-through'
          if (d.status === 'past') tone = 'border-transparent bg-transparent text-neutral-300'
          if (isSelected) tone = 'border-[#8E1F2C] bg-[#8E1F2C] text-white'

          return (
            <button
              key={d.date}
              type="button"
              role="gridcell"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`${fullDate}, ${statusLabel[d.status]}`}
              title={d.reason}
              onClick={() => onChange(d.date)}
              className={`relative flex ${fill ? 'h-12 text-base sm:h-16 sm:text-lg' : 'aspect-square text-sm'} items-center justify-center rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C] disabled:cursor-not-allowed ${tone} ${d.inMonth ? '' : 'opacity-40'} ${d.date === todayISO && !isSelected ? 'ring-1 ring-[#8E1F2C]/50' : ''}`}
            >
              {d.day}
            </button>
          )
        })}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Legend">
        <li className="flex items-center gap-1.5"><Dot className="border border-emerald-300 bg-emerald-50" /> Available</li>
        <li className="flex items-center gap-1.5"><Dot className="border border-amber-400 bg-amber-50" /> Last slot</li>
        <li className="flex items-center gap-1.5"><Dot className="bg-neutral-200" /> Unavailable</li>
        <li className="flex items-center gap-1.5"><Dot className="bg-[#8E1F2C]" /> Selected</li>
      </ul>

      <p className="mt-3 min-h-5 text-sm text-[#2A1B1F]" aria-live="polite">
        {selected
          ? selected.status === 'unavailable' || selected.status === 'past'
            ? selected.reason
            : selected.remaining !== undefined
              ? `${selected.remaining} ${selected.remaining === 1 ? 'slot' : 'slots'} left on this date.`
              : 'This date is available.'
          : value
            ? ''
            : hint}
      </p>
    </div>
  )
}
