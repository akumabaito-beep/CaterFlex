'use client'

import { CalendarDays } from 'lucide-react'
import { WEEKDAYS_MON_FIRST, deliveryDaysLabel } from '@/lib/meal-plan'

/**
 * Choose the weekdays meals are delivered. Same card, heading and colors as the other pickers.
 */
export function DaysPicker({
  value,
  onChange,
  title = 'Delivery days',
}: {
  value: number[]
  onChange: (days: number[]) => void
  title?: string
}) {
  const selected = new Set(value)
  const toggle = (day: number) => {
    const next = new Set(selected)
    if (next.has(day)) next.delete(day)
    else next.add(day)
    onChange(Array.from(next).sort((a, b) => a - b))
  }
  const preset = (days: number[]) => onChange(days)

  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-[#C8431B]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">{title}</p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label={title}>
        {WEEKDAYS_MON_FIRST.map((w) => {
          const on = selected.has(w.value)
          return (
            <button
              key={w.value}
              type="button"
              aria-pressed={on}
              aria-label={w.label}
              onClick={() => toggle(w.value)}
              className={`h-12 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                on
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
              }`}
            >
              {w.short}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <button type="button" onClick={() => preset([1, 2, 3, 4, 5])} className="rounded-full border border-[#E8D8C4] px-3 py-1 text-[#C8431B] hover:bg-[#F6E3D3]">Mon to Fri</button>
        <button type="button" onClick={() => preset([0, 1, 2, 3, 4, 5, 6])} className="rounded-full border border-[#E8D8C4] px-3 py-1 text-[#C8431B] hover:bg-[#F6E3D3]">Every day</button>
        <button type="button" onClick={() => preset([])} className="rounded-full border border-[#E8D8C4] px-3 py-1 text-[#2B1D16]/70 hover:bg-[#F6E3D3]">Clear</button>
      </div>

      <p className="mt-3 min-h-5 text-sm text-[#2B1D16]" aria-live="polite">
        {value.length ? `Selected: ${deliveryDaysLabel(value)}.` : 'Pick at least one day.'}
      </p>
    </div>
  )
}
