// Recolors the site to the 60/30/10 palette: cream (60), espresso (30), blood orange (10).
// Safe to run on top of any version of the pages. Run from the project root: node apply-palette.mjs
import fs from 'node:fs'
import path from 'node:path'

const ESPRESSO = '#2B1D16'
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null)
let changed = 0
const write = (f, s, old) => { if (s !== old) { fs.writeFileSync(f, s); changed++ } }

// 1) Big dark surfaces become espresso instead of orange.
const dark = [
  ['components/layout/Sidebar.tsx', [['bg-[#8E1F2C] px-4 py-6', `bg-[${ESPRESSO}] px-4 py-6`], ['bg-white text-[#8E1F2C] shadow-sm', `bg-white text-[${ESPRESSO}] shadow-sm`]]],
  ['app/customer/home/page.tsx', [['rounded-2xl bg-[#8E1F2C] px-6 py-10', `rounded-2xl bg-[${ESPRESSO}] px-6 py-10`]]],
  ['app/page.tsx', [['overflow-hidden bg-[#8E1F2C] py-12', `overflow-hidden bg-[${ESPRESSO}] py-12`]]],
  ['app/menu/page.tsx', [['<section className="bg-[#8E1F2C] px-6 py-16', `<section className="bg-[${ESPRESSO}] px-6 py-16`]]],
  ['components/auth/AuthShell.tsx', [['overflow-hidden bg-[#8E1F2C] lg:block', `overflow-hidden bg-[${ESPRESSO}] lg:block`], ['from-[#8E1F2C]/90 via-transparent to-[#8E1F2C]/40', `from-[${ESPRESSO}]/90 via-transparent to-[${ESPRESSO}]/40`]]],
  ['app/globals.css', [[/linear-gradient\(to (right|left), #7F1623 15%, rgb\(209 58 71 \/ 0\)\)/g, `linear-gradient(to $1, ${ESPRESSO} 15%, rgb(43 29 22 / 0))`]]],
]
for (const [file, pairs] of dark) {
  const old = read(file)
  if (old == null) { console.log('skip (missing):', file); continue }
  let s = old
  for (const [a, b] of pairs) s = typeof a === 'string' ? s.split(a).join(b) : s.replace(a, b)
  write(file, s, old)
}

// 2) Swap the old maroon/pink family for the new palette everywhere.
const MAP = {
  '9B1C2C': 'C8431B', '8E1F2C': 'C8431B', 'D13A47': 'C8431B', 'B82E3B': 'A93615', '7F1623': 'A93615', '7D1623': 'A93615', '6F1722': 'A93615',
  '2A1B1F': '2B1D16', '2B1D1F': '2B1D16', 'E8D2D2': 'E8D8C4', 'F3D6D6': 'EBDDC9', 'E8B4B4': 'E3C7A8',
  'FDECEC': 'F6E3D3', 'FDE3E3': 'F6E3D3', 'F9DADA': 'F2D8C2', 'FDE6E6': 'F6E3D3', 'FBE0E0': 'F6E3D3',
  'FFF7F6': 'FBF6EE', 'F3E3E3': 'EFE1D0', 'F0E1E1': 'EFE3D3', '6B5558': '6F5F52', '6E5C5F': '6F5F52', '6B5A5E': '6F5F52', '9C6670': '8A7868',
  'C9808C': 'E0A58A', 'D79BA3': 'E0A58A', '1A0E10': '1A110C',
}
const pat = new RegExp('#(' + Object.keys(MAP).join('|') + ')\\b', 'gi')
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(tsx|ts|css)$/.test(e.name)) {
      const old = fs.readFileSync(p, 'utf8')
      const s = old.replace(pat, (m, h) => '#' + MAP[h.toUpperCase()])
        .replaceAll('rgb(209 58 71', 'rgb(200 67 27').replaceAll('rgba(155,28,44', 'rgba(200,67,27').replaceAll('rgba(155, 28, 44', 'rgba(200, 67, 27').replaceAll('rgba(142,31,44', 'rgba(200,67,27')
      write(p, s, old)
    }
  }
}
for (const d of ['app', 'components', 'lib']) if (fs.existsSync(d)) walk(d)

// 3) Theme tokens that must not follow the plain swap.
const css = read('app/globals.css')
if (css) {
  const s = css
    .replace(/--sidebar: #[0-9A-Fa-f]{6};/g, `--sidebar: ${ESPRESSO};`)
    .replace(/--destructive: #[0-9A-Fa-f]{6};/g, '--destructive: #B3261E;')
    .replace(/--brand-deep: #[0-9A-Fa-f]{6};/g, `--brand-deep: ${ESPRESSO};`)
    .replace(/--chart-2: #[0-9A-Fa-f]{6};/g, '--chart-2: #6F4E37;')
  write('app/globals.css', s, css)
}
console.log(`Palette applied. ${changed} file(s) changed.`)
