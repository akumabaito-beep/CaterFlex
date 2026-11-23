import type { AllergenType } from '@/lib/types'

// The allergens CaterFlex supports. Anything else in the ALLERGY_TAG table is ignored by the app.
export const ALLERGEN_OPTIONS: AllergenType[] = [
  'peanuts',
  'tree_nuts',
  'dairy',
  'eggs',
  'gluten',
  'soy',
  'shellfish',
  'fish',
  'sesame',
]

const LABELS: Record<string, string> = {
  tree_nuts: 'tree nuts',
  gluten: 'gluten (wheat)',
}

export function isSupportedAllergen(name: string | null | undefined): name is AllergenType {
  return ALLERGEN_OPTIONS.includes(String(name ?? '').trim().toLowerCase() as AllergenType)
}

export function allergenLabel(name: string): string {
  const key = name.trim().toLowerCase()
  return LABELS[key] ?? key.replace(/_/g, ' ')
}
