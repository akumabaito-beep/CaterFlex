
'use client'

import { useEffect, useMemo, useState } from 'react'
import { getEventTypes } from '@/app/actions/event-type-actions'
import { DEFAULT_EVENT_TYPES } from '@/lib/event-types'
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
const MAX_OTHER_EVENT_LENGTH = 30

const KNOWN_ICONS: Record<string, LucideIcon> = {
  Wedding: Heart,
  Birthday: Cake,
  'Corporate Event': Briefcase,
  Debut: Sparkles,
  Christening: Baby,
  Graduation: GraduationCap,
  Anniversary: Gift,
  'Family Gathering': Users,
  'Holiday Party': PartyPopper,
  [OTHERS]: PenLine,
}

// Normalize capitalization, extra spaces, and trailing punctuation.
function normalizeEventType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function eventTypeIcon(
  label: string | null | undefined
): LucideIcon {
  return (label && KNOWN_ICONS[label]) || PartyPopper
}

/**
 * Pick an event type; "Others" reveals a box to type your own.
 * The final value stored is either a preset label or custom text.
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
  // The owner edits this list under Operating Rules.
  const [types, setTypes] = useState<string[]>(DEFAULT_EVENT_TYPES)

  useEffect(() => {
    getEventTypes()
      .then(setTypes)
      .catch(() => setTypes(DEFAULT_EVENT_TYPES))
  }, [])

  const matchingPreset = useMemo(() => {
    if (!value.trim()) return null

    return types.find(
      (label) =>
        normalizeEventType(label) === normalizeEventType(value)
    ) ?? null
  }, [types, value])

  const typeList = useMemo(
    () => [
      ...types.map((label) => ({
        label,
        icon: eventTypeIcon(label),
      })),
      { label: OTHERS, icon: PenLine },
    ],
    [types]
  )

  const [othersOn, setOthersOn] = useState(
    value.trim() !== '' &&
      !DEFAULT_EVENT_TYPES.some(
        (label) =>
          normalizeEventType(label) === normalizeEventType(value)
      )
  )

  // Automatically convert matching custom input into its preset label.
  useEffect(() => {
    if (matchingPreset) {
      setOthersOn(false)

      if (value !== matchingPreset) {
        onChange(matchingPreset)
      }
    } else if (value.trim()) {
      setOthersOn(true)
    }
  }, [matchingPreset, value, onChange])

  const selected = matchingPreset
    ? matchingPreset
    : othersOn
      ? OTHERS
      : ''

  return (
    <div className="w-full rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex items-center gap-2">
        <PartyPopper
          className="size-5 text-[#C8431B]"
          aria-hidden="true"
        />
        <p className="font-heading text-lg font-bold uppercase tracking-tight text-[#2B1D16]">
          What are you celebrating?
        </p>
      </div>

      <div
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5"
        role="radiogroup"
        aria-label="Event type"
      >
        {typeList.map(({ label, icon: Icon }) => {
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

                  if (matchingPreset) {
                    onChange('')
                  }
                } else {
                  setOthersOn(false)
                  onChange(label)
                }
              }}
              className={`flex h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                isSelected
                  ? 'border-[#C8431B] bg-[#C8431B] text-white'
                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
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
          <label
            className="mb-2 block text-sm font-semibold text-[#2B1D16]"
            htmlFor="event-type-other"
          >
            Tell us what kind of event *
          </label>

          <input
            id="event-type-other"
            type="text"
            autoFocus
            maxLength={MAX_OTHER_EVENT_LENGTH}
            placeholder="e.g. Baby shower, Retirement party"
            value={matchingPreset ? '' : value}
            onChange={(e) => {
              const typedValue = e.target.value.slice(
                0,
                MAX_OTHER_EVENT_LENGTH
              )

              const matched = types.find(
                (label) =>
                  normalizeEventType(label) ===
                  normalizeEventType(typedValue)
              )

              if (matched) {
                setOthersOn(false)
                onChange(matched)
              } else {
                setOthersOn(true)
                onChange(typedValue)
              }
            }}
            required
            className={inputClass}
          />
        </div>
      )}
    </div>
  )
}
