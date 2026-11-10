import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { checkOverPurchase, getMacroFlexOverview } from '@/lib/macroflex'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// One request for the whole MacroFlex page: every dish with its stock status and alternatives.
export async function GET() {
  const owner = await requireRole('owner')
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 })
  try {
    const admin = createAdminClient()
    const [items, { overPurchased }] = await Promise.all([getMacroFlexOverview(Number(owner.id), admin), checkOverPurchase(Number(owner.id), admin)])
    return NextResponse.json({ items, overPurchased })
  } catch (error) {
    console.error('[API] MacroFlex overview error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}
