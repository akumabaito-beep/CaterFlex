'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, PartyPopper, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  addEventType,
  deleteEventType,
  listEventTypes,
  renameEventType,
  setEventTypeActive,
  type EventTypeRow,
} from '@/app/actions/event-type-actions'
import { PageLoader } from '@/components/ui/PageLoader'

/** Lets the caterer choose which event types customers can pick on the booking form. */
export function EventTypeManager() {
  const [types, setTypes] = useState<EventTypeRow[] | null>(null)
  const [error, setError] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const result = await listEventTypes()
    if (result.ok) {
      setTypes(result.types)
      setError('')
    } else {
      setTypes([])
      setError(result.error)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return false
    }
    setError('')
    await load()
    return true
  }

  const iconBtn = 'flex size-8 items-center justify-center rounded-lg text-[#2B1D16]/60 transition-colors hover:bg-[#f1f1f2] hover:text-[#2B1D16] disabled:opacity-40'

  return (
    <section className="rounded-2xl border border-[#E8D8C4] bg-white">
      <div className="flex items-center gap-3 border-b border-[#E8D8C4] px-6 py-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-[#F6E3D3] text-[#C8431B]">
          <PartyPopper className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-heading text-lg font-bold uppercase text-[#2B1D16]">Event types</h2>
          <p className="text-sm text-[#2B1D16]/60">The choices customers see when booking. &ldquo;Others&rdquo; is always offered.</p>
        </div>
      </div>

      <div className="space-y-4 p-6">
        {error && <p role="alert" className="rounded-lg border border-[#B3261E]/30 bg-[#F8DDD9] px-3 py-2 text-sm font-medium text-[#B3261E]">{error}</p>}

        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (await run(() => addEventType(newLabel))) setNewLabel('')
          }}
        >
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            maxLength={40}
            placeholder="Add an event type, e.g. Baby Shower"
            aria-label="New event type"
            className="h-11 min-w-0 flex-1 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none transition-colors focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20"
          />
          <button type="submit" disabled={busy || !newLabel.trim()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#C8431B] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#A93615] disabled:opacity-50">
            <Plus className="size-4" aria-hidden="true" /> Add
          </button>
        </form>

        {types === null ? (
          <PageLoader compact label="Loading event types" />
        ) : types.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#DCC7A8] px-4 py-6 text-center text-sm text-[#2B1D16]/60">No event types yet.</p>
        ) : (
          <ul className="divide-y divide-[#E8D8C4] overflow-hidden rounded-xl border border-[#E8D8C4]">
            {types.map((type) => (
              <li key={type.id} className={`flex items-center gap-3 px-4 py-2.5 ${type.active ? 'bg-white' : 'bg-[#FBF6EE]'}`}>
                {editingId === type.id ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (await run(() => renameEventType(type.id, editLabel))) setEditingId(null)
                    }}
                  >
                    <input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)} maxLength={40} aria-label="Event type name" className="h-9 min-w-0 flex-1 rounded-lg border border-[#C8431B] bg-white px-3 text-sm outline-none" />
                    <button type="submit" disabled={busy || !editLabel.trim()} aria-label="Save name" className={iconBtn}><Check className="size-4 text-[#C8431B]" /></button>
                    <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className={iconBtn}><X className="size-4" /></button>
                  </form>
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 truncate text-sm font-medium ${type.active ? 'text-[#2B1D16]' : 'text-[#2B1D16]/50 line-through'}`}>{type.label}</span>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-[#2B1D16]/70">
                      <span className="hidden sm:inline">{type.active ? 'Shown' : 'Hidden'}</span>
                      <input type="checkbox" checked={type.active} disabled={busy} onChange={(e) => run(() => setEventTypeActive(type.id, e.target.checked))} className="peer sr-only" aria-label={`Show ${type.label} on the booking form`} />
                      <span aria-hidden="true" className="relative h-6 w-11 rounded-full bg-[#E8D8C4] transition-colors peer-checked:bg-[#C8431B] peer-focus-visible:ring-2 peer-focus-visible:ring-[#C8431B]/40 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                    </label>
                    <button type="button" onClick={() => { setEditingId(type.id); setEditLabel(type.label); setConfirmId(null) }} aria-label={`Rename ${type.label}`} className={iconBtn}><Pencil className="size-4" /></button>
                    {confirmId === type.id ? (
                      <span className="flex items-center gap-1">
                        <button type="button" disabled={busy} onClick={async () => { await run(() => deleteEventType(type.id)); setConfirmId(null) }} className="rounded-lg bg-[#B3261E] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#8f1d17]">Delete</button>
                        <button type="button" onClick={() => setConfirmId(null)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#2B1D16]/70 hover:bg-[#f1f1f2]">Keep</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(type.id)} aria-label={`Delete ${type.label}`} className={`${iconBtn} hover:bg-[#F8DDD9] hover:text-[#B3261E]`}><Trash2 className="size-4" /></button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-[#2B1D16]/60">Deleting or hiding a type never changes past bookings. They keep the name they were booked with.</p>
      </div>
    </section>
  )
}
