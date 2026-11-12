'use client'

import type { LucideIcon } from 'lucide-react'

/**
 * Choose one of a few options. Same card, heading and colors as AvailabilityCalendar.
 * Used instead of a native dropdown.
 */
export function OptionCardPicker<T extends string>({
  title,
  icon: Icon,
  value,
  onChange,
  options,
}: {
  title: string
  icon: LucideIcon
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; hint?: string }[]
}) {
  const selectedOption = options.find((o) => o.value === value)

  return (
    <div className="h-full w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className="size-5 text-[#C8431B]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">{title}</p>
      </div>

      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={title}>
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={`flex h-14 items-center justify-between rounded-lg border px-4 text-left font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                selected
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
              }`}
            >
              <span className="font-heading text-lg uppercase tracking-tight">{option.label}</span>
              {option.hint && (
                <span className={`text-xs font-medium ${selected ? 'text-white/80' : 'text-[#2B1D16]/70'}`}>
                  {option.hint}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-3 min-h-5 text-sm text-[#2B1D16]" aria-live="polite">
        {selectedOption ? `Selected: ${selectedOption.label}.` : ''}
      </p>
    </div>
  )
}
