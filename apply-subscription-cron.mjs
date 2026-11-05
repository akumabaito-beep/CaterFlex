// Run from the project root:  node apply-subscription-cron.mjs
// Daily check: resume paused plans on their return date, and step through the chosen delivery days
// (instead of a fixed 7 / 14 day jump).
import fs from 'node:fs'

const file = 'app/api/cron/check-prep-sufficiency/route.ts'
const raw = fs.readFileSync(file, 'utf8')
const crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')

function once(a, b, check) {
  if (s.includes(check)) { console.log('  already applied:', check); return }
  const n = s.split(a).length - 1
  if (n !== 1) { console.error(`FAILED: found ${n} matches for:\n${a}`); process.exit(1) }
  s = s.replace(a, () => b)
}

// import
const firstImport = s.indexOf('import ')
if (!s.includes("meal-plan-resume")) {
  s = s.slice(0, firstImport) + "import { resumeDuePlans } from '../../../../lib/meal-plan-resume'\nimport { nextDeliveryAfter, parseDeliveryDays } from '../../../../lib/meal-plan'\n" + s.slice(firstImport)
}

once(
  "  const { data: mealPrepOrders, error: mealPrepError } = await admin\n    .from('MEAL_PREP_ORDER')\n    .select('MealPrepOrderID, OperatorID, RecurrencePattern, MealsPerCycle, NextFulfillmentDate, TermEndDate')",
  "  await resumeDuePlans(admin) // paused plans whose return date has arrived\n\n  const { data: mealPrepOrders, error: mealPrepError } = await admin\n    .from('MEAL_PREP_ORDER')\n    .select('MealPrepOrderID, OperatorID, RecurrencePattern, MealsPerCycle, NextFulfillmentDate, TermEndDate, DeliveryDays')",
  "await resumeDuePlans(admin)"
)
once(
  "    const step = order.RecurrencePattern === 'biweekly' ? 14 : 7\n    while (nextDate <= today) nextDate = addDays(nextDate, step)",
  "    const planDays = parseDeliveryDays(order.DeliveryDays)\n    while (nextDate <= today) nextDate = nextDeliveryAfter(nextDate, planDays, order.RecurrencePattern)",
  "nextDeliveryAfter(nextDate, planDays"
)

fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('updated', file)
