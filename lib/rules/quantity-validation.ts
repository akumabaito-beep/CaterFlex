
export function validatePerServingQuantity(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return 'Per-serving quantity must be a number greater than 0.'
  }

  return null
}

export function validateInventoryQuantity(quantity: number): string | null {
  return Number.isInteger(quantity) && quantity >= 0
    ? null
    : 'Stock and storage capacity must be whole numbers greater than or equal to 0.'
}
