'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { DEFAULT_EVENT_TYPES } from '@/lib/event-types'

export type EventTypeRow = { id: number; label: string; active: boolean }

type Row = { EventTypeID: number; Label: string; IsActive: boolean }

/** Active event types for the booking form, in the owner's order. */
export async function getEventTypes(): Promise<string[]> {
  const { data, error } = await createAdminClient()
    .from('EVENT_TYPE')
    .select('Label')
    .eq('IsActive', true)
    .order('SortOrder')
    .order('EventTypeID')
  if (error || !data || data.length === 0) return DEFAULT_EVENT_TYPES
  return (data as { Label: string }[]).map((row) => row.Label)
}

/** Every event type, including hidden ones, for the owner's editor. */
export async function listEventTypes(): Promise<{ ok: true; types: EventTypeRow[] } | { ok: false; error: string }> {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false, error: 'Owner access required.' }
  const { data, error } = await createAdminClient()
    .from('EVENT_TYPE')
    .select('EventTypeID, Label, IsActive')
    .order('SortOrder')
    .order('EventTypeID')
  if (error) return { ok: false, error: 'Event types are not set up yet. Run supabase/add-event-types.sql in Supabase first.' }
  return { ok: true, types: (data as Row[]).map((row) => ({ id: Number(row.EventTypeID), label: row.Label, active: Boolean(row.IsActive) })) }
}

function cleanLabel(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, 40)
}

export async function addEventType(labelInput: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false, error: 'Owner access required.' }
  const label = cleanLabel(labelInput)
  if (!label) return { ok: false, error: 'Enter a name for the event type.' }
  if (label.toLowerCase() === 'others') return { ok: false, error: '"Others" is always offered, so it does not need adding.' }
  const admin = createAdminClient()
  const { data: last } = await admin.from('EVENT_TYPE').select('SortOrder').order('SortOrder', { ascending: false }).limit(1)
  const next = Number((last as { SortOrder: number }[] | null)?.[0]?.SortOrder ?? 0) + 1
  const { error } = await admin.from('EVENT_TYPE').insert({ Label: label, SortOrder: next })
  if (error) return { ok: false, error: error.code === '23505' ? 'That event type already exists.' : 'Could not add the event type.' }
  return { ok: true }
}

export async function renameEventType(id: number, labelInput: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false, error: 'Owner access required.' }
  const label = cleanLabel(labelInput)
  if (!label) return { ok: false, error: 'Enter a name for the event type.' }
  const { error } = await createAdminClient().from('EVENT_TYPE').update({ Label: label }).eq('EventTypeID', id)
  if (error) return { ok: false, error: error.code === '23505' ? 'That event type already exists.' : 'Could not rename the event type.' }
  return { ok: true }
}

export async function setEventTypeActive(id: number, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false, error: 'Owner access required.' }
  const { error } = await createAdminClient().from('EVENT_TYPE').update({ IsActive: active }).eq('EventTypeID', id)
  return error ? { ok: false, error: 'Could not update the event type.' } : { ok: true }
}

export async function deleteEventType(id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const owner = await requireRole('owner')
  if (!owner) return { ok: false, error: 'Owner access required.' }
  // Bookings keep the label as text, so deleting a type never changes past bookings.
  const { error } = await createAdminClient().from('EVENT_TYPE').delete().eq('EventTypeID', id)
  return error ? { ok: false, error: 'Could not delete the event type.' } : { ok: true }
}
