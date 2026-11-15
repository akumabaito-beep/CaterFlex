'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (value: string) => (value ? new Date(`${value}T00:00:00`) : null)

/**
 * A small date field: a pill that shows the chosen date and opens a calendar. Works like
 * <input type="date"> (value is YYYY-MM-DD, min and max are respected) but looks like the rest of the owner area.
 */
export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'Pick a date',
  disabled,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = parse(value)
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? new Date()
    return { year: base.getFullYear(), month: base.getMonth() }
  })
  const root = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [alignRight, setAlignRight] = useState(false)

  // Open towards the left when the calendar would run off the right edge of the screen.
  useLayoutEffect(() => {
    if (!open || !root.current) return
    const trigger = root.current.getBoundingClientRect()
    const width = panel.current?.offsetWidth ?? 288
    setAlignRight(trigger.left + width > window.innerWidth - 12)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const days = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1)
    const start = new Date(cursor.year, cursor.month, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [cursor])

  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
  const today = iso(new Date())
  const step = (delta: number) => {
    const d = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: d.getFullYear(), month: d.getMonth() })
  }
  const label = selected ? selected.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : placeholder

  return (
    <div ref={root} className="relative inline-block">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open && selected) setCursor({ year: selected.getFullYear(), month: selected.getMonth() })
          setOpen((o) => !o)
        }}
        className="flex h-9 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white px-3.5 text-sm text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] disabled:opacity-60"
      >
        <CalendarDays className="size-4 text-[#C8431B]" aria-hidden="true" />
        <span className={selected ? '' : 'text-[#2B1D16]/50'}>{label}</span>
      </button>

      {open && (
        <div ref={panel} role="dialog" aria-label="Choose a date" className={`owner-popover absolute top-full z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] ${alignRight ? 'right-0' : 'left-0'} rounded-2xl border border-[#E8D8C4] bg-white p-4 shadow-xl`}>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="flex size-8 items-center justify-center rounded-full text-[#C8431B] hover:bg-[#F6E3D3]">
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <p className="font-heading text-sm font-bold uppercase tracking-wide text-[#2B1D16]" aria-live="polite">{title}</p>
            <button type="button" onClick={() => step(1)} aria-label="Next month" className="flex size-8 items-center justify-center rounded-full text-[#C8431B] hover:bg-[#F6E3D3]">
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-semibold uppercase text-[#2B1D16]/50" aria-hidden="true">
            {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1" role="grid">
            {days.map((d) => {
              const value_ = iso(d)
              const inMonth = d.getMonth() === cursor.month
              const blocked = (min && value_ < min) || (max && value_ > max)
              const isSelected = value_ === value
              return (
                <button
                  key={value_}
                  type="button"
                  role="gridcell"
                  disabled={Boolean(blocked)}
                  aria-pressed={isSelected}
                  aria-label={d.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  onClick={() => {
                    onChange(value_)
                    setOpen(false)
                  }}
                  className={`flex aspect-square items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] disabled:pointer-events-none disabled:opacity-25 ${
                    isSelected
                      ? 'bg-[#C8431B] font-semibold text-white'
                      : `${inMonth ? 'text-[#2B1D16]' : 'text-[#2B1D16]/35'} hover:bg-[#F6E3D3] ${value_ === today ? 'ring-1 ring-[#C8431B]/60' : ''}`
                  }`}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#E8D8C4] pt-3 text-sm">
            <button
              type="button"
              disabled={Boolean((min && today < min) || (max && today > max))}
              onClick={() => {
                onChange(today)
                setOpen(false)
              }}
              className="font-semibold text-[#C8431B] hover:underline disabled:opacity-40"
            >
              Today
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-[#2B1D16]/60 hover:text-[#2B1D16]">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
