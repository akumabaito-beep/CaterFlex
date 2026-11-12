'use client'

import { useMemo, useState } from 'react'
import { ChefHat, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import type { PublicMenuItem } from '@/lib/public-menu'

function MenuPhoto({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <div className="flex aspect-[4/3] w-full items-center justify-center bg-primary-soft text-[#C8431B]" aria-hidden="true"><ChefHat className="size-10" /></div>
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className="aspect-[4/3] w-full object-cover" />
}

const PAGE_SIZE = 9

export function MenuGrid({ items }: { items: PublicMenuItem[] }) {
  const [category, setCategory] = useState('All')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.category)))], [items])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((i) => (category === 'All' || i.category === category) && (!q || i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)))
  }, [items, category, query])

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const shown = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const goTo = (n: number) => { setPage(n); document.getElementById('menu-grid-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div id="menu-grid-top" className="scroll-mt-24">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => { setCategory(c); setPage(1) }} className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${category === c ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-border bg-card text-[#2B1D16] hover:border-[#C8431B]'}`}>{c}</button>
          ))}
        </div>
        <label className="relative block w-full md:w-72">
          <span className="sr-only">Search the menu</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1) }} placeholder="Search dishes" className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]" />
        </label>
      </div>

      <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">{visible.length} {visible.length === 1 ? 'dish' : 'dishes'}</p>

      {visible.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">No dishes match your search.</div>
      ) : (
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((item) => (
            <li key={item.id}>
              <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg">
                <MenuPhoto src={item.photoUrl} alt={item.name} />
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-lg font-bold leading-snug text-[#2B1D16]">{item.name}</h3>
                    <span className="shrink-0 font-semibold text-[#C8431B]">₱{item.price.toFixed(2)}</span>
                  </div>
                  <span className="mt-2 w-fit rounded bg-primary-soft px-2 py-1 text-[11px] font-semibold text-[#C8431B]">{item.category}</span>
                  {item.description && <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{item.description}</p>}
                  {item.allergens.length > 0 && <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-[#2B1D16]"><span className="font-semibold">Contains:</span> {item.allergens.join(', ')}</p>}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav aria-label="Menu pages" className="mt-8 flex items-center justify-center gap-3">
          <button type="button" onClick={() => goTo(safePage - 1)} disabled={safePage <= 1} aria-label="Previous page" className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-white transition-colors hover:bg-[#f1f1f2] disabled:opacity-40 disabled:hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><ChevronLeft className="size-5" /></button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => goTo(n)} aria-label={`Page ${n}`} aria-current={n === safePage ? 'page' : undefined} className={`size-10 rounded-full border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${n === safePage ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-border bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'}`}>{n}</button>
          ))}
          <button type="button" onClick={() => goTo(safePage + 1)} disabled={safePage >= pageCount} aria-label="Next page" className="inline-flex size-10 items-center justify-center rounded-full border border-border bg-white transition-colors hover:bg-[#f1f1f2] disabled:opacity-40 disabled:hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><ChevronRight className="size-5" /></button>
        </nav>
      )}
    </div>
  )
}