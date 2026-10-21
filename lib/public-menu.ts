import { createAdminClient } from '@/lib/supabase-admin'

export type PublicMenuItem = {
  id: number
  name: string
  category: string
  price: number
  description: string
  photoUrl: string | null
  allergens: string[]
}

/**
 * Read-only menu for the public /menu page.
 * Runs on the server with the service role, and returns ONLY customer-safe fields
 * (no ingredients, stock or prep data) for items that are marked available.
 */
export async function getPublicMenu(): Promise<{ items: PublicMenuItem[]; failed: boolean }> {
  try {
    const admin = createAdminClient()
    const [menu, relations, tags] = await Promise.all([
      admin
        .from('MENU_ITEM')
        .select('MenuItemID, ItemName, Category, Price, Description, PhotoURL')
        .eq('Availability', true)
        .order('Category')
        .order('ItemName'),
      admin.from('MENU_ITEM_ALLERGY').select('MenuItemID, AllergyTagID'),
      admin.from('ALLERGY_TAG').select('AllergyTagID, AllergenName'),
    ])
    if (menu.error) throw menu.error

    const tagName = new Map((tags.data ?? []).map((t) => [t.AllergyTagID, t.AllergenName as string]))
    const allergensByItem = new Map<number, string[]>()
    for (const r of relations.data ?? []) {
      const name = tagName.get(r.AllergyTagID)
      if (!name) continue
      allergensByItem.set(r.MenuItemID, [...(allergensByItem.get(r.MenuItemID) ?? []), name])
    }

    const items = (menu.data ?? []).map((m) => ({
      id: m.MenuItemID as number,
      name: m.ItemName as string,
      category: ((m.Category as string | null) ?? 'Other').trim() || 'Other',
      price: Number(m.Price ?? 0),
      description: (m.Description as string | null) ?? '',
      photoUrl: (m.PhotoURL as string | null) ?? null,
      allergens: allergensByItem.get(m.MenuItemID) ?? [],
    }))
    return { items, failed: false }
  } catch (error) {
    console.error('getPublicMenu failed:', error)
    return { items: [], failed: true }
  }
}