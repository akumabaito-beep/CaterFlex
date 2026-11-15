'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'

/**
 * How many servings of each dish the kitchen can make from the ingredients on hand right now.
 * Dishes with no recipe are left out (nothing limits them). Used to mark dishes on the customer menu.
 */
export async function getDishStock(): Promise<Record<number, number>> {
  const customer = await requireRole('customer')
  if (!customer) return {}

  const { data, error } = await createAdminClient()
    .from('DISH_INGREDIENT')
    .select('MenuItemID, QuantityRequiredPerServing, INGREDIENT:INGREDIENT(CurrentStock)')
  if (error || !data) return {}

  const maxServings: Record<number, number> = {}
  for (const row of data as unknown as Array<{ MenuItemID: number; QuantityRequiredPerServing: number | null; INGREDIENT: { CurrentStock: number | null } | { CurrentStock: number | null }[] | null }>) {
    const perServing = Number(row.QuantityRequiredPerServing ?? 0)
    if (perServing <= 0) continue
    const ingredient = Array.isArray(row.INGREDIENT) ? row.INGREDIENT[0] : row.INGREDIENT
    const servings = Math.max(0, Math.floor(Number(ingredient?.CurrentStock ?? 0) / perServing))
    const id = Number(row.MenuItemID)
    maxServings[id] = id in maxServings ? Math.min(maxServings[id], servings) : servings
  }
  return maxServings
}
