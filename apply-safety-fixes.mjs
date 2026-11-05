// Run from the project root:  node apply-safety-fixes.mjs
// 1) adds a "fish" allergen  2) raises the minimum password length to 8
import fs from 'node:fs'

function edit(file, fn) {
  if (!fs.existsSync(file)) { console.log('  skipped (not found):', file); return }
  const raw = fs.readFileSync(file, 'utf8')
  const crlf = raw.includes('\r\n')
  const before = raw.replace(/\r\n/g, '\n')
  const after = fn(before)
  if (after === before) { console.log('  no change needed:', file); return }
  fs.writeFileSync(file, crlf ? after.replace(/\n/g, '\r\n') : after)
  console.log('updated', file)
}

edit('lib/types.ts', (s) => s.includes("'fish'") ? s : s.replace("'shellfish' |", "'shellfish' | 'fish' |"))

const addFishOption = (s) => s.replace(/(\n[ \t]*)'shellfish',(?!\n[ \t]*'fish')/g, "$1'shellfish',$1'fish',")
edit('components/owner/MenuItemForm.tsx', addFishOption)
edit('app/customer/inquiry/page.tsx', (s) => {
  let out = addFishOption(s)
  if (/shellfish:\s*Shrimp,/.test(out) && !/\bfish:\s*Fish\b/.test(out)) {
    out = out.replace(/(\n[ \t]*)shellfish:\s*Shrimp,/, '$1shellfish: Shrimp,$1fish: Fish,')
    if (!/\bFish,/.test(out.split("from 'lucide-react'")[0])) out = out.replace(/(\n[ \t]*)Shrimp,/, '$1Shrimp,$1Fish,')
  }
  return out
})

edit('app/actions/auth.ts', (s) => s.replace('password.length < 6', 'password.length < 8').replace('a password with at least 6 characters', 'a password with at least 8 characters'))
edit('app/signup/page.tsx', (s) => s.replace('password.length < 6', 'password.length < 8').replaceAll('minLength={6}', 'minLength={8}').replace('At least 6 characters', 'At least 8 characters'))

// 3) owner check on the overstock API
edit('app/api/macroflex/overstock/route.ts', (s) => {
  if (s.includes('requireRole')) return s
  return s
    .replace("import { checkOverPurchase }", "import { requireRole } from '@/app/actions/auth'\nimport { checkOverPurchase }")
    .replace("export async function GET(request: NextRequest) {\n  try {", "export async function GET(request: NextRequest) {\n  const owner = await requireRole('owner')\n  if (!owner) {\n    return NextResponse.json({ error: 'Owner access required.' }, { status: 403 })\n  }\n\n  try {")
})

// 4) owner-only guard for /macroflex and /menu-management
edit('middleware.ts', (s) => s.includes("startsWith('/macroflex')") ? s : s.replace(
  "  if (pathname.startsWith('/owner')) {",
  "  // MacroFlex and Menu Management are owner-only pages that live outside /owner.\n  if (pathname.startsWith('/owner') || pathname.startsWith('/macroflex') || pathname.startsWith('/menu-management')) {"))

// 5) MacroFlex: check all dishes at the same time instead of one by one
edit('app/macroflex/page.tsx', (s) => {
  if (s.includes('Promise.all')) return s
  const a = s.indexOf('        // For each menu item, check sufficiency')
  const b = s.indexOf('        setMenuItems(itemsWithStatus)')
  if (a < 0 || b < 0) { console.log('  MacroFlex loop not found - skipped'); return s }
  const block = `        // Check every dish at the same time instead of one after another.
        // Each dish is still checked on its own, so results are unchanged.
        const itemsWithStatus: MenuItemWithStatus[] = await Promise.all(
          (menuData ?? []).map(async (item) => {
            const sufficiencyRes = await fetch(\`/api/macroflex/check?menuItemId=\${item.MenuItemID}\`)
            if (!sufficiencyRes.ok) throw new Error('Failed to check sufficiency')
            const sufficiencyData: SufficiencyCheckResult = await sufficiencyRes.json()

            let suggestions: ScrapSuggestion[] = []
            if (!sufficiencyData.sufficient && !sufficiencyData.hasNoIngredients) {
              const suggestionsRes = await fetch(\`/api/macroflex/suggestions/\${item.MenuItemID}\`)
              if (suggestionsRes.ok) {
                const { alternatives } = await suggestionsRes.json()
                suggestions = alternatives
              }
            }

            return {
              menuItemId: item.MenuItemID,
              itemName: item.ItemName,
              category: item.Category,
              price: item.Price,
              status: sufficiencyData.sufficient ? 'available' : 'insufficient',
              shortfalls: sufficiencyData.shortfalls,
              suggestions,
            } as MenuItemWithStatus
          })
        )

`
  return s.slice(0, a) + block + s.slice(b)
})
