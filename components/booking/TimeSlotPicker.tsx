'use client'

import { Clock } from 'lucide-react'

const STEP_MINUTES = 30

function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}
function toValue(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}
function toLabel(value: string): string {
  const [h, m] = value.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`
}

/**
 * Time picker that matches AvailabilityCalendar: same card, same colors.
 * Slots run every 30 minutes within the caterer's operating hours.
 */
export function TimeSlotPicker({
  value,
  onChange,
  start,
  end,
  hint = 'Pick a time to continue.',
}: {
  value: string
  onChange: (time: string) => void
  /** Operating hours, "HH:MM" or "HH:MM:SS" */
  start: string
  end: string
  hint?: string
}) {
  const from = toMinutes(start)
  const to = toMinutes(end)
  const slots: string[] = []
  for (let m = from; m <= to; m += STEP_MINUTES) slots.push(toValue(m))

  const current = value.slice(0, 5)

  return (
    <div className="w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="size-5 text-[#C8431B]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">
          Choose a time
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5" role="group" aria-label="Available times">
        {slots.map((slot) => {
          const selected = slot === current
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(slot)}
              className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                selected
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
              }`}
            >
              {toLabel(slot)}
            </button>
          )
        })}
      </div>

      <p className="mt-3 min-h-5 text-sm text-[#2B1D16]" aria-live="polite">
        {current
          ? `Selected: ${toLabel(current)}.`
          : hint}{' '}
        <span className="text-muted-foreground">
          Open {toLabel(toValue(from))} – {toLabel(toValue(to))}.
        </span>
      </p>
    </div>
  )
}
