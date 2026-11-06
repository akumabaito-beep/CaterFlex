// Run from the project root:  node apply-merge-bridge.mjs   (safe to run twice)
// Makes plans created through John's flow work with the pause / skip / cancel / renew screens.
import fs from 'node:fs'
const file = 'app/actions/booking-actions.ts'
const raw = fs.readFileSync(file, 'utf8')
const crlf = raw.includes('\r\n')
let s = raw.replace(/\r\n/g, '\n')
if (s.includes('TermEndDate: sortedDeliveries')) { console.log('already applied'); process.exit(0) }
const a = "      PricePerServing: pricePerDelivery / mealsPerCycle,\n"
if (s.split(a).length !== 2) { console.error('Could not find the MEAL_PREP_ORDER insert (PricePerServing line).'); process.exit(1) }
s = s.replace(a, a +
"      // Fields the pause / skip / cancel / renew screens and the owner calendar read.\n" +
"      PlanWeeks: subscriptionWeeks,\n" +
"      DeliveryDays: (orderDetails.deliveryDays ?? []).join(','),\n" +
"      TermEndDate: sortedDeliveries[sortedDeliveries.length - 1].date,\n" +
"      TermCycles: sortedDeliveries.length,\n" +
"      MealType: items[0]?.MealType ?? null,\n" +
"      DeliveryFee: fulfillmentMethod === 'delivery' ? (deliveryFeeForVenue(deliveryAddress)?.fee ?? 0) : 0,\n")
fs.writeFileSync(file, crlf ? s.replace(/\n/g, '\r\n') : s)
console.log('updated', file)
