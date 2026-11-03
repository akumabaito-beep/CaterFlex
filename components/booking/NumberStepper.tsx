'use client'

import { Minus, Plus, Users } from 'lucide-react'

/**
 * Number input styled like AvailabilityCalendar (same card, heading and colors).
 * `value` is a string so an empty field stays empty.
 */
export function NumberStepper({
  value,
  onChange,
  title,
  min = 1,
  max,
  unit,
  error,
}: {
  value: string
  onChange: (value: string) => void
  title: string
  min?: number
  max?: number
  unit: string
  error?: string | null
}) {
  const current = Number.parseInt(value, 10)
  const step = (delta: number) => {
    const base = Number.isFinite(current) ? current : delta > 0 ? min - 1 : min + 1
    const next = Math.max(min, Math.min(max ?? Infinity, base + delta))
    onChange(String(next))
  }
  const btn =
    'flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-[#8E1F2C] transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C] disabled:pointer-events-none disabled:opacity-30'

  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Users className="size-5 text-[#8E1F2C]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2A1B1F]">{title}</p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => step(-1)} disabled={Number.isFinite(current) && current <= min} aria-label={`Decrease ${unit}`} className={btn}>
          <Minus className="size-5" aria-hidden="true" />
        </button>

        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          placeholder="0"
          aria-label={title}
          className="h-14 min-w-0 flex-1 rounded-lg border border-[#8E1F2C] bg-[#8E1F2C] text-center font-heading text-3xl font-bold text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#8E1F2C]/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <button type="button" onClick={() => step(1)} disabled={max !== undefined && Number.isFinite(current) && current >= max} aria-label={`Increase ${unit}`} className={btn}>
          <Plus className="size-5" aria-hidden="true" />
        </button>
      </div>

      <p className={`mt-3 min-h-5 text-sm ${error ? 'font-medium text-red-600' : 'text-[#2A1B1F]'}`} aria-live="polite">
        {error ??
          (Number.isFinite(current) ? `${current} ${current === 1 ? unit.replace(/s$/, '') : unit}.` : `Enter the number of ${unit}.`)}
      </p>
      {max !== undefined && <p className="text-xs text-muted-foreground">Maximum: {max} {unit}.</p>}
    </div>
  )
}
