// Run from the project root:  node apply-subscription-owner.mjs   (safe to run twice)
// Makes the owner calendar, ingredient forecasting and "mark prepared" check count EVERY chosen
// delivery day of a subscription plan, not just one delivery a week.
import fs from 'node:fs'

function patch(file, pairs, extra) {
  if (!fs.existsSync(file)) { console.log('  not found, skipped:', file); return }
  const raw = fs.readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  let s = raw.replace(/\r\n/g, '\n')
  for (const [a, b, done] of pairs) {
    if (s.includes(done)) continue
    const n = s.split(a).length - 1
    if (n !== 1) { console.error(`FAILED in ${file}: found ${n} matches for:\n${a.slice(0, 160)}`); process.exit(1) }
    s = s.replace(a, () => b)
  }
  if (extra) s = extra(s)
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s)
  console.log('checked', file)
}

patch('lib/rules/allocation.ts', [
  ["export function expandRecurringDates(nextFulfillmentDate: string, pattern: 'weekly' | 'biweekly', horizonDays = 28): string[] {\n  const dates: string[] = []\n  const start = nextFulfillmentDate.slice(0, 10)\n",
   "export function expandRecurringDates(\n  nextFulfillmentDate: string,\n  pattern: 'weekly' | 'biweekly',\n  horizonDays = 28,\n  deliveryDays: number[] = [],\n  termEnd: string | null = null\n): string[] {\n  const dates: string[] = []\n  const start = nextFulfillmentDate.slice(0, 10)\n  if (deliveryDays.length > 0) {\n    // Subscription plans: every chosen weekday until the term ends (or the horizon is reached).\n    const last = addDays(start, horizonDays)\n    const limit = termEnd && termEnd.slice(0, 10) < last ? termEnd.slice(0, 10) : last\n    for (let d = firstDeliveryOnOrAfter(start, deliveryDays); d <= limit && dates.length < 400; d = nextDeliveryAfter(d, deliveryDays)) dates.push(d)\n    return dates\n  }\n",
   "deliveryDays: number[] = []"],
  ["export type CommitmentRef", "import { firstDeliveryOnOrAfter, nextDeliveryAfter } from '../meal-plan'\n\nexport type CommitmentRef", "import { firstDeliveryOnOrAfter, nextDeliveryAfter } from '../meal-plan'"],
])

patch('lib/macroflex.ts', [
  ["RecurrencePattern: 'weekly' | 'biweekly'; MealsPerCycle: number;", "RecurrencePattern: 'weekly' | 'biweekly'; DeliveryDays?: string | null; TermEndDate?: string | null; MealsPerCycle: number;", "DeliveryDays?: string | null; TermEndDate?: string | null; MealsPerCycle"],
  ["const mealPrepQuery = client.from('MEAL_PREP_ORDER').select('MealPrepOrderID, NextFulfillmentDate, RecurrencePattern, MealsPerCycle,", "const mealPrepQuery = client.from('MEAL_PREP_ORDER').select('MealPrepOrderID, NextFulfillmentDate, RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle,", "RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle, MEAL_PREP_ITEM(MenuItemID, Quantity)').in('Status', ['pending'"],
  ["expandRecurringDates(String(order.NextFulfillmentDate), order.RecurrencePattern))", "expandRecurringDates(String(order.NextFulfillmentDate), order.RecurrencePattern, 28, parseDeliveryDays(order.DeliveryDays), order.TermEndDate ?? null))", "28, parseDeliveryDays(order.DeliveryDays)"],
  ["client.from('MEAL_PREP_ORDER').select('MealPrepOrderID, NextFulfillmentDate, RecurrencePattern, MealsPerCycle, MEAL_PREP_ITEM(MenuItemID, Quantity)').in('Status', ['active', 'confirmed']).gte(", "client.from('MEAL_PREP_ORDER').select('MealPrepOrderID, NextFulfillmentDate, RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle, MEAL_PREP_ITEM(MenuItemID, Quantity)').in('Status', ['active', 'confirmed']).gte(", "RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle, MEAL_PREP_ITEM(MenuItemID, Quantity)').in('Status', ['active', 'confirmed'])"],
  ["expandRecurringDates(order.NextFulfillmentDate, order.RecurrencePattern))", "expandRecurringDates(order.NextFulfillmentDate, order.RecurrencePattern, 28, parseDeliveryDays((order as { DeliveryDays?: string | null }).DeliveryDays), (order as { TermEndDate?: string | null }).TermEndDate ?? null))", "(order as { DeliveryDays?: string | null }).DeliveryDays"],
  ["import { buildCommitment,", "import { parseDeliveryDays } from './meal-plan'\nimport { buildCommitment,", "import { parseDeliveryDays } from './meal-plan'"],
])

patch('app/actions/preparation-actions.ts', [
  ["'MealPrepOrderID, OperatorID, MealsPerCycle, Status, NextFulfillmentDate')", "'MealPrepOrderID, OperatorID, MealsPerCycle, Status, NextFulfillmentDate, RecurrencePattern, DeliveryDays, TermEndDate' as string)", "RecurrencePattern, DeliveryDays, TermEndDate' as string)"],
  ["const preparedOrder = order as Record<string, unknown>", "const preparedOrder = order as unknown as Record<string, unknown>", "order as unknown as Record<string, unknown>"],
  ["expandRecurringDates(String(preparedOrder.NextFulfillmentDate), pattern);", "expandRecurringDates(String(preparedOrder.NextFulfillmentDate), pattern, 28, parseDeliveryDays(preparedOrder.DeliveryDays), preparedOrder.TermEndDate ? String(preparedOrder.TermEndDate) : null);", "parseDeliveryDays(preparedOrder.DeliveryDays)"],
  ["import { computeOrderIngredientUsage,", "import { parseDeliveryDays } from '../../lib/meal-plan'\nimport { computeOrderIngredientUsage,", "import { parseDeliveryDays } from '../../lib/meal-plan'"],
])

patch('lib/calendar-meal-prep.ts', [
  ["  recurrencePattern: string\n  mealsPerCycle: number", "  recurrencePattern: string\n  deliveryDays?: number[]\n  termEnd?: string | null\n  mealsPerCycle: number", "deliveryDays?: number[]"],
  ["    const step = pattern === 'weekly' ? 7 : pattern === 'biweekly' ? 14 : 0\n    const dates: string[] = []\n",
   "    const dates: string[] = []\n    if (order.deliveryDays && order.deliveryDays.length > 0) {\n      // Subscription plan: every chosen weekday from the next delivery until the plan's last day.\n      const limit = order.termEnd && order.termEnd.slice(0, 10) < last ? order.termEnd.slice(0, 10) : last\n      for (let date = firstDeliveryOnOrAfter(start, order.deliveryDays); date <= limit && dates.length < 400; date = nextDeliveryAfter(date, order.deliveryDays)) {\n        if (date >= first) dates.push(date)\n      }\n      return dates.map((fulfillmentDate) => ({ ...order, fulfillmentDate }))\n    }\n    const step = pattern === 'weekly' ? 7 : pattern === 'biweekly' ? 14 : 0\n",
   "order.deliveryDays && order.deliveryDays.length > 0"],
  ["export type CalendarMealPrepOrder", "import { firstDeliveryOnOrAfter, nextDeliveryAfter } from './meal-plan'\n\nexport type CalendarMealPrepOrder", "import { firstDeliveryOnOrAfter, nextDeliveryAfter } from './meal-plan'"],
])

patch('app/actions/booking-actions.ts', [
  [".select('MealPrepOrderID, CustomerID, OperatorID, Status, NextFulfillmentDate, RecurrencePattern, MealsPerCycle, IsArchived')\n    .eq('OperatorID', operatorId)\n    .in('Status', ['pending', 'active', 'paused'])", ".select('MealPrepOrderID, CustomerID, OperatorID, Status, NextFulfillmentDate, RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle, IsArchived')\n    .eq('OperatorID', operatorId)\n    .in('Status', ['pending', 'active', 'paused'])", "RecurrencePattern, DeliveryDays, TermEndDate, MealsPerCycle, IsArchived')"],
  ["      recurrencePattern: String(order.RecurrencePattern ?? 'weekly'),\n      mealsPerCycle", "      recurrencePattern: String(order.RecurrencePattern ?? 'weekly'),\n      deliveryDays: parseDeliveryDays(order.DeliveryDays),\n      termEnd: order.TermEndDate ? String(order.TermEndDate).slice(0, 10) : null,\n      mealsPerCycle", "deliveryDays: parseDeliveryDays(order.DeliveryDays)"],
], (s) => {
  if (s.includes('import { parseDeliveryDays }')) return s
  const i = s.indexOf('import ', s.indexOf("'use server'"))
  return s.slice(0, i) + "import { parseDeliveryDays } from '../../lib/meal-plan'\n" + s.slice(i)
})
console.log('done')
