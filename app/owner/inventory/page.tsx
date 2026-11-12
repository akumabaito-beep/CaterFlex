'use client';

import { Paged } from '@/components/owner/Pagination';
import { DashboardLayout } from '@/app/dashboard-layout';
import { formatQuantity } from '@/lib/rules/quantity-format';
import {
  createIngredient,
  updateIngredient,
  updateIngredientStock,
  getOwnerReservedIngredients,
} from '@/app/actions/inventory-actions';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ClipboardList,
  Lightbulb,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';

import { supabase } from '@/lib/supabase';

import { getScrapSuggestionsForBlockedDishes } from '@/lib/rules/scrapSuggestions';

import type { Ingredient, MenuItem } from '@/lib/types';

type IngredientCategory =
  | 'all'
  | 'low'
  | 'meats'
  | 'dairy'
  | 'baking'
  | 'produce'
  | 'pantry'
  | 'herbs_spices';

type DatabaseIngredient = {
  IngredientID: number;
  OperatorID: number;
  IngredientName: string;
  UnitOfMeasure: string;
  CurrentStock: number;
  MaxStorageCapacity: number;
  category?: string | null;
};

type DatabaseDishIngredient = {
  DishIngredientID: number;
  MenuItemID: number;
  IngredientID: number;
  QuantityRequiredPerServing: number;
};

type DatabaseMenuItem = {
  MenuItemID: number;
  ItemName: string;
  Category: string;
  Price: number;
  PrepTimeDays: number;
  Description: string;
  Availability?: boolean;
  };

function getIngredientCategory(name: string): Exclude<IngredientCategory, 'all' | 'low'> {
  const value = name.toLowerCase();

  if (
    value.includes('chicken') ||
    value.includes('beef') ||
    value.includes('salmon') ||
    value.includes('shrimp')
  ) {
    return 'meats';
  }

  if (
    value.includes('butter') ||
    value.includes('cheese') ||
    value.includes('feta') ||
    value.includes('milk') ||
    value.includes('cream')
  ) {
    return 'dairy';
  }

  if (
    value.includes('cocoa') ||
    value.includes('flour') ||
    value.includes('sugar') ||
    value.includes('baking')
  ) {
    return 'baking';
  }

  if (
    value.includes('rice') ||
    value.includes('peanut')
  ) {
    return 'pantry';
  }

  if (
    value.includes('salt') ||
    value.includes('pepper') ||
    value.includes('spice') ||
    value.includes('herb')
  ) {
    return 'herbs_spices';
  }

  return 'produce';
}

function mapIngredient(
  ingredient: DatabaseIngredient
): Ingredient {
  return {
    id: String(ingredient.IngredientID),
    name: ingredient.IngredientName,
    unit: ingredient.UnitOfMeasure,
    currentStock: Number(ingredient.CurrentStock),
    maxCapacity: Number(ingredient.MaxStorageCapacity),
    category:
      (ingredient.category as Exclude<IngredientCategory, 'all' | 'low'>) ||
      getIngredientCategory(ingredient.IngredientName),
  };
}

function mapMenuItem(
  menuItem: DatabaseMenuItem,
  dishIngredients: DatabaseDishIngredient[],
  ingredients: Ingredient[]
): MenuItem {
  const requiredIngredients = dishIngredients
    .filter(
      (dishIngredient) =>
        dishIngredient.MenuItemID === menuItem.MenuItemID
    )
    .map((dishIngredient) => {
      const ingredient = ingredients.find(
        (item) =>
          item.id === String(dishIngredient.IngredientID)
      );

      return {
        id: String(dishIngredient.IngredientID),
        name:
          ingredient?.name ??
          `Ingredient ${dishIngredient.IngredientID}`,
        qty: Number(
          dishIngredient.QuantityRequiredPerServing
        ),
        unit: ingredient?.unit ?? '',
      };
    });

    return {
      id: String(menuItem.MenuItemID),
      name: menuItem.ItemName,
      category: menuItem.Category.toLowerCase() as MenuItem['category'],
      price: Number(menuItem.Price),
      prepTimeDays: Number(menuItem.PrepTimeDays),
      description: menuItem.Description ?? '',
    
      // Macro Profile was removed from Supabase,
      // so keep the required frontend shape with neutral values.
      macros: {
        carbs: 0,
        protein: 0,
        fat: 0,
      },
    
      allergyTags: [] as MenuItem['allergyTags'],
    
      requiredIngredients,
    
      // This will be recalculated from INGREDIENT stock
      // using the existing stock rule.
      inventoryStatus: 'available',
    };
  }


type StatusFilter = 'all' | 'short' | 'low' | 'over';
type SortKey = 'urgent' | 'name' | 'most-stocked';
type CategoryKey = Exclude<IngredientCategory, 'all' | 'low'>;

const categoryLabels: Record<CategoryKey, string> = {
  meats: 'Meats',
  dairy: 'Dairy',
  baking: 'Baking',
  produce: 'Produce',
  pantry: 'Pantry',
  herbs_spices: 'Herbs & spices',
};
const knownCategories = Object.keys(categoryLabels);
const categoryOf = (category: string | null | undefined) => (category && knownCategories.includes(category) ? category : 'other');
const measurementOptions = ['kg', 'g', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'oz', 'lb', 'pcs'];

/** Numbers and flags for one ingredient, calculated once per render. */
type Row = {
  ingredient: Ingredient;
  percent: number;
  reserved: number;
  available: number;
  isShort: boolean;
  isLow: boolean;
  isOver: boolean;
  state: 'short' | 'over' | 'low' | 'medium' | 'good';
};

function buildRow(ingredient: Ingredient, reservedMap: Record<number, number>): Row {
  const capacity = ingredient.maxCapacity;
  const percent = capacity > 0 ? (ingredient.currentStock / capacity) * 100 : 100;
  const reserved = reservedMap[Number(ingredient.id)] ?? 0;
  const available = ingredient.currentStock - reserved;
  const isShort = available < 0;
  const isOver = capacity > 0 && ingredient.currentStock > capacity;
  const isLow = capacity > 0 && percent < 25;
  const state = isShort ? 'short' : isOver ? 'over' : isLow ? 'low' : percent < 50 ? 'medium' : 'good';
  return { ingredient, percent, reserved, available, isShort, isLow, isOver, state };
}

const stateStyle: Record<Row['state'], { label: string; chip: string; bar: string }> = {
  short: { label: 'Short for orders', chip: 'bg-[#F6E3D3] text-[#C8431B]', bar: 'bg-[#C8431B]' },
  over: { label: 'Over capacity', chip: 'bg-orange-100 text-orange-800', bar: 'bg-orange-500' },
  low: { label: 'Low', chip: 'bg-[#F6E3D3] text-[#C8431B]', bar: 'bg-[#C8431B]' },
  medium: { label: 'Medium', chip: 'bg-amber-100 text-amber-900', bar: 'bg-amber-500' },
  good: { label: 'Good', chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500' },
};

/** How much to buy: cover any shortfall, and fill back up to capacity when that is known. */
function suggestedBuy(row: Row) {
  const toFill = row.ingredient.maxCapacity > 0 ? Math.max(0, row.ingredient.maxCapacity - row.ingredient.currentStock) : 0;
  return Math.ceil(Math.max(toFill, row.isShort ? Math.abs(row.available) : 0));
}

/** One bar: reserved for confirmed orders (striped), free to use, and the empty space left up to capacity. */
function StockGauge({ row }: { row: Row }) {
  const { ingredient, reserved } = row;
  const total = Math.max(ingredient.maxCapacity, ingredient.currentStock, 1);
  const reservedPart = Math.min(Math.max(reserved, 0), ingredient.currentStock);
  const freePart = Math.max(ingredient.currentStock - reservedPart, 0);
  const pct = (value: number) => `${(value / total) * 100}%`;
  return (
    <div
      className="relative h-3 overflow-hidden rounded-full bg-[#E8D8C4]/60"
      role="img"
      aria-label={`${formatQuantity(ingredient.currentStock, ingredient.unit)} in stock, ${formatQuantity(reservedPart, ingredient.unit)} reserved for orders, ${formatQuantity(freePart, ingredient.unit)} free, capacity ${formatQuantity(ingredient.maxCapacity, ingredient.unit)}`}
    >
      <div className="flex h-full">
        <div
          className="h-full bg-slate-600 transition-all duration-500"
          style={{ width: pct(reservedPart), backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 3px, transparent 3px 6px)' }}
        />
        <div className={`h-full transition-all duration-500 ${stateStyle[row.state === 'short' ? 'low' : row.state].bar}`} style={{ width: pct(freePart) }} />
      </div>
      {row.isOver && <span className="absolute inset-y-0 w-0.5 bg-[#2B1D16]" style={{ left: pct(ingredient.maxCapacity) }} title="Capacity" />}
    </div>
  );
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const options: { key: SortKey; label: string }[] = [
    { key: 'urgent', label: 'Needs restocking first' },
    { key: 'name', label: 'Name A to Z' },
    { key: 'most-stocked', label: 'Most stocked first' },
  ];
  const current = options.find((option) => option.key === value) ?? options[0];
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => { if (!(event.target as HTMLElement).closest('[data-sort-menu]')) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);
  return (
    <div className="relative" data-sort-menu>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white pl-4 pr-3 text-sm font-medium text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
        <ArrowUpDown className="size-4 text-[#C8431B]" aria-hidden="true" />
        {current.label}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Sort ingredients" className="owner-list-page absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-[#E8D8C4] bg-white p-1 shadow-lg">
          {options.map((option) => (
            <li key={option.key} role="option" aria-selected={option.key === value}>
              <button type="button" onClick={() => { onChange(option.key); setOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f1f1f2] ${option.key === value ? 'font-semibold text-[#C8431B]' : 'text-[#2B1D16]'}`}>
                {option.label}
                {option.key === value && <Check className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [reservedIngredients, setReservedIngredients] = useState<Record<number, number>>({});
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [categoryTab, setCategoryTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('urgent');
  const [copied, setCopied] = useState(false);
  const [showUseItUp, setShowUseItUp] = useState(false);

  // Inline stock editor
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<'set' | 'add'>('set');
  const [editValue, setEditValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  // Add / edit ingredient form
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formId, setFormId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formQuantity, setFormQuantity] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formCategory, setFormCategory] = useState<CategoryKey>('produce');
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const normalizeMeasurementUnit = (unit: string) => {
    const legacyUnits: Record<string, string> = {
      units: 'pcs', grams: 'g', kilograms: 'kg', milliliters: 'ml', liters: 'l',
      teaspoons: 'tsp', tablespoons: 'tbsp', cups: 'cup', ounces: 'oz', pounds: 'lb',
    };
    return legacyUnits[unit.toLowerCase()] ?? (measurementOptions.includes(unit) ? unit : 'pcs');
  };

  /* Load ingredients, menu items and recipes from Supabase. */
  useEffect(() => {
    const loadInventory = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data: ingredientRows, error: ingredientError } = await supabase
          .from('INGREDIENT')
          .select('IngredientID, OperatorID, IngredientName, UnitOfMeasure, CurrentStock, MaxStorageCapacity, category')
          .order('IngredientID');
        if (ingredientError) throw new Error(`Failed to load ingredients: ${ingredientError.message}`);

        const { data: menuItemRows, error: menuItemError } = await supabase
          .from('MENU_ITEM')
          .select('MenuItemID, ItemName, Category, Price, PrepTimeDays, Description, Availability')
          .order('MenuItemID');
        if (menuItemError) throw new Error(`Failed to load menu items: ${menuItemError.message}`);

        const { data: dishIngredientRows, error: dishIngredientError } = await supabase
          .from('DISH_INGREDIENT')
          .select('DishIngredientID, MenuItemID, IngredientID, QuantityRequiredPerServing')
          .order('DishIngredientID');
        if (dishIngredientError) throw new Error(`Failed to load dish ingredients: ${dishIngredientError.message}`);

        const mappedIngredients = ((ingredientRows ?? []) as DatabaseIngredient[]).map(mapIngredient);
        const mappedMenuItems = ((menuItemRows ?? []) as DatabaseMenuItem[]).map((menuItem) =>
          mapMenuItem(menuItem, (dishIngredientRows ?? []) as DatabaseDishIngredient[], mappedIngredients),
        );
        setIngredients(mappedIngredients);
        const reservedResult = await getOwnerReservedIngredients();
        if (reservedResult.ok) setReservedIngredients(reservedResult.reserved);
        setMenuItems(mappedMenuItems);
      } catch (error) {
        console.error('Inventory loading error:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load inventory data.');
      } finally {
        setLoading(false);
      }
    };
    loadInventory();
  }, []);

  const rows = useMemo(() => ingredients.map((ingredient) => buildRow(ingredient, reservedIngredients)), [ingredients, reservedIngredients]);

  const scrapSuggestions = useMemo(
    () => getScrapSuggestionsForBlockedDishes(menuItems, ingredients, reservedIngredients),
    [ingredients, menuItems, reservedIngredients],
  );

  const needle = query.trim().toLowerCase();
  const searched = rows.filter((row) => !needle || row.ingredient.name.toLowerCase().includes(needle));
  const inCategory = searched.filter((row) => categoryTab === 'all' || categoryOf(row.ingredient.category) === categoryTab);
  const stateCounts = {
    all: inCategory.length,
    short: inCategory.filter((row) => row.isShort).length,
    low: inCategory.filter((row) => row.isLow).length,
    over: inCategory.filter((row) => row.isOver).length,
  };
  const shown = inCategory
    .filter((row) => statusFilter === 'all' || (statusFilter === 'short' ? row.isShort : statusFilter === 'low' ? row.isLow : row.isOver))
    .sort((a, b) => {
      if (sortKey === 'name') return a.ingredient.name.localeCompare(b.ingredient.name);
      if (sortKey === 'most-stocked') return b.percent - a.percent;
      return Number(b.isShort) - Number(a.isShort) || a.percent - b.percent || a.ingredient.name.localeCompare(b.ingredient.name);
    });

  const categoryTabs: [string, string][] = [
    ['all', 'All stock'],
    ...(Object.entries(categoryLabels) as [string, string][]),
    ...(rows.some((row) => categoryOf(row.ingredient.category) === 'other') ? [['other', 'Other'] as [string, string]] : []),
  ];
  const tabCount = (key: string) => searched.filter((row) => key === 'all' || categoryOf(row.ingredient.category) === key).length;
  const chips: [StatusFilter, string][] = [['all', 'All'], ['short', 'Short for orders'], ['low', 'Low'], ['over', 'Over capacity']];

  const needRestock = rows.filter((row) => row.isShort || row.isLow);
  const shortCount = rows.filter((row) => row.isShort).length;

  const copyShoppingList = async () => {
    const lines = needRestock
      .sort((a, b) => Number(b.isShort) - Number(a.isShort) || a.percent - b.percent)
      .map((row) => `- ${row.ingredient.name}: buy ${formatQuantity(suggestedBuy(row), row.ingredient.unit)}${row.isShort ? ' (short for confirmed orders)' : ''}`);
    const text = `Shopping list\n${lines.join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setActionError('Could not copy the list. Select the ingredients you need and note them down instead.');
    }
  };

  const clearFilters = () => { setQuery(''); setStatusFilter('all'); setCategoryTab('all'); };

  /* Inline stock editing */
  const startEdit = (row: Row) => {
    setEditingId(row.ingredient.id);
    setEditMode('set');
    setEditValue(String(row.ingredient.currentStock));
    setActionError('');
  };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };

  const saveStock = async (row: Row) => {
    const entered = Number(editValue);
    const newStock = editMode === 'add' ? row.ingredient.currentStock + entered : entered;
    if (editValue.trim() === '' || !Number.isInteger(entered) || entered < 0 || !Number.isInteger(newStock) || newStock < 0) {
      setActionError('Enter a whole number that is 0 or more.');
      return;
    }
    setSavingId(row.ingredient.id);
    setActionError('');
    try {
      const result = await updateIngredientStock(Number(row.ingredient.id), newStock);
      if (!result.ok) {
        setActionError(`Could not update ${row.ingredient.name}. ${result.error}`);
        return;
      }
      setIngredients((current) => current.map((item) => (item.id === row.ingredient.id ? { ...item, currentStock: result.currentStock } : item)));
      cancelEdit();
    } catch (error) {
      console.error('Unexpected stock update error:', error);
      setActionError('Something went wrong while updating stock. Try again.');
    } finally {
      setSavingId(null);
    }
  };

  /* Add / edit ingredient form */
  const openAddIngredient = () => {
    setFormMode('add'); setFormId(null); setFormName(''); setFormQuantity(''); setFormUnit('pcs'); setFormCategory('produce'); setFormError(''); setFormOpen(true);
  };
  const openEditIngredient = (ingredient: Ingredient) => {
    setFormMode('edit'); setFormId(ingredient.id); setFormName(ingredient.name); setFormQuantity(String(ingredient.currentStock));
    setFormUnit(normalizeMeasurementUnit(ingredient.unit));
    setFormCategory(ingredient.category === 'other' ? 'pantry' : (ingredient.category as CategoryKey));
    setFormError(''); setFormOpen(true);
  };
  const closeForm = () => { if (!formSaving) setFormOpen(false); };
  useEffect(() => {
    if (!formOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !formSaving) setFormOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [formOpen, formSaving]);

  const handleIngredientSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = Number(formQuantity);
    if (!formName.trim() || !formUnit.trim() || !Number.isInteger(quantity) || quantity < 0) {
      setFormError('Enter a name, a unit and a whole-number quantity of 0 or more.');
      return;
    }
    setFormSaving(true);
    setFormError('');
    const result = formMode === 'add'
      ? await createIngredient({ name: formName, quantity, category: formCategory, unit: formUnit })
      : await updateIngredient(Number(formId), { name: formName, quantity, category: formCategory, unit: formUnit });
    if (!result.ok) {
      setFormError(`Could not ${formMode === 'add' ? 'add' : 'update'} the ingredient. ${result.error}`);
      setFormSaving(false);
      return;
    }
    const mapped = mapIngredient(result.ingredient as DatabaseIngredient);
    setIngredients((current) => formMode === 'add'
      ? [...current, mapped].sort((a, b) => Number(a.id) - Number(b.id))
      : current.map((ingredient) => (ingredient.id === mapped.id ? mapped : ingredient)));
    setFormOpen(false);
    setFormSaving(false);
  };

  const renderRow = (row: Row) => {
    const { ingredient } = row;
    const style = stateStyle[row.state];
    const editing = editingId === ingredient.id;
    const saving = savingId === ingredient.id;
    const entered = Number(editValue);
    const preview = editMode === 'add' ? ingredient.currentStock + entered : entered;
    const previewValid = editValue.trim() !== '' && Number.isInteger(entered) && entered >= 0 && Number.isInteger(preview) && preview >= 0;
    const free = Math.max(row.available, 0);

    return (
      <article key={ingredient.id} className={`rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm ${row.isShort ? 'border-l-4 border-[#E8D8C4] border-l-[#C8431B]' : 'border-[#E8D8C4]'}`}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <h3 className="break-words font-heading text-lg font-bold uppercase leading-tight tracking-tight text-card-foreground">{ingredient.name}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${style.chip}`}>{style.label}</span>
              <span className="text-xs text-muted-foreground">{categoryLabels[categoryOf(ingredient.category) as CategoryKey] ?? 'Other'}</span>
            </div>
          </div>

          <div className="min-w-0">
            <StockGauge row={row} />
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div><dt className="text-muted-foreground">In stock</dt><dd className="text-sm font-semibold tabular-nums text-card-foreground">{formatQuantity(ingredient.currentStock, ingredient.unit)}</dd></div>
              <div><dt className="text-muted-foreground">Reserved for orders</dt><dd className="text-sm font-semibold tabular-nums text-card-foreground">{formatQuantity(row.reserved, ingredient.unit)}</dd></div>
              <div><dt className="text-muted-foreground">Free to use</dt><dd className={`text-sm font-semibold tabular-nums ${row.isShort ? 'text-[#C8431B]' : 'text-card-foreground'}`}>{formatQuantity(free, ingredient.unit)}</dd></div>
              <div><dt className="text-muted-foreground">Capacity</dt><dd className="text-sm font-semibold tabular-nums text-card-foreground">{ingredient.maxCapacity > 0 ? formatQuantity(ingredient.maxCapacity, ingredient.unit) : 'Not set'}</dd></div>
            </dl>
            {row.isShort && <p className="mt-2 text-sm font-semibold text-[#C8431B]">Short by {formatQuantity(Math.abs(row.available), ingredient.unit)} for confirmed orders.</p>}
          </div>

          <div className="flex items-center gap-2 lg:flex-col lg:items-stretch">
            <Button type="button" size="sm" onClick={() => startEdit(row)} disabled={editing}><PackagePlus data-icon="inline-start" />Update stock</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => openEditIngredient(ingredient)}><Pencil data-icon="inline-start" />Edit</Button>
          </div>
        </div>

        {editing && (
          <form
            onSubmit={(event) => { event.preventDefault(); void saveStock(row); }}
            onKeyDown={(event) => { if (event.key === 'Escape') cancelEdit(); }}
            className="owner-list-page mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-[#E8D8C4] bg-[#FBF6EE] p-4"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              New stock ({ingredient.unit})
              <input autoFocus type="number" inputMode="numeric" min={0} step={1} value={editValue} onChange={(event) => setEditValue(event.target.value)} disabled={saving} className="h-9 w-36 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm text-card-foreground outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />
            </label>
            <p className="pb-2 text-sm text-muted-foreground">{previewValid ? <>Stock will be <span className="font-semibold text-card-foreground">{formatQuantity(preview, ingredient.unit)}</span></> : 'Enter a whole number'}</p>
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving || !previewValid}>{saving ? 'Saving...' : 'Save stock'}</Button>
            </div>
          </form>
        )}
      </article>
    );
  };

  const header = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Ingredient inventory</h1>
        <p className="mt-2 text-surface-muted-foreground">See what you have, what is promised to orders and what to buy next</p>
      </div>
      {!loading && !loadError && <Button onClick={openAddIngredient}><Plus data-icon="inline-start" />Add ingredient</Button>}
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          {header}
          <Card className="flex items-center justify-center gap-2 p-12 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading inventory...</Card>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          {header}
          <Card className="border-destructive/40 bg-destructive/10 p-6">
            <p className="font-semibold text-destructive">Unable to load inventory</p>
            <p className="mt-1 text-sm text-destructive">{loadError}</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {header}

        {ingredients.length > 0 && (
          needRestock.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C8431B]/30 bg-[#F6E3D3] px-5 py-4">
              <p className="text-sm font-medium text-[#C8431B]">
                <span className="font-heading text-lg font-bold">{needRestock.length}</span> {needRestock.length === 1 ? 'ingredient needs' : 'ingredients need'} restocking
                {shortCount > 0 ? `, ${shortCount} ${shortCount === 1 ? 'is' : 'are'} short for confirmed orders.` : '.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyShoppingList}>{copied ? <><Check data-icon="inline-start" />Copied</> : <><ClipboardList data-icon="inline-start" />Copy shopping list</>}</Button>
                <Button type="button" size="sm" onClick={() => { clearFilters(); setStatusFilter(shortCount > 0 ? 'short' : 'low'); }}>Show them</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E8D8C4] bg-white px-5 py-4 text-sm text-muted-foreground"><span className="font-semibold text-[#2B1D16]">Stock looks healthy.</span> Nothing is low and every confirmed order is covered.</div>
          )
        )}

        {actionError && (
          <Card className="flex items-start justify-between gap-3 border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{actionError}</p>
            <button type="button" aria-label="Dismiss message" onClick={() => setActionError('')} className="text-destructive"><X className="size-4" /></button>
          </Card>
        )}

        {scrapSuggestions.length > 0 && (
          <Card className="p-0">
            <button type="button" aria-expanded={showUseItUp} onClick={() => setShowUseItUp((v) => !v)} className="flex w-full items-center justify-between gap-3 rounded-xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
              <span className="flex items-center gap-2 font-heading text-base font-bold text-card-foreground"><Lightbulb className="size-5 text-[#C8431B]" aria-hidden="true" />Use it up: {scrapSuggestions.length} {scrapSuggestions.length === 1 ? 'dish' : 'dishes'} you can still make with leftovers</span>
              <ChevronDown className={`size-5 text-muted-foreground transition-transform duration-200 ${showUseItUp ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {showUseItUp && (
              <ul className="owner-list-page space-y-2 border-t border-[#E8D8C4] px-5 py-4 text-sm text-[#2B1D16]">
                {scrapSuggestions.map((suggestion) => (
                  <li key={suggestion.dishId}>
                    <span className="font-semibold">{suggestion.dishName}</span> with leftover {suggestion.usesLeftover.map((leftover) => `${leftover.ingredientName} (${leftover.quantity}${leftover.unit})`).join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <div className="flex flex-wrap gap-1 border-b border-[#E8D8C4]" role="tablist" aria-label="Ingredient category">
          {categoryTabs.map(([key, label]) => {
            const active = categoryTab === key;
            return (
              <button key={key} type="button" role="tab" aria-selected={active} onClick={() => setCategoryTab(key)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${active ? 'border-[#C8431B] text-[#C8431B]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'}`}>
                {label}
                <span className="rounded-full bg-[#F6E3D3] px-2 py-0.5 text-xs text-[#C8431B]">{tabCount(key)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by stock level">
            {chips.map(([key, label]) => (
              <button key={key} type="button" aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${statusFilter === key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>
                {label} <span className="opacity-70">{stateCounts[key]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">Search ingredients</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ingredients" className="h-9 w-56 rounded-full border border-[#E8D8C4] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />
            </label>
            <SortMenu value={sortKey} onChange={setSortKey} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground" aria-label="Bar legend">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-5 rounded-full bg-emerald-500" />Free to use</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-5 rounded-full bg-slate-600" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 3px, transparent 3px 6px)' }} />Reserved for confirmed orders</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-5 rounded-full bg-[#E8D8C4]/70" />Empty space up to capacity</span>
        </div>

        {ingredients.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="font-medium text-[#2B1D16]">No ingredients yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Add your first ingredient to start tracking stock.</p>
            <Button className="mt-4" onClick={openAddIngredient}><Plus data-icon="inline-start" />Add ingredient</Button>
          </Card>
        ) : shown.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="font-medium text-[#2B1D16]">{needle ? `No ingredients match "${query}"` : 'Nothing in this view'}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
          </Card>
        ) : (
          <Paged items={shown} pageSize={8} label="ingredients" className="space-y-3">
            {(row) => renderRow(row)}
          </Paged>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={closeForm}>
          <div role="dialog" aria-modal="true" aria-label={formMode === 'add' ? 'Add ingredient' : 'Edit ingredient'} className="w-full max-w-md rounded-2xl border border-[#E8D8C4] bg-white p-6 text-card-foreground shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold">{formMode === 'add' ? 'Add ingredient' : 'Edit ingredient'}</h2>
              <button type="button" onClick={closeForm} disabled={formSaving} aria-label="Close" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-[#f1f1f2]"><X className="size-5" /></button>
            </div>
            <form onSubmit={handleIngredientSubmit} className="flex flex-col gap-4">
              {([
                ['Name', <input key="n" autoFocus value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="Ingredient name" required disabled={formSaving} className="h-10 w-full rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />],
                [`Quantity (${formUnit})`, <input key="q" type="number" min="0" step="1" value={formQuantity} onChange={(event) => setFormQuantity(event.target.value)} placeholder="0" required disabled={formSaving} className="h-10 w-full rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />],
              ] as [string, React.ReactNode][]).map(([label, input]) => (
                <label key={label} className="flex flex-col gap-1.5 text-sm font-medium">{label}{input}</label>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium">Unit
                  <select value={formUnit} onChange={(event) => setFormUnit(event.target.value)} disabled={formSaving} className="h-10 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20">
                    {measurementOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">Category
                  <select value={formCategory} onChange={(event) => setFormCategory(event.target.value as CategoryKey)} disabled={formSaving} className="h-10 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20">
                    {(Object.entries(categoryLabels) as [CategoryKey, string][]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </div>
              {formError && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>}
              <div className="mt-1 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={closeForm} disabled={formSaving}>Cancel</Button>
                <Button type="submit" disabled={formSaving}>{formSaving ? 'Saving...' : formMode === 'add' ? 'Add ingredient' : 'Save changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
