
import type { AllergenType, MenuItem } from '../types';

export interface MenuItemAllergenCheck {
  menuItemId: string;
  menuItemName: string;
  conflicts: AllergenType[];
}

/**
 * Normalizes allergen names so differences in capitalization,
 * spaces, and underscores do not prevent matching.
 */
function normalizeAllergen(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * Returns the allergens shared between a customer's declared
 * restrictions and a menu item's allergy tags.
 */
export function checkAllergenConflict(
  menuItem: Pick<MenuItem, 'allergyTags'>,
  dietaryRestrictions: AllergenType[]
): AllergenType[] {
  if (dietaryRestrictions.length === 0 || menuItem.allergyTags.length === 0) {
    return [];
  }

  const restrictionSet = new Set(
    dietaryRestrictions.map(normalizeAllergen)
  );

  return Array.from(
    new Set(
      menuItem.allergyTags.filter((tag) =>
        restrictionSet.has(normalizeAllergen(tag))
      )
    )
  );
}

/**
 * Convenience boolean wrapper around checkAllergenConflict.
 */
export function hasAllergenConflict(
  menuItem: Pick<MenuItem, 'allergyTags'>,
  dietaryRestrictions: AllergenType[]
): boolean {
  return checkAllergenConflict(menuItem, dietaryRestrictions).length > 0;
}

/**
 * Returns only menu items that have at least one allergen conflict.
 */
export function getConflictingMenuItems(
  menuItems: MenuItem[],
  dietaryRestrictions: AllergenType[]
): MenuItemAllergenCheck[] {
  if (dietaryRestrictions.length === 0) return [];

  return menuItems
    .map((item) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      conflicts: checkAllergenConflict(item, dietaryRestrictions),
    }))
    .filter((check) => check.conflicts.length > 0);
}

/**
 * Returns a unique list of allergens across all conflicting menu items.
 */
export function getUniqueConflictingAllergens(
  menuItems: MenuItem[],
  dietaryRestrictions: AllergenType[]
): AllergenType[] {
  const conflicts = getConflictingMenuItems(menuItems, dietaryRestrictions);
  const unique = new Set<AllergenType>();

  conflicts.forEach((check) =>
    check.conflicts.forEach((tag) => unique.add(tag))
  );

  return Array.from(unique);
}
