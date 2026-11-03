'use client'

import { useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PRESET_LABELS, type RangeInput, type RangePreset } from '@/lib/date-range'

const PRESETS: RangePreset[] = ['7d', '30d', '90d', 'month', 'last_month', 'year', 'all']

type Props = {
  value: RangeInput
  onChange: (value: RangeInput) => void
  disabled?: boolean
}

export function DateRangePicker({ value, onChange, disabled }: Props) {
  const [from, setFrom] = useState(value.from ?? '')
  const [to, setTo] = useState(value.to ?? '')
  const [showCustom, setShowCustom] = useState(value.preset === 'custom')
  const invalid = !from || !to || from > to

  const pill = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
      active
        ? 'border-[#9B1C2C] bg-[#9B1C2C] text-white'
        : 'border-[#E8D2D2] bg-white text-[#2A1B1F] hover:border-[#9B1C2C]/60'
    }`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-[#9B1C2C]" aria-hidden="true" />
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => {
              setShowCustom(false)
              onChange({ preset })
            }}
            className={pill(value.preset === preset && !showCustom)}
          >
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowCustom(true)}
          className={pill(showCustom)}
        >
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-[#FDECEC] p-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#2A1B1F]/70">
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-[#E8D2D2] bg-white px-3 py-2 text-sm normal-case text-[#2A1B1F]"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-[#2A1B1F]/70">
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 block rounded-lg border border-[#E8D2D2] bg-white px-3 py-2 text-sm normal-case text-[#2A1B1F]"
            />
          </label>
          <Button
            type="button"
            disabled={disabled || invalid}
            onClick={() => onChange({ preset: 'custom', from, to })}
            className="h-10 rounded-lg bg-[#9B1C2C] text-white hover:bg-[#7F1623] disabled:opacity-50"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
