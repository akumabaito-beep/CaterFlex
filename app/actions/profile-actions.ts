'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'

const PH_MOBILE = /^(09|\+639)\d{9}$/

/** True when the signed-in customer has no contact number yet (for example after Google sign-in). */
export async function customerNeedsContact() {
  const customer = await requireRole('customer')
  if (!customer) return false
  const { data } = await createAdminClient()
    .from('CUSTOMER')
    .select('Contact')
    .eq('CustomerID', Number(customer.id))
    .maybeSingle()
  return !String(data?.Contact ?? '').trim()
}

export async function saveCustomerContact(contactInput: string) {
  const customer = await requireRole('customer')
  if (!customer) return { ok: false as const, error: 'Please sign in again.' }
  const contact = contactInput.replace(/[\s-]/g, '')
  if (!PH_MOBILE.test(contact)) {
    return { ok: false as const, error: 'Enter a valid mobile number, like +63 917 123 4567.' }
  }
  const { error } = await createAdminClient()
    .from('CUSTOMER')
    .update({ Contact: contact })
    .eq('CustomerID', Number(customer.id))
  if (error) return { ok: false as const, error: 'Could not save your number. Try again.' }
  return { ok: true as const }
}
