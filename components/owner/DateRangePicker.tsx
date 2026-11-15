'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/owner/DatePicker'
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
    `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] disabled:opacity-60 ${
      active
        ? 'border-[#C8431B] bg-[#C8431B] text-white'
        : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
    }`

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-[#FBF6EE] border border-[#E8D8C4] p-3">
          <div className="text-sm font-medium text-[#2B1D16]/80">
            From
            <span className="mt-1 block"><DatePicker value={from} max={to || undefined} onChange={setFrom} /></span>
          </div>
          <div className="text-sm font-medium text-[#2B1D16]/80">
            To
            <span className="mt-1 block"><DatePicker value={to} min={from || undefined} onChange={setTo} /></span>
          </div>
          <Button
            type="button"
            disabled={disabled || invalid}
            onClick={() => onChange({ preset: 'custom', from, to })}
            className="h-10 rounded-full bg-[#C8431B] text-white hover:bg-[#A93615] disabled:opacity-50"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  )
}
