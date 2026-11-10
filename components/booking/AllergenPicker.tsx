'use client'

import {
  Bean,
  Check,
  CircleHelp,
  Egg,
  Fish,
  Milk,
  Nut,
  ShieldAlert,
  Shrimp,
  Wheat,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  shellfish: Shrimp,
  fish: Fish,
  peanuts: Nut,
  tree_nuts: Nut,
  dairy: Milk,
  gluten: Wheat,
  eggs: Egg,
  soy: Bean,
  other: CircleHelp,
}

const label = (a: string) => a.replace(/_/g, ' ')

/**
 * Allergy toggles. Same card, heading and colors as AvailabilityCalendar.
 * Selected allergies turn dark red so they are easy to spot.
 */
export function AllergenPicker({
  options,
  selected,
  onToggle,
  onClear,
}: {
  options: string[]
  selected: string[]
  onToggle: (allergen: string) => void
  onClear: () => void
}) {
  const none = selected.length === 0

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-5 text-[#C8431B]" aria-hidden="true" />
          <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">
            Any allergies?
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          aria-pressed={none}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
            none
              ? 'border-[#C8431B] bg-[#C8431B] text-white'
              : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
          }`}
        >
          {none && <Check className="size-4" aria-hidden="true" />}
          No allergies
        </button>
      </div>

      <div
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
        role="group"
        aria-label="Allergies"
      >
        {options.map((allergen) => {
          const on = selected.includes(allergen)
          const Icon = ICONS[allergen] ?? CircleHelp
          return (
            <button
              key={allergen}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(allergen)}
              className={`relative flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                on
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-border bg-white text-[#2B1D16] hover:border-[#C8431B]/60 hover:bg-primary-soft'
              }`}
            >
              {on && (
                <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-[#C8431B]">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
              )}
              <Icon className="size-6" aria-hidden="true" />
              {label(allergen)}
            </button>
          )
        })}
      </div>

      <p className="mt-3 min-h-5 text-sm text-[#2B1D16]" aria-live="polite">
        {none
          ? 'No allergies selected.'
          : `Avoiding: ${selected.map(label).join(', ')}.`}{' '}
        <span className="text-muted-foreground">
          We will warn you about dishes that contain these.
        </span>
      </p>
    </div>
  )
}
