'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowUpDown, Check, CheckCircle2, ChevronDown, RefreshCw, Search, Warehouse } from 'lucide-react'

import { DashboardLayout } from '@/app/dashboard-layout'
import { Paged } from '@/components/owner/Pagination'
import { Button } from '@/components/ui/button'
import type { IngredientShortfall, OverPurchasedIngredient, ScrapSuggestion } from '@/lib/macroflex'
import { formatQuantity } from '@/lib/rules/quantity-format'

interface DishStatus {
  menuItemId: number
  itemName: string
  category: string
  price: number
  status: 'available' | 'insufficient'
  shortfalls: IngredientShortfall[]
  suggestions: ScrapSuggestion[]
}

type Tab = 'menu' | 'over'
type Filter = 'all' | 'blocked' | 'ready'
type SortKey = 'problems' | 'name' | 'category'

const peso = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`

function SortMenu({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const options: { key: SortKey; label: string }[] = [
    { key: 'problems', label: "Can't make first" },
    { key: 'name', label: 'Name A to Z' },
    { key: 'category', label: 'By category' },
  ]
  const current = options.find((o) => o.key === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-sort-menu]')) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [open])
  return (
    <div className="relative" data-sort-menu>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white pl-4 pr-3 text-sm font-medium text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
        <ArrowUpDown className="size-4 text-[#C8431B]" aria-hidden="true" />
        {current.label}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Sort dishes" className="owner-list-page absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-[#E8D8C4] bg-white p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value}>
              <button type="button" onClick={() => { onChange(o.key); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f1f1f2] ${o.key === value ? 'font-semibold text-[#C8431B]' : 'text-[#2B1D16]'}`}>
                {o.label}
                {o.key === value && <Check className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ShortfallRow({ s }: { s: IngredientShortfall }) {
  const pct = s.required > 0 ? Math.max(0, Math.min(100, (s.available / s.required) * 100)) : 0
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium text-[#2B1D16]">{s.ingredientName}</span>
        <span className="shrink-0 font-semibold text-[#C8431B]">needs {formatQuantity(s.shortBy, s.unitOfMeasure)} more</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EFE1D0]" role="img" aria-label={`${Math.round(pct)}% of what is needed is in stock`}>
        <div className="h-full rounded-full bg-[#C8431B]" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Have {formatQuantity(s.available, s.unitOfMeasure)} of {formatQuantity(s.required, s.unitOfMeasure)}
      </p>
    </li>
  )
}

function DishCard({ item }: { item: DishStatus }) {
  const [showAll, setShowAll] = useState(false)
  const blocked = item.status === 'insufficient'
  const alts = showAll ? item.suggestions : item.suggestions.slice(0, 2)
  return (
    <article className={`flex flex-col rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm ${blocked ? 'border-[#E8D8C4]' : 'border-border'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[#2B1D16]">{item.itemName}</h3>
          <p className="mt-0.5 text-sm capitalize text-muted-foreground">{item.category || 'Uncategorised'} · {peso(item.price)}</p>
        </div>
        {blocked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#F6E3D3] px-2.5 py-1 text-xs font-semibold text-[#C8431B]"><AlertTriangle className="size-3" aria-hidden="true" />Can&apos;t make</span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-3" aria-hidden="true" />Ready</span>
        )}
      </div>

      {blocked && (
        <ul className="mt-4 space-y-3">
          {item.shortfalls.map((s, i) => <ShortfallRow key={`${s.ingredientName}-${i}`} s={s} />)}
        </ul>
      )}

      {blocked && item.suggestions.length > 0 && (
        <div className="mt-4 rounded-xl bg-[#FBF6EE] p-3">
          <p className="text-sm font-medium text-[#2B1D16]">Use up leftovers instead</p>
          <ul className="mt-2 space-y-2">
            {alts.map((a) => (
              <li key={a.menuItemId} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-[#2B1D16]">{a.itemName}</span>
                  {a.usesMissingIngredient?.length ? <span className="block truncate text-xs text-muted-foreground">uses {a.usesMissingIngredient.join(', ')}</span> : null}
                </span>
                <span className="shrink-0 text-muted-foreground">{peso(a.price)}</span>
              </li>
            ))}
          </ul>
          {item.suggestions.length > 2 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-semibold text-[#C8431B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
              {showAll ? 'Show fewer' : `Show ${item.suggestions.length - 2} more`}
            </button>
          )}
        </div>
      )}

      {!blocked && <p className="mt-4 text-sm text-muted-foreground">Every ingredient is in stock for one more serving.</p>}
    </article>
  )
}

function Skeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading menu check">
      <div className="h-20 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />
      <div className="h-10 w-2/3 animate-pulse rounded-full bg-[#EFE1D0]/60" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />)}
      </div>
    </div>
  )
}

export default function MacroFlexPage() {
  const [items, setItems] = useState<DishStatus[]>([])
  const [over, setOver] = useState<OverPurchasedIngredient[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('menu')
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('problems')

  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true); else setRefreshing(true)
    setError(null)
    try {
      const res = await fetch('/api/macroflex/overview', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not load the menu check.')
      setItems(body.items ?? [])
      setOver(body.overPurchased ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the menu check.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load(true) }, [load])

  const blockedCount = items.filter((i) => i.status === 'insufficient').length
  const readyCount = items.length - blockedCount

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = items.filter((i) => {
      if (filter === 'blocked' && i.status !== 'insufficient') return false
      if (filter === 'ready' && i.status !== 'available') return false
      return !q || i.itemName.toLowerCase().includes(q) || i.category.toLowerCase().includes(q)
    })
    return [...list].sort((a, b) => {
      if (sort === 'category') return a.category.localeCompare(b.category) || a.itemName.localeCompare(b.itemName)
      if (sort === 'problems' && a.status !== b.status) return a.status === 'insufficient' ? -1 : 1
      return a.itemName.localeCompare(b.itemName)
    })
  }, [items, filter, query, sort])

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'blocked', label: "Can't make", count: blockedCount },
    { key: 'ready', label: 'Ready', count: readyCount },
  ]

  return (
    <DashboardLayout>
      <div className="owner-page flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">MacroFlex</h1>
            <p className="mt-1 text-muted-foreground">Which dishes your current stock can still make, and what to cook instead.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void load(false)} disabled={loading || refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8D8C4] bg-[#F6E3D3] p-4 text-sm text-[#C8431B]">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void load(items.length === 0)}>Try again</Button>
          </div>
        )}

        {loading ? <Skeleton /> : (
          <>
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${blockedCount > 0 ? 'border-[#E8D8C4] bg-[#FBF6EE]' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center gap-3">
                {blockedCount > 0 ? <AlertTriangle className="size-5 text-[#C8431B]" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />}
                <div>
                  <p className="font-semibold text-[#2B1D16]">
                    {blockedCount > 0 ? `${blockedCount} of ${items.length} dishes can't be made right now` : 'Every dish on the menu can be made'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {over.length > 0 ? `${over.length} ingredient${over.length === 1 ? ' is' : 's are'} stocked past storage capacity.` : 'Checked against stock after confirmed bookings and meal plans.'}
                  </p>
                </div>
              </div>
              {blockedCount > 0 && (
                <Button type="button" size="sm" onClick={() => { setTab('menu'); setFilter('blocked') }} className="bg-[#C8431B] text-white hover:bg-[#A93615]">Show them</Button>
              )}
            </div>

            <div role="tablist" className="flex gap-6 border-b border-[#E8D8C4]">
              {([['menu', 'Menu check', items.length], ['over', 'Over capacity', over.length]] as const).map(([key, label, count]) => (
                <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => setTab(key)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${tab === key ? 'border-[#C8431B] text-[#C8431B]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'}`}>
                  {label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tab === key ? 'bg-[#F6E3D3] text-[#C8431B]' : 'bg-[#f1f1f2] text-muted-foreground'}`}>{count}</span>
                </button>
              ))}
            </div>

            {tab === 'menu' && (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <button key={c.key} type="button" onClick={() => setFilter(c.key)} aria-pressed={filter === c.key} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${filter === c.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'}`}>
                        {c.label} <span className={filter === c.key ? 'text-white/80' : 'text-muted-foreground'}>{c.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-3">
                    <label className="relative">
                      <span className="sr-only">Search dishes</span>
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search dishes" className="h-9 w-56 rounded-full border border-[#E8D8C4] bg-white pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[#C8431B]" />
                    </label>
                    <SortMenu value={sort} onChange={setSort} />
                  </div>
                </div>

                {visible.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E8D8C4] p-10 text-center text-sm text-muted-foreground">
                    {items.length === 0 ? 'No dishes on the menu yet.' : 'No dishes match that search.'}
                  </div>
                ) : (
                  <Paged key={`${filter}|${query}|${sort}`} items={visible} pageSize={9} label="dishes" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {(item) => <DishCard key={item.menuItemId} item={item} />}
                  </Paged>
                )}
              </>
            )}

            {tab === 'over' && (
              over.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E8D8C4] p-10 text-center text-sm text-muted-foreground">Nothing is stocked past its storage capacity.</div>
              ) : (
                <ul className="owner-list-page space-y-3">
                  {over.map((o, i) => {
                    const pct = o.maxCapacity > 0 ? Math.min(100, (o.maxCapacity / o.currentStock) * 100) : 0
                    return (
                      <li key={`${o.ingredientName}-${i}`} className="rounded-2xl border border-[#E8D8C4] bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <Warehouse className="size-5 shrink-0 text-[#C8431B]" aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-[#2B1D16]">{o.ingredientName}</p>
                              <p className="text-sm text-muted-foreground">{formatQuantity(o.currentStock, o.unitOfMeasure)} in stock, room for {formatQuantity(o.maxCapacity, o.unitOfMeasure)}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-[#F6E3D3] px-2.5 py-1 text-xs font-semibold text-[#C8431B]">{formatQuantity(o.exceededBy, o.unitOfMeasure)} over</span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#C8431B]" role="img" aria-label="Capacity used versus overflow">
                          <div className="h-full bg-[#EFE1D0]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
