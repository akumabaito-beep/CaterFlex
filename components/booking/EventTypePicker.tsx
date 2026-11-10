'use client'

import { useState } from 'react'
import {
  Briefcase,
  Cake,
  GraduationCap,
  Gift,
  Heart,
  PartyPopper,
  Sparkles,
  Users,
  Baby,
  PenLine,
  type LucideIcon,
} from 'lucide-react'

const OTHERS = 'Others'

const EVENT_TYPES: { label: string; icon: LucideIcon }[] = [
  { label: 'Wedding', icon: Heart },
  { label: 'Birthday', icon: Cake },
  { label: 'Corporate Event', icon: Briefcase },
  { label: 'Debut', icon: Sparkles },
  { label: 'Christening', icon: Baby },
  { label: 'Graduation', icon: GraduationCap },
  { label: 'Anniversary', icon: Gift },
  { label: 'Family Gathering', icon: Users },
  { label: 'Holiday Party', icon: PartyPopper },
  { label: OTHERS, icon: PenLine },
]

/** Icon for an event type label. Anything typed under "Others" gets the party icon. */
export function eventTypeIcon(label: string | null | undefined): LucideIcon {
  return EVENT_TYPES.find((t) => t.label === label)?.icon ?? PartyPopper
}

const PRESETS = new Set(EVENT_TYPES.map((t) => t.label).filter((l) => l !== OTHERS))

/**
 * Pick an event type; "Others" reveals a box to type your own.
 * `value` is the final text stored on the booking (preset label or the typed text).
 */
export function EventTypePicker({
  value,
  onChange,
  inputClass,
}: {
  value: string
  onChange: (value: string) => void
  inputClass: string
}) {
  const [othersOn, setOthersOn] = useState(value !== '' && !PRESETS.has(value))
  const selected = othersOn ? OTHERS : PRESETS.has(value) ? value : ''

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <PartyPopper className="size-5 text-[#C8431B]" aria-hidden="true" />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">
          What are you celebrating?
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5" role="radiogroup" aria-label="Event type">
        {EVENT_TYPES.map(({ label, icon: Icon }) => {
          const isSelected = selected === label
          return (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => {
                if (label === OTHERS) {
                  setOthersOn(true)
                  if (PRESETS.has(value)) onChange('')
                } else {
                  setOthersOn(false)
                  onChange(label)
                }
              }}
              className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                isSelected
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
              }`}
            >
              <Icon className="size-6" aria-hidden="true" />
              {label}
            </button>
          )
        })}
      </div>

      {othersOn && (
        <div className="mt-4">
          <label className="mb-2 block text-sm font-semibold text-[#2B1D16]" htmlFor="event-type-other">
            Tell us what kind of event *
          </label>
          <input
            id="event-type-other"
            type="text"
            autoFocus
            placeholder="e.g. Baby shower, Retirement party"
            value={PRESETS.has(value) ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            required
            className={inputClass}
          />
        </div>
      )}

      <p className="mt-3 min-h-5 text-sm text-[#2B1D16]" aria-live="polite">
        {value ? `Selected: ${value}.` : othersOn ? '' : 'Pick the kind of event.'}
      </p>
    </div>
  )
}
