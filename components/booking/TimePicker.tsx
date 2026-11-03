'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Clock } from 'lucide-react'

const MINUTE_STEP = 1

type Parts = { h: number; m: number; pm: boolean } // h is 1-12

function toMinutes(t: string): number {
  const [h, m] = t.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}
function fromValue(value: string): Parts | null {
  if (!/^\d{1,2}:\d{2}/.test(value)) return null
  const total = toMinutes(value)
  const h24 = Math.floor(total / 60)
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, m: total % 60, pm: h24 >= 12 }
}
function toTotal({ h, m, pm }: Parts): number {
  return ((h % 12) + (pm ? 12 : 0)) * 60 + m
}
function toValue(p: Parts): string {
  const t = toTotal(p)
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
function label(total: number): string {
  const h24 = Math.floor(total / 60)
  return `${h24 % 12 === 0 ? 12 : h24 % 12}:${String(total % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`
}

function Column({
  title,
  display,
  muted,
  onUp,
  onDown,
  onType,
  onBlur,
}: {
  title: string
  display: string
  muted: boolean
  onUp: () => void
  onDown: () => void
  /** When given, the tile is a text box the customer can type into. */
  onType?: (text: string) => void
  onBlur?: () => void
}) {
  const tile = `my-1 flex h-14 w-full items-center justify-center rounded-lg border text-center font-heading text-3xl font-bold ${
    muted
      ? 'border-border bg-neutral-50 text-neutral-300'
      : 'border-[#8E1F2C] bg-[#8E1F2C] text-white'
  }`
  const arrow =
    'flex h-9 w-full items-center justify-center rounded-md text-[#8E1F2C] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C]'
  return (
    <div className="flex flex-1 flex-col items-center">
      <span className="mb-1 text-xs font-semibold text-muted-foreground">{title}</span>
      <button type="button" onClick={onUp} aria-label={`Increase ${title.toLowerCase()}`} className={arrow}>
        <ChevronUp className="size-5" aria-hidden="true" />
      </button>
      {onType ? (
        <input
          type="text"
          inputMode="numeric"
          maxLength={2}
          value={muted ? '' : display}
          placeholder="--"
          aria-label={title}
          onChange={(e) => onType(e.target.value.replace(/\D/g, ''))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={onBlur}
          className={`${tile} placeholder:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-[#8E1F2C]/40`}
        />
      ) : (
        <div className={tile} aria-live="polite">
          {display}
        </div>
      )}
      <button type="button" onClick={onDown} aria-label={`Decrease ${title.toLowerCase()}`} className={arrow}>
        <ChevronDown className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * Time picker styled like AvailabilityCalendar (same card, heading and colors).
 * Hour / minute / AM-PM steppers; the value is only emitted when it is inside operating hours.
 * `value` and `onChange` use 24-hour "HH:MM"; '' means no valid time yet.
 */
export function TimePicker({
  value,
  onChange,
  start,
  end,
}: {
  value: string
  onChange: (time: string) => void
  start: string
  end: string
}) {
  const from = toMinutes(start)
  const to = toMinutes(end)
  const [parts, setParts] = useState<Parts | null>(fromValue(value))
  const shown = fromValue(value) ?? parts
  const [draft, setDraft] = useState<{ field: 'h' | 'm'; text: string } | null>(null)

  const apply = (next: Parts) => {
    setParts(next)
    const total = toTotal(next)
    onChange(total >= from && total <= to ? toValue(next) : '')
  }
  const base = (): Parts => shown ?? fromValue(start) ?? { h: 12, m: 0, pm: true }
  const touched = shown !== null

  const stepHour = (d: number) => {
    const b = base()
    apply({ ...b, h: ((b.h - 1 + d + 12) % 12) + 1 })
  }
  const stepMinute = (d: number) => {
    const b = base()
    apply({ ...b, m: (b.m + d * MINUTE_STEP + 60) % 60 })
  }
  const typeField = (field: 'h' | 'm', text: string) => {
    setDraft({ field, text })
    if (text === '') return
    const n = Number(text)
    const b = base()
    if (field === 'h' && n >= 1 && n <= 12) apply({ ...b, h: n })
    if (field === 'm' && n >= 0 && n <= 59) apply({ ...b, m: n })
  }
  const flip = () => {
    const b = base()
    apply({ ...b, pm: !b.pm })
  }

  const outOfHours = touched && shown !== null && !(toTotal(shown) >= from && toTotal(shown) <= to)

  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Clock className="size-5 text-[#8E1F2C]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2A1B1F]">
          Choose a time
        </p>
      </div>

      <div className="mt-3 flex items-start gap-2">
        <Column
          title="Hour"
          display={draft?.field === 'h' ? draft.text : touched ? String(shown!.h) : '--'}
          muted={!touched && draft?.field !== 'h'}
          onUp={() => stepHour(1)}
          onDown={() => stepHour(-1)}
          onType={(t) => typeField('h', t)}
          onBlur={() => setDraft(null)}
        />
        <span className="mt-[4.25rem] font-heading text-2xl font-bold text-[#2A1B1F]" aria-hidden="true">:</span>
        <Column
          title="Minute"
          display={draft?.field === 'm' ? draft.text : touched ? String(shown!.m).padStart(2, '0') : '--'}
          muted={!touched && draft?.field !== 'm'}
          onUp={() => stepMinute(1)}
          onDown={() => stepMinute(-1)}
          onType={(t) => typeField('m', t)}
          onBlur={() => setDraft(null)}
        />
        <Column
          title="AM / PM"
          display={touched ? (shown!.pm ? 'PM' : 'AM') : '--'}
          muted={!touched}
          onUp={flip}
          onDown={flip}
        />
      </div>

      <p
        className={`mt-3 min-h-5 text-sm ${outOfHours ? 'font-medium text-red-600' : 'text-[#2A1B1F]'}`}
        aria-live="polite"
      >
        {outOfHours
          ? `Please choose a time between ${label(from)} and ${label(to)}.`
          : touched
            ? `Selected: ${label(toTotal(shown!))}.`
            : 'Type a time or use the arrows.'}
      </p>
      <p className="text-xs text-muted-foreground">
        Open {label(from)} – {label(to)}.
      </p>
    </div>
  )
}
