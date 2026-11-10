import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: {} }))

import { checkSufficiencyWithAllocations, getMacroFlexOverview } from './macroflex'

type Row = Record<string, unknown>

const rice = (stock: number) => ({ IngredientID: 39, IngredientName: 'Rice', UnitOfMeasure: 'kg', CurrentStock: stock, OperatorID: 2 })

function fakeClient(stock: number) {
  const dishIngredients = (menuItemId: number, qty: number) => ({ MenuItemID: menuItemId, IngredientID: 39, QuantityRequiredPerServing: qty, INGREDIENT: rice(stock) })
  const tables: Record<string, Row[]> = {
    MENU_ITEM: [
      { MenuItemID: 20, ItemName: 'Adobo', Category: 'main', Price: 100, Availability: true, PrepTimeDays: 0, DISH_INGREDIENT: [dishIngredients(20, 1)] },
      { MenuItemID: 21, ItemName: 'Biko', Category: 'dessert', Price: 80, Availability: true, PrepTimeDays: 0, DISH_INGREDIENT: [dishIngredients(21, 2)] },
      { MenuItemID: 22, ItemName: 'Water', Category: 'beverage', Price: 20, Availability: true, PrepTimeDays: 0, DISH_INGREDIENT: [] },
    ],
    DISH_INGREDIENT: [dishIngredients(20, 1), dishIngredients(21, 2)],
    INGREDIENT: [{ IngredientID: 39, OperatorID: 2 }],
    BOOKING: [{ BookingID: 38, EventDate: '2026-10-24', GuestCount: 4, Status: 'confirmed', BOOKING_ITEM: [{ MenuItemID: 21, Quantity: 3 }] }],
    MEAL_PREP_ORDER: [],
    PREPARATION_LOG: [],
  }
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const query = {
        select: () => query,
        order: () => query,
        eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query },
        not: () => query,
        gte: () => query,
        lte: (key: string, value: unknown) => { rows = rows.filter((row) => String(row[key]) <= String(value)); return query },
        in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query },
        then: (resolve: (result: { data: Row[]; error: null }) => unknown) => Promise.resolve(resolve({ data: rows, error: null })),
      }
      return query
    },
  } as never
}

describe('getMacroFlexOverview', () => {
  it('gives the same status as checking each dish on its own', async () => {
    for (const stock of [6, 7, 20]) {
      const client = fakeClient(stock)
      const overview = await getMacroFlexOverview(2, client, '2026-10-24')
      for (const id of [20, 21]) {
        const single = await checkSufficiencyWithAllocations(id, 1, '2026-10-24', '2026-10-24', undefined, fakeClient(stock))
        const item = overview.find((o) => o.menuItemId === id)!
        expect(item.status === 'available').toBe(single.sufficient)
        expect(item.shortfalls).toEqual(single.shortfalls)
      }
    }
  })

  it('treats a dish with no ingredients as available and lists every dish', async () => {
    const overview = await getMacroFlexOverview(2, fakeClient(6), '2026-10-24')
    expect(overview.map((o) => o.itemName)).toEqual(['Adobo', 'Biko', 'Water'])
    expect(overview[2]).toMatchObject({ status: 'available', shortfalls: [], suggestions: [] })
  })
})
