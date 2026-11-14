'use client'

import { useEffect, useState } from 'react'
import { Phone } from 'lucide-react'
import { customerNeedsContact, saveCustomerContact } from '@/app/actions/profile-actions'

/** Asks customers who signed in without a contact number (e.g. with Google) to add one. */
export function ContactPrompt() {
  const [needed, setNeeded] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    customerNeedsContact().then(setNeeded).catch(() => setNeeded(false))
  }, [])

  if (!needed) return null

  async function save() {
    setSaving(true)
    setError('')
    const result = await saveCustomerContact(value)
    setSaving(false)
    if (result.ok) setNeeded(false)
    else setError(result.error)
  }

  return (
    <div className="border-b border-[#C8431B]/30 bg-[#F6E3D3]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-6 py-3 lg:px-10">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#C8431B] text-white">
          <Phone className="size-4" aria-hidden="true" />
        </span>
        <p className="min-w-[14rem] flex-1 text-sm font-medium text-[#2B1D16]">
          Add your contact number so the caterer can reach you about your orders.
        </p>
        <input
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          placeholder="+63 917 123 4567"
          aria-label="Contact number"
          className="h-10 w-56 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none focus:border-[#C8431B]"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving || !value.trim()}
          className="h-10 rounded-lg bg-[#C8431B] px-4 text-sm font-semibold text-white hover:bg-[#A93615] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save number'}
        </button>
        {error && <p role="alert" className="w-full text-sm font-medium text-[#B3261E]">{error}</p>}
      </div>
    </div>
  )
}
