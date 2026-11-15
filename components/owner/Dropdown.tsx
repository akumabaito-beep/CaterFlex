'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

export type DropdownOption = { value: string; label: string; hint?: string }
export type DropdownGroup = { label?: string; options: DropdownOption[] }

/**
 * A styled select with an animated list, optional search and grouped options.
 * Keyboard: Enter or Space opens, Escape closes, Tab moves on.
 */
export function Dropdown({
  value,
  onChange,
  groups,
  placeholder = 'Select…',
  searchable = false,
  disabled,
  ariaLabel,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  groups: DropdownGroup[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => groups.flatMap((g) => g.options).find((o) => o.value === value), [groups, value])

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

  const q = query.trim().toLowerCase()
  const visible = groups
    .map((g) => ({ ...g, options: g.options.filter((o) => !q || o.label.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length > 0)

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          setOpen((o) => !o)
          setQuery('')
        }}
        className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-[#E8D8C4] bg-white px-3 text-left text-sm text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:border-[#C8431B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]/30 disabled:opacity-60"
      >
        <span className={`truncate ${selected ? '' : 'text-[#2B1D16]/50'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`size-4 shrink-0 text-[#C8431B] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="owner-popover absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-[#E8D8C4] bg-white shadow-xl">
          {searchable && (
            <div className="relative border-b border-[#E8D8C4] p-2">
              <Search className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-[#2B1D16]/40" aria-hidden="true" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="h-9 w-full rounded-full border border-[#E8D8C4] bg-[#FBF6EE] pl-9 pr-3 text-sm outline-none focus:border-[#C8431B]"
              />
            </div>
          )}
          <div role="listbox" className="max-h-60 overflow-y-auto p-1.5">
            {visible.length === 0 && <p className="px-3 py-4 text-center text-sm text-[#2B1D16]/60">No matches</p>}
            {visible.map((g, gi) => (
              <div key={g.label ?? gi} className="py-0.5">
                {g.label && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[#C8431B]">{g.label}</p>}
                {g.options.map((o) => {
                  const active = o.value === value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(o.value)
                        setOpen(false)
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${active ? 'bg-[#F6E3D3] font-semibold text-[#C8431B]' : 'text-[#2B1D16] hover:bg-[#f1f1f2]'}`}
                    >
                      <span className="truncate">{o.label}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {o.hint && <span className="text-xs text-[#2B1D16]/50">{o.hint}</span>}
                        {active && <Check className="size-4" aria-hidden="true" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
