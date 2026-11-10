'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowUpDown, Check, ChevronDown, Clock, Loader2, Pencil, Plus, Search, UtensilsCrossed, X } from 'lucide-react'
import { DashboardLayout } from '@/app/dashboard-layout'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Paged } from '@/components/owner/Pagination'
import { updateMenuItem } from '@/app/actions/menu-actions'
import { MenuItemForm } from '@/components/owner/MenuItemForm'
import { supabase } from '@/lib/supabase'
import type { MenuItem as FormMenuItem } from '@/lib/types'
import { formatQuantity } from '@/lib/rules/quantity-format'

type MenuItem = {
  MenuItemID: number
  ItemName: string
  Category: string
  Price: number
  PrepTimeDays: number
  Description: string | null
  Availability?: boolean
  PhotoURL?: string | null
}

type Ingredient = {
  IngredientID: number
  IngredientName: string
  UnitOfMeasure: string
  CurrentStock: number | null
  MaxStorageCapacity: number
}

type DishIngredient = {
  DishIngredientID: number
  MenuItemID: number
  IngredientID: number
  QuantityRequiredPerServing: number
}

type IngredientRow = DishIngredient & Ingredient

type MenuStatus = 'available' | 'insufficient' | 'unavailable'

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value)
}

/** Below this many servings a dish is flagged as running low. */
const LOW_SERVINGS = 20

type DishState = 'ok' | 'low' | 'out' | 'hidden' | 'no-recipe'
type StateFilter = 'all' | 'ok' | 'low' | 'out' | 'hidden' | 'no-recipe'
type SortKey = 'name' | 'price-low' | 'price-high' | 'stock-low'

type Stock = { servings: number | null; limiting: IngredientRow | null; state: DishState }

/** How many servings the current stock can make, and which ingredient runs out first. */
function computeStock(item: MenuItem, rows: IngredientRow[]): Stock {
  if (item.Availability === false) return { servings: null, limiting: null, state: 'hidden' }
  const usable = rows.filter((row) => row.QuantityRequiredPerServing > 0)
  if (usable.length === 0) return { servings: null, limiting: null, state: 'no-recipe' }
  let limiting = usable[0]
  let servings = Math.floor((limiting.CurrentStock ?? 0) / limiting.QuantityRequiredPerServing)
  for (const row of usable) {
    const possible = Math.floor((row.CurrentStock ?? 0) / row.QuantityRequiredPerServing)
    if (possible < servings) { servings = possible; limiting = row }
  }
  return { servings, limiting, state: servings <= 0 ? 'out' : servings < LOW_SERVINGS ? 'low' : 'ok' }
}

const stateStyle: Record<DishState, { label: string; chip: string; bar: string }> = {
  ok: { label: 'Serving now', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
  low: { label: 'Running low', chip: 'bg-amber-100 text-amber-900', bar: 'bg-amber-500' },
  out: { label: 'Out of stock', chip: 'bg-[#F6E3D3] text-[#C8431B]', bar: 'bg-[#C8431B]' },
  hidden: { label: 'Hidden from customers', chip: 'bg-slate-200 text-slate-700', bar: 'bg-slate-300' },
  'no-recipe': { label: 'Recipe missing', chip: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300', bar: 'bg-slate-300' },
}

const categoryLabel = (category: string | null | undefined) => {
  const value = (category ?? '').trim()
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Uncategorised'
}

function DishPhoto({ item, className }: { item: MenuItem; className: string }) {
  const [failed, setFailed] = useState(false)
  if (item.PhotoURL && !failed) {
    return (
      <div className={`${className} relative overflow-hidden bg-[#F6E3D3]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.PhotoURL} alt={item.ItemName} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      </div>
    )
  }
  return (
    <div className={`${className} flex items-center justify-center bg-[#F6E3D3] text-[#C8431B]/60`} aria-hidden="true">
      <UtensilsCrossed className="size-8" />
    </div>
  )
}

/** Styled dropdown, same pattern as the Bookings sort menu. */
function SortMenu({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const [open, setOpen] = useState(false)
  const options: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Name A to Z' },
    { key: 'price-low', label: 'Price, low to high' },
    { key: 'price-high', label: 'Price, high to low' },
    { key: 'stock-low', label: 'Lowest stock first' },
  ]
  const current = options.find((option) => option.key === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const onClick = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('[data-sort-menu]')) setOpen(false) }
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
          {options.map((option) => (
            <li key={option.key} role="option" aria-selected={option.key === value}>
              <button type="button" onClick={() => { onChange(option.key); setOpen(false) }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f1f1f2] ${option.key === value ? 'font-semibold text-[#C8431B]' : 'text-[#2B1D16]'}`}>
                {option.label}
                {option.key === value && <Check className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** On/off switch used for "shown to customers". */
function Switch({ checked, busy, label, onChange }: { checked: boolean; busy?: boolean; label: string; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={busy} onClick={(event) => { event.stopPropagation(); onChange() }} className={`relative h-6 w-11 shrink-0 rounded-full ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] focus-visible:ring-offset-2 disabled:cursor-wait ${checked ? 'bg-emerald-600 ring-emerald-700/40' : 'bg-slate-300 ring-slate-400/60'}`}>
      <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function MenuManagementPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [dishIngredients, setDishIngredients] = useState<DishIngredient[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState<StateFilter>('all')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formItem, setFormItem] = useState<FormMenuItem | null>(null)

  const loadMenu = useCallback(async () => {
    setErrorMessage('')
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
      setErrorMessage('Supabase is not configured for this environment. Add the project connection in Vercel to load live menu and ingredient data.')
      setLoading(false)
      return
    }
    try {
      const [menuResult, ingredientResult, dishResult] = await Promise.all([
        supabase.from('MENU_ITEM').select('MenuItemID, ItemName, Category, Price, PrepTimeDays, Description, Availability, PhotoURL').order('ItemName'),
        supabase.from('INGREDIENT').select('IngredientID, IngredientName, UnitOfMeasure, CurrentStock, MaxStorageCapacity').order('IngredientName'),
        supabase.from('DISH_INGREDIENT').select('DishIngredientID, MenuItemID, IngredientID, QuantityRequiredPerServing').order('DishIngredientID'),
      ])
      const failure = menuResult.error || ingredientResult.error || dishResult.error
      if (failure) throw failure
      // PostgREST can return numeric columns as strings, so normalise IDs before joining the tables.
      setMenuItems((menuResult.data ?? []).map((item) => ({
        ...(item as MenuItem),
        MenuItemID: Number(item.MenuItemID),
        Price: Number(item.Price),
        PrepTimeDays: Number(item.PrepTimeDays),
      })))
      setIngredients((ingredientResult.data ?? []).map((ingredient) => ({
        ...(ingredient as Ingredient),
        IngredientID: Number(ingredient.IngredientID),
        CurrentStock: ingredient.CurrentStock == null ? null : Number(ingredient.CurrentStock),
        MaxStorageCapacity: Number(ingredient.MaxStorageCapacity),
      })))
      setDishIngredients((dishResult.data ?? []).map((relation) => ({
        ...(relation as DishIngredient),
        DishIngredientID: Number(relation.DishIngredientID),
        MenuItemID: Number(relation.MenuItemID),
        IngredientID: Number(relation.IngredientID),
        QuantityRequiredPerServing: Number(relation.QuantityRequiredPerServing),
      })))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load menu data from Supabase.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadMenu() }, [loadMenu])

  const rowsByMenuItem = useMemo(() => {
    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.IngredientID, ingredient]))
    return new Map(menuItems.map((item) => [
      item.MenuItemID,
      dishIngredients
        .filter((relation) => relation.MenuItemID === item.MenuItemID)
        .flatMap((relation) => {
          const ingredient = ingredientMap.get(relation.IngredientID)
          return ingredient ? [{ ...relation, ...ingredient }] : []
        }),
    ]))
  }, [dishIngredients, ingredients, menuItems])

  const stockByItem = useMemo(() => new Map(menuItems.map((item) => [item.MenuItemID, computeStock(item, rowsByMenuItem.get(item.MenuItemID) ?? [])])), [menuItems, rowsByMenuItem])

  // Category text in the database is free-form ("Main", "mains", "Noodles"...), so match on a normalised key.
  const knownCategories = ['main', 'appetizer', 'side', 'dessert', 'beverage']
  const categoryKey = (category: string | null | undefined) => {
    const key = (category ?? '').trim().toLowerCase().replace(/s$/, '')
    return knownCategories.includes(key) ? key : 'other'
  }
  const needle = query.trim().toLowerCase()
  const searched = menuItems.filter((item) => !needle || item.ItemName.toLowerCase().includes(needle) || (item.Description ?? '').toLowerCase().includes(needle))
  const inCategory = searched.filter((item) => categoryFilter === 'all' || categoryKey(item.Category) === categoryFilter)
  const categoryTabs: [string, string][] = [
    ['all', 'All dishes'], ['main', 'Mains'], ['appetizer', 'Appetizers'], ['side', 'Sides'], ['dessert', 'Desserts'], ['beverage', 'Beverages'],
    ...(menuItems.some((item) => categoryKey(item.Category) === 'other') ? [['other', 'Other'] as [string, string]] : []),
  ]
  const tabCount = (value: string) => searched.filter((item) => value === 'all' || categoryKey(item.Category) === value).length

  const stateOf = (item: MenuItem) => stockByItem.get(item.MenuItemID)?.state ?? 'ok'
  const stateCounts = {
    all: inCategory.length,
    ok: inCategory.filter((item) => stateOf(item) === 'ok').length,
    low: inCategory.filter((item) => stateOf(item) === 'low').length,
    out: inCategory.filter((item) => stateOf(item) === 'out').length,
    hidden: inCategory.filter((item) => stateOf(item) === 'hidden').length,
    'no-recipe': inCategory.filter((item) => stateOf(item) === 'no-recipe').length,
  }
  const stateChips: [StateFilter, string][] = [['all', 'All'], ['ok', 'Serving now'], ['low', 'Running low'], ['out', 'Out of stock'], ['no-recipe', 'Recipe missing'], ['hidden', 'Hidden']]

  const shown = inCategory
    .filter((item) => stateFilter === 'all' || stateOf(item) === stateFilter)
    .sort((a, b) => {
      if (sortKey === 'price-low') return a.Price - b.Price
      if (sortKey === 'price-high') return b.Price - a.Price
      if (sortKey === 'stock-low') return (stockByItem.get(a.MenuItemID)?.servings ?? Infinity) - (stockByItem.get(b.MenuItemID)?.servings ?? Infinity) || a.ItemName.localeCompare(b.ItemName)
      return a.ItemName.localeCompare(b.ItemName)
    })

  const needAttention = menuItems.filter((item) => ['low', 'out', 'no-recipe'].includes(stateOf(item))).length
  const selectedItem = menuItems.find((item) => item.MenuItemID === selectedId) ?? null

  const beginEdit = (item: MenuItem) => {
    setFormItem({
      id: String(item.MenuItemID),
      name: item.ItemName,
      description: item.Description ?? '',
      category: item.Category.toLowerCase() as FormMenuItem['category'],
      price: item.Price,
      prepTimeDays: item.PrepTimeDays,
      availability: item.Availability !== false,
      macros: { carbs: 0, protein: 0, fat: 0 },
      allergyTags: [],
      requiredIngredients: [],
      inventoryStatus: 'available',
    })
    setSelectedId(null)
    setFormOpen(true)
  }

  const setAvailability = (id: number, value: boolean) =>
    setMenuItems((current) => current.map((entry) => entry.MenuItemID === id ? { ...entry, Availability: value } : entry))

  // The switch flips straight away and goes back if saving fails.
  const toggleAvailability = async (item: MenuItem) => {
    if (togglingId === item.MenuItemID) return
    const next = item.Availability === false
    setTogglingId(item.MenuItemID)
    setActionError('')
    setAvailability(item.MenuItemID, next)
    try {
      await updateMenuItem(item.MenuItemID, {
        ItemName: item.ItemName,
        Category: item.Category,
        Price: item.Price,
        PrepTimeDays: item.PrepTimeDays,
        Description: item.Description ?? '',
        Availability: next,
      })
    } catch (error) {
      setAvailability(item.MenuItemID, !next)
      setActionError(`Could not ${next ? 'show' : 'hide'} ${item.ItemName}. ${error instanceof Error ? error.message : 'Try again.'}`)
    } finally {
      setTogglingId(null)
    }
  }

  const clearFilters = () => { setQuery(''); setStateFilter('all'); setCategoryFilter('all') }

  const renderCard = (item: MenuItem) => {
    const stock = stockByItem.get(item.MenuItemID) ?? { servings: null, limiting: null, state: 'ok' as DishState }
    const style = stateStyle[stock.state]
    const fill = stock.servings === null ? 0 : Math.min(100, Math.round((stock.servings / 100) * 100))
    return (
      <article key={item.MenuItemID} className={`group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E8D8C4] bg-white transition-shadow hover:shadow-md ${item.Availability === false ? 'opacity-80' : ''}`}>
        <button type="button" onClick={() => setSelectedId(item.MenuItemID)} aria-label={`View ${item.ItemName} details`} className="relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8431B]">
          <DishPhoto item={item} className={`aspect-[4/3] w-full ${item.Availability === false ? 'grayscale' : ''}`} />
          <span className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${style.chip}`}>{style.label}</span>
        </button>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1 basis-32">
              <h3 className="break-words font-heading text-lg font-bold uppercase leading-tight tracking-tight text-card-foreground">{item.ItemName}</h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span>{categoryLabel(item.Category)}</span>
                <span className="inline-flex items-center gap-1 whitespace-nowrap"><Clock className="size-3.5" aria-hidden="true" />{item.PrepTimeDays} {item.PrepTimeDays === 1 ? 'day' : 'days'} prep</span>
              </p>
            </div>
            <p className="shrink-0 font-heading text-xl font-bold tabular-nums text-[#C8431B]">{formatPrice(item.Price)}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-[#2B1D16]">
                {stock.state === 'hidden' ? 'Not shown to customers' : stock.state === 'no-recipe' ? 'No ingredients linked yet' : `Can make ${stock.servings} ${stock.servings === 1 ? 'serving' : 'servings'}`}
              </span>
              {stock.limiting && stock.state !== 'ok' && <span className="truncate text-muted-foreground">Limited by {stock.limiting.IngredientName}</span>}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E8D8C4]/60" role="img" aria-label={stock.servings === null ? 'No stock estimate' : `${stock.servings} servings available`}>
              <div className={`h-full rounded-full transition-all duration-500 ${style.bar}`} style={{ width: `${fill}%` }} />
            </div>
          </div>

          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t border-[#E8D8C4]/70 pt-3">
            <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs font-medium text-muted-foreground">
              <Switch checked={item.Availability !== false} busy={togglingId === item.MenuItemID} label={`Show ${item.ItemName} to customers`} onChange={() => void toggleAvailability(item)} />
              {item.Availability === false ? 'Hidden' : 'Shown'}
            </label>
            <div className="ml-auto flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(item.MenuItemID)}>Details</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => beginEdit(item)}><Pencil data-icon="inline-start" />Edit</Button>
            </div>
          </div>
        </div>
      </article>
    )
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Menu Management</h1>
            <p className="mt-2 text-surface-muted-foreground">Keep dishes, prices and what you can serve in one place</p>
          </div>
          <Button onClick={() => { setFormItem(null); setFormOpen(true) }}><Plus data-icon="inline-start" />Add menu item</Button>
        </div>

        {!loading && !errorMessage && menuItems.length > 0 && (
          needAttention > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C8431B]/30 bg-[#F6E3D3] px-5 py-4">
              <p className="text-sm font-medium text-[#C8431B]">
                <span className="font-heading text-lg font-bold">{needAttention}</span> {needAttention === 1 ? 'dish needs' : 'dishes need'} attention: running low, out of stock or missing a recipe.
              </p>
              <Button type="button" size="sm" onClick={() => { clearFilters(); setStateFilter(menuItems.some((i) => stateOf(i) === 'out') ? 'out' : menuItems.some((i) => stateOf(i) === 'low') ? 'low' : 'no-recipe') }}>Show them</Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E8D8C4] bg-white px-5 py-4 text-sm text-muted-foreground"><span className="font-semibold text-[#2B1D16]">Every dish is ready to serve.</span> Stock covers at least {LOW_SERVINGS} servings of each.</div>
          )
        )}

        {actionError && <Card className="border-destructive/40 bg-destructive/10 p-4"><p className="text-sm text-destructive">{actionError}</p></Card>}

        <div className="flex flex-wrap gap-1 border-b border-[#E8D8C4]" role="tablist" aria-label="Category">
          {categoryTabs.map(([value, label]) => {
            const active = categoryFilter === value
            return (
              <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setCategoryFilter(value)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${active ? 'border-[#C8431B] text-[#C8431B]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'}`}>
                {label}
                <span className="rounded-full bg-[#F6E3D3] px-2 py-0.5 text-xs text-[#C8431B]">{tabCount(value)}</span>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stock">
            {stateChips.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={stateFilter === key} onClick={() => setStateFilter(key)} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${stateFilter === key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>
                {label} <span className="opacity-70">{stateCounts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search dishes</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dishes" className="h-9 w-56 rounded-full border border-[#E8D8C4] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />
            </label>
            <SortMenu value={sortKey} onChange={setSortKey} />
          </div>
        </div>

        {loading ? (
          <Card className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading menu data...</Card>
        ) : errorMessage ? (
          <Card className="p-6"><p className="text-sm text-destructive">{errorMessage}</p></Card>
        ) : menuItems.length === 0 ? (
          <Card className="p-12 text-center">
            <UtensilsCrossed className="mx-auto mb-3 size-10 text-muted-foreground opacity-50" aria-hidden="true" />
            <p className="font-medium text-[#2B1D16]">Your menu is empty</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first dish so customers can start ordering.</p>
            <Button className="mt-4" onClick={() => { setFormItem(null); setFormOpen(true) }}><Plus data-icon="inline-start" />Add menu item</Button>
          </Card>
        ) : shown.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="font-medium text-[#2B1D16]">{needle ? `No dishes match "${query}"` : 'No dishes in this view'}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
          </Card>
        ) : (
          <Paged items={shown} pageSize={9} label="dishes" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(item) => renderCard(item)}
          </Paged>
        )}
      </div>

      <DishDrawer
        item={selectedItem}
        rows={selectedItem ? rowsByMenuItem.get(selectedItem.MenuItemID) ?? [] : []}
        stock={selectedItem ? stockByItem.get(selectedItem.MenuItemID) ?? null : null}
        toggling={selectedItem ? togglingId === selectedItem.MenuItemID : false}
        onToggle={(item) => void toggleAvailability(item)}
        onEdit={beginEdit}
        onClose={() => setSelectedId(null)}
      />

      <MenuItemForm
        open={formOpen}
        item={formItem}
        onClose={() => {
          setFormOpen(false)
          setFormItem(null)
          void loadMenu()
        }}
      />
    </DashboardLayout>
  )
}

/** Side panel with the recipe and stock for one dish. */
function DishDrawer({ item, rows, stock, toggling, onToggle, onEdit, onClose }: {
  item: MenuItem | null
  rows: IngredientRow[]
  stock: Stock | null
  toggling: boolean
  onToggle: (item: MenuItem) => void
  onEdit: (item: MenuItem) => void
  onClose: () => void
}) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    if (!item) { setEntered(false); return }
    const frame = requestAnimationFrame(() => setEntered(true))
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', onKey) }
  }, [item, onClose])

  if (!item || !stock) return null
  const style = stateStyle[stock.state]
  const perIngredient = rows.map((row) => {
    const possible = row.QuantityRequiredPerServing > 0 ? Math.floor((row.CurrentStock ?? 0) / row.QuantityRequiredPerServing) : 0
    return { row, possible }
  })
  const topPossible = Math.max(1, ...perIngredient.map((entry) => entry.possible))

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`${item.ItemName} details`}>
      <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${entered ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="relative">
          <DishPhoto item={item} className="aspect-[4/3] w-full" />
          <button type="button" onClick={onClose} aria-label="Close details" className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-white/90 text-[#2B1D16] shadow transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><X className="size-5" /></button>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-6">
          <div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}>{style.label}</span>
            <h2 className="mt-3 font-heading text-2xl font-bold uppercase leading-tight text-card-foreground">{item.ItemName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{categoryLabel(item.Category)}, {item.PrepTimeDays} {item.PrepTimeDays === 1 ? 'day' : 'days'} prep</p>
            <p className="mt-2 font-heading text-2xl font-bold tabular-nums text-[#C8431B]">{formatPrice(item.Price)} <span className="text-sm font-normal text-muted-foreground">per serving</span></p>
            <p className="mt-3 text-sm leading-6 text-[#2B1D16]">{item.Description || 'No description yet. Add one so customers know what they are ordering.'}</p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#E8D8C4] bg-[#FBF6EE] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-card-foreground">Show to customers</p>
              <p className="text-xs text-muted-foreground">{item.Availability === false ? 'Hidden from the customer menu' : 'Customers can order this dish'}</p>
            </div>
            <Switch checked={item.Availability !== false} busy={toggling} label={`Show ${item.ItemName} to customers`} onChange={() => onToggle(item)} />
          </div>

          <div>
            <h3 className="font-heading text-base font-bold text-card-foreground">What it takes to make one serving</h3>
            {stock.servings !== null && <p className="mt-1 text-sm text-muted-foreground">Current stock covers <span className="font-semibold text-[#2B1D16]">{stock.servings}</span> {stock.servings === 1 ? 'serving' : 'servings'}.</p>}
            {rows.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-[#E8D8C4] p-4 text-sm text-muted-foreground">No ingredients are linked to this dish. Edit the dish and add its recipe so stock can be tracked.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {perIngredient.map(({ row, possible }) => {
                  const limiting = stock.limiting?.DishIngredientID === row.DishIngredientID && stock.state !== 'ok' && stock.state !== 'hidden'
                  return (
                    <li key={row.DishIngredientID}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-[#2B1D16]">{row.IngredientName}</span>
                        <span className="text-muted-foreground">needs {formatQuantity(row.QuantityRequiredPerServing, row.UnitOfMeasure)}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E8D8C4]/60">
                        <div className={`h-full rounded-full ${limiting ? 'bg-[#C8431B]' : 'bg-emerald-500'}`} style={{ width: `${Math.round((possible / topPossible) * 100)}%` }} />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span>{formatQuantity(row.CurrentStock ?? 0, row.UnitOfMeasure)} in stock, enough for {possible}</span>
                        {limiting && <span className="font-semibold text-[#C8431B]">Runs out first</span>}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="mt-auto flex gap-2 pt-2">
            <Button type="button" className="flex-1" onClick={() => onEdit(item)}><Pencil data-icon="inline-start" />Edit dish</Button>
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </aside>
    </div>
  )
}
