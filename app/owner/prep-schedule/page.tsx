'use client';

import { useEffect, useState } from 'react';

import { DashboardLayout } from '@/app/dashboard-layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CalendarDays, CheckCircle2, ChefHat, Clock, PackageCheck, Search, UtensilsCrossed } from 'lucide-react';

import { getOwnerPrepSchedule } from '@/app/actions/booking-actions';
import { markBookingPrepared, markMealPrepCyclePrepared } from '@/app/actions/preparation-actions';
import { servingsForBookingItem, servingsForOrder } from '@/lib/rules/allocation';

const OPERATOR_ID = 2;

type MenuItem = {
  MenuItemID: number;
  ItemName: string;
  PrepTimeDays: number | null;
};

type Customer = {
  CustomerID: number;
  Name: string;
};

type Booking = {
  BookingID: number;
  CustomerID: number | null;
  EventDate: string;
  EventTime: string | null;
  Venue: string | null;
  GuestCount: number;
  Status: string | null;
};

type BookingItem = {
  BookingItemID: number;
  BookingID: number;
  MenuItemID: number;
  Quantity: number;
};

type MealPrepOrder = {
  MealPrepOrderID: number;
  CustomerID: number | null;
  RecurrencePattern: string | null;
  MealsPerCycle: number | null;
  NextFulfillmentDate: string | null;
  Status: string | null;
};

type MealPrepItem = {
  MealPrepItemID: number;
  MealPrepOrderID: number;
  MenuItemID: number;
  Quantity: number;
};

type CateringPrepItem = {
  bookingId: number;
  id: string;
  customerName: string;
  eventDate: Date;
  venue: string;
  eventTime: string;
  lineItems: Array<{
    itemName: string;
    prepStartDate: Date;
    prepDays: number;
    quantity: number;
  }>;
};

type MealPrepDisplayItem = {
  orderId: number;
  id: string;
  customerName: string;
  recurrencePattern: string;
  mealsPerCycle: number;
  nextFulfillmentDate: string | null;
  status: string | null;
  lineItems: Array<{
    itemName: string;
    quantity: number;
    prepTimeDays: number | null;
  }>;
};

export default function PrepSchedulePage() {
  const [cateringPrep, setCateringPrep] = useState<
    CateringPrepItem[]
  >([]);

  const [mealPrep, setMealPrep] = useState<
    MealPrepDisplayItem[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'catering' | 'meal'>('all');
  const [view, setView] = useState<'todo' | 'done'>('todo');
  const [query, setQuery] = useState('');

  const [error, setError] = useState<string | null>(
    null
  );
  const [preparedBookings, setPreparedBookings] = useState<Set<number>>(new Set());
  const [preparedCycles, setPreparedCycles] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  // ============================================================
  // LOAD PREP SCHEDULE FROM SUPABASE
  // ============================================================

  useEffect(() => {
    const loadPrepSchedule = async () => {
      setLoading(true);
      setError(null);

      try {
        const schedule = await getOwnerPrepSchedule();
        if (!schedule.ok) throw new Error(schedule.error);

        const bookings = schedule.bookings as Booking[];
        const bookingItems = schedule.bookingItems as BookingItem[];
        const mealPrepOrders = schedule.mealPrepOrders as MealPrepOrder[];
        const mealPrepItems = schedule.mealPrepItems as MealPrepItem[];
        const customers = schedule.customers as Customer[];
        const menuItems = schedule.menuItems as MenuItem[];
        const preparationLogs = (schedule.preparationLogs ?? []) as Array<{ BookingID: number | null; MealPrepOrderID: number | null; CycleDate: string | null }>;
        setPreparedBookings(new Set(preparationLogs.filter((log) => log.BookingID != null).map((log) => Number(log.BookingID))));
        setPreparedCycles(new Set(preparationLogs.filter((log) => log.MealPrepOrderID != null && log.CycleDate).map((log) => `${Number(log.MealPrepOrderID)}:${String(log.CycleDate).slice(0, 10)}`)));

        // ========================================================
        // 9. BUILD CATERING PREPARATION SCHEDULE
        // ========================================================

        const cateringPrepItems: CateringPrepItem[] =
          bookings.map((booking) => {
            const customer = customers.find(
              (item) => item.CustomerID === booking.CustomerID
            );
            const eventDate = new Date(`${booking.EventDate}T12:00:00`);
            const lineItems = bookingItems
              .filter((item) => item.BookingID === booking.BookingID)
              .flatMap((bookingItem) => {
                const menuItem = menuItems.find(
                  (item) => item.MenuItemID === bookingItem.MenuItemID
                );
                if (!menuItem) return [];

                const prepDays = Number(menuItem.PrepTimeDays ?? 0);
                const prepStartDate = new Date(eventDate);
                prepStartDate.setDate(prepStartDate.getDate() - prepDays);

                return [{
                  itemName: menuItem.ItemName,
                  prepStartDate,
                  prepDays,
                  quantity: servingsForBookingItem(bookingItem.Quantity, booking.GuestCount),
                }];
              });

            return {
              bookingId: booking.BookingID,
              id: `catering-${booking.BookingID}`,
              customerName: customer?.Name ?? 'Unknown customer',
              eventDate,
              venue: booking.Venue ?? 'No venue provided',
              eventTime: booking.EventTime ?? '',
              lineItems,
            };
          }).filter((booking) => booking.lineItems.length > 0);

        // ========================================================
        // 10. BUILD RECURRING MEAL PREP SCHEDULE
        //
        // There is no EventDate in MEAL_PREP_ORDER.
        // Therefore we DO NOT invent a preparation date.
        //
        // Instead, display the confirmed recurring orders.
        // ========================================================

        const mealPrepDisplayItems: MealPrepDisplayItem[] =
          mealPrepOrders.map((order) => {
            const customer =
              customers.find(
                (item) =>
                  item.CustomerID ===
                  order.CustomerID
              );

            const itemsForOrder =
              mealPrepItems.filter(
                (item) =>
                  item.MealPrepOrderID ===
                  order.MealPrepOrderID
              );

            const lineItems = itemsForOrder.flatMap(
              (mealPrepItem) => {
                const menuItem = menuItems.find(
                  (item) =>
                    item.MenuItemID ===
                    mealPrepItem.MenuItemID
                );

                return menuItem
                  ? [{
                      itemName: menuItem.ItemName,
                      quantity: servingsForOrder('meal_prep', undefined, order.MealsPerCycle),
                      prepTimeDays: menuItem.PrepTimeDays,
                    }]
                  : [];
              }
            );

            return {
              orderId: order.MealPrepOrderID,
              id: `meal-prep-${order.MealPrepOrderID}`,
              customerName:
                customer?.Name ??
                'Unknown customer',
              recurrencePattern:
                order.RecurrencePattern ??
                'Recurring',
              mealsPerCycle: Number(
                order.MealsPerCycle ?? 0
              ),
              nextFulfillmentDate:
                order.NextFulfillmentDate,
              status: order.Status,
              lineItems,
            };
          }).filter((order) => order.lineItems.length > 0);

        // ========================================================
        // 11. SAVE TO PAGE
        // ========================================================

        setCateringPrep(cateringPrepItems);

        setMealPrep(mealPrepDisplayItems);
      } catch (loadError) {
        console.error(
          'PREP SCHEDULE LOAD ERROR:',
          loadError
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Unable to load the preparation schedule.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadPrepSchedule();
  }, []);

  // ============================================================
  // BUILD ONE UNIFIED TASK LIST
  // A task is "cook this order, starting on this day".
  // ============================================================

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  const daysFromToday = (d: Date) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / dayMs);

  const tasks: PrepTask[] = [
    ...cateringPrep.map((item): PrepTask => {
      const start = item.lineItems.reduce((e, l) => (l.prepStartDate < e ? l.prepStartDate : e), item.lineItems[0].prepStartDate);
      return {
        key: item.id,
        kind: 'catering',
        customerName: item.customerName,
        start,
        due: item.eventDate,
        detail: [item.eventTime && formatTime(item.eventTime), item.venue].filter(Boolean).join(' · '),
        lines: item.lineItems.map((l) => ({ itemName: l.itemName, quantity: l.quantity, prepDays: l.prepDays })),
        prepared: preparedBookings.has(item.bookingId),
        mark: () => handleBookingPrepared(item),
      };
    }),
    ...mealPrep
      .filter((order) => order.nextFulfillmentDate)
      .map((order): PrepTask => {
        const due = new Date(`${order.nextFulfillmentDate}T12:00:00`);
        const maxDays = Math.max(0, ...order.lineItems.map((l) => Number(l.prepTimeDays ?? 0)));
        const start = new Date(due);
        start.setDate(start.getDate() - maxDays);
        return {
          key: order.id,
          kind: 'meal',
          customerName: order.customerName,
          start,
          due,
          detail: `${order.recurrencePattern} · ${order.mealsPerCycle} ${order.mealsPerCycle === 1 ? 'meal' : 'meals'} per delivery${order.status ? ` · ${order.status}` : ''}`,
          lines: order.lineItems.map((l) => ({ itemName: l.itemName, quantity: l.quantity, prepDays: Number(l.prepTimeDays ?? 0) })),
          prepared: preparedCycles.has(`${order.orderId}:${order.nextFulfillmentDate?.slice(0, 10)}`),
          mark: () => handleMealPrepPrepared(order),
        };
      }),
  ];

  // Anything whose due date has not passed stays on the list, even if its start date is already behind us.
  const needle = query.trim().toLowerCase();
  const matchesSearch = (t: PrepTask) => !needle || t.customerName.toLowerCase().includes(needle);
  const open = tasks
    .filter((t) => !t.prepared && daysFromToday(t.due) >= 0 && (filter === 'all' || t.kind === filter) && matchesSearch(t))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.due.getTime() - b.due.getTime());
  const done = tasks
    .filter((t) => t.prepared && (filter === 'all' || t.kind === filter) && matchesSearch(t))
    .sort((a, b) => b.due.getTime() - a.due.getTime());
  const todoTotal = tasks.filter((t) => !t.prepared && daysFromToday(t.due) >= 0).length;
  const doneTotal = tasks.filter((t) => t.prepared).length;

  const groupOf = (t: PrepTask) => {
    const d = daysFromToday(t.start);
    return d < 0 ? 'Overdue – start now' : d === 0 ? 'Start today' : d === 1 ? 'Start tomorrow' : d <= 7 ? 'This week' : 'Later';
  };
  const groupOrder = ['Overdue – start now', 'Start today', 'Start tomorrow', 'This week', 'Later'];
  const groups = groupOrder
    .map((name) => ({ name, items: open.filter((t) => groupOf(t) === name) }))
    .filter((g) => g.items.length > 0);

  // Today's cook list: the same dish across several orders is added up.
  const cookNow = open.filter((t) => daysFromToday(t.start) <= 0);
  const cookList = Object.entries(
    cookNow.flatMap((t) => t.lines).reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.itemName]: (acc[l.itemName] ?? 0) + l.quantity }), {}),
  ).sort((a, b) => b[1] - a[1]);

  const stats = {
    now: cookNow.length,
    soon: open.filter((t) => { const d = daysFromToday(t.start); return d > 0 && d <= 3; }).length,
    servings: open.reduce((sum, t) => sum + t.lines.reduce((s, l) => s + l.quantity, 0), 0),
    done: done.length,
  };

  const handleBookingPrepared = async (booking: CateringPrepItem) => {
    setActionError(null);
    const result = await markBookingPrepared(booking.bookingId);
    if (!result.ok) setActionError(result.error);
    else setPreparedBookings((current) => new Set(current).add(booking.bookingId));
  };

  const handleMealPrepPrepared = async (order: MealPrepDisplayItem) => {
    setActionError(null);
    if (!order.nextFulfillmentDate) return;
    const result = await markMealPrepCyclePrepared(order.orderId, order.nextFulfillmentDate.slice(0, 10));
    if (!result.ok) setActionError(result.error);
    else setPreparedCycles((current) => new Set(current).add(`${order.orderId}:${order.nextFulfillmentDate?.slice(0, 10)}`));
  };

  const shortDate = (d: Date) => d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

  // ============================================================
  // PAGE
  // ============================================================

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Prep Schedule</h1>
          <p className="mt-2 text-surface-muted-foreground">What to start cooking, in the order it is needed</p>
        </header>

        {actionError && (
          <Card className="border-destructive/40 bg-destructive/10 p-4"><p className="text-sm text-destructive">{actionError}</p></Card>
        )}

        {loading && (
          <Card className="p-12 text-center">
            <Clock className="mx-auto mb-4 size-10 animate-pulse text-muted-foreground" />
            <p className="text-muted-foreground">Loading preparation schedule...</p>
          </Card>
        )}

        {!loading && error && (
          <Card className="p-8">
            <p className="font-semibold text-destructive">Unable to load preparation schedule</p>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          </Card>
        )}

        {!loading && !error && (
          <>
            <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Start now', value: stats.now, hot: stats.now > 0 },
                { label: 'Starting in 3 days', value: stats.soon },
                { label: 'Servings to prepare', value: stats.servings },
                { label: 'Prepared', value: stats.done },
              ].map((s) => (
                <Card key={s.label} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className={`mt-1 font-heading text-3xl font-bold ${s.hot ? 'text-[#C8431B]' : 'text-[#2B1D16]'}`}>{s.value}</p>
                </Card>
              ))}
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                {([['todo', `To prepare (${todoTotal})`], ['done', `Prepared (${doneTotal})`]] as const).map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`h-9 rounded-full border px-4 text-sm font-semibold transition-colors ${view === key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>{label}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1.5" role="group" aria-label="Filter by type">
                  {([['all', 'All'], ['catering', 'Catering'], ['meal', 'Meal prep']] as const).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${filter === key ? 'border-[#C8431B] bg-[#F6E3D3] text-[#C8431B]' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>{label}</button>
                  ))}
                </div>
                <label className="relative">
                  <span className="sr-only">Search by customer name</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer name" className="h-9 w-56 rounded-full border border-[#E8D8C4] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />
                </label>
              </div>
            </div>

            {view === 'todo' && cookList.length > 0 && (
              <Card className="border-[#C8431B]/30 bg-[#FBF6EE] p-5">
                <div className="flex items-center gap-2">
                  <ChefHat className="size-5 text-[#C8431B]" aria-hidden="true" />
                  <h2 className="font-heading text-lg font-bold text-card-foreground">Cook list for right now</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Everything that should already be in progress, added up per dish.</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {cookList.map(([name, qty]) => (
                    <li key={name} className="rounded-full border border-[#E8D8C4] bg-white px-3 py-1 text-sm font-medium text-[#2B1D16]">{name} <span className="font-bold text-[#C8431B]">× {qty}</span></li>
                  ))}
                </ul>
              </Card>
            )}

            {view === 'done' ? (
              done.length === 0 ? (
                <Card className="p-12 text-center"><CheckCircle2 className="mx-auto mb-4 size-12 text-muted-foreground opacity-50" /><p className="text-muted-foreground">{needle ? `No prepared orders match "${query}".` : 'Nothing has been marked as prepared yet.'}</p></Card>
              ) : (
                <ul className="owner-list-page flex flex-col gap-2">
                  {done.map((t) => (
                    <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8D8C4] bg-white px-4 py-3 text-sm">
                      <span className="font-medium text-[#2B1D16]">{t.customerName} <span className="font-normal text-muted-foreground">· {t.kind === 'meal' ? 'Meal prep' : 'Catering'} · {t.lines.length} {t.lines.length === 1 ? 'dish' : 'dishes'}</span></span>
                      <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 className="size-4" aria-hidden="true" />Prepared · {shortDate(t.due)}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : groups.length === 0 ? (
              <Card className="p-12 text-center">
                <PackageCheck className="mx-auto mb-4 size-12 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">{needle ? `No orders match "${query}".` : `Nothing to prepare${filter !== 'all' ? ' for this filter' : ''}. You are all caught up.`}</p>
              </Card>
            ) : (
              groups.map((group) => (
                <section key={group.name} aria-label={group.name} className="flex flex-col gap-3">
                  <h2 className={`flex items-center gap-2 font-heading text-sm font-bold uppercase tracking-wide ${group.name.startsWith('Overdue') ? 'text-[#C8431B]' : 'text-muted-foreground'}`}>
                    {group.name.startsWith('Overdue') && <AlertTriangle className="size-4" aria-hidden="true" />}
                    {group.name} <span className="rounded-full bg-[#C8431B]/10 px-2 text-xs text-[#C8431B]">{group.items.length}</span>
                  </h2>
                  <ul className="owner-list-page flex flex-col gap-3">
                    {group.items.map((t) => (
                      <TaskCard key={t.key} task={t} shortDate={shortDate} urgent={group.name.startsWith('Overdue')} />
                    ))}
                  </ul>
                </section>
              ))
            )}

          </>
        )}
      </div>
    </DashboardLayout>
  );
}

type PrepTask = {
  key: string;
  kind: 'catering' | 'meal';
  customerName: string;
  start: Date;
  due: Date;
  detail: string;
  lines: Array<{ itemName: string; quantity: number; prepDays: number }>;
  prepared: boolean;
  mark: () => Promise<void> | void;
};

function formatTime(value: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

function TaskCard({ task, shortDate, urgent }: { task: PrepTask; shortDate: (d: Date) => string; urgent: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const storageKey = `prep-checklist:${task.key}:${task.due.toISOString().slice(0, 10)}`;
  const [checked, setChecked] = useState<string[]>([]);

  // Ticks are a kitchen aid, kept in this browser so a refresh does not lose them.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(saved)) setChecked(saved.filter((n): n is string => typeof n === 'string'));
    } catch { /* storage unavailable */ }
  }, [storageKey]);

  const toggle = (name: string) => {
    setConfirming(false);
    setChecked((current) => {
      const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
      try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const total = task.lines.length;
  const doneCount = task.lines.filter((l) => checked.includes(l.itemName)).length;
  const allChecked = total > 0 && doneCount === total;
  const isMeal = task.kind === 'meal';
  const Icon = isMeal ? UtensilsCrossed : CalendarDays;
  return (
    <li className={`rounded-2xl border bg-white p-4 transition-shadow hover:shadow-sm ${urgent ? 'border-[#C8431B]/50' : 'border-[#E8D8C4]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${isMeal ? 'bg-teal-50 text-teal-700' : 'bg-[#F6E3D3] text-[#C8431B]'}`}><Icon className="size-5" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold uppercase leading-tight text-[#2B1D16]">{task.customerName}</p>
            <p className="text-sm text-muted-foreground">{isMeal ? 'Meal prep delivery' : 'Catering event'}{task.detail ? ` · ${task.detail}` : ''}</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className={`font-semibold ${urgent ? 'text-[#C8431B]' : 'text-[#2B1D16]'}`}>Start {shortDate(task.start)}</p>
          <p className="text-muted-foreground">{isMeal ? 'Deliver' : 'Event'} {shortDate(task.due)}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E8D8C4]/60" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Dishes checked">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
        </div>
        <span className="text-xs font-semibold text-muted-foreground">{doneCount} of {total} dishes</span>
      </div>

      <ul className="mt-3 divide-y divide-[#E8D8C4]/70 rounded-xl border border-[#E8D8C4]/70">
        {task.lines.map((l) => {
          const on = checked.includes(l.itemName);
          return (
            <li key={l.itemName}>
              <label className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-[#f1f1f2] ${on ? 'bg-emerald-50/60' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(l.itemName)} className="size-4 shrink-0 accent-emerald-600" />
                <span className={`flex-1 font-medium ${on ? 'text-muted-foreground line-through' : 'text-[#2B1D16]'}`}>{l.itemName}</span>
                <span className="shrink-0 text-muted-foreground">× {l.quantity} · {l.prepDays} {l.prepDays === 1 ? 'day' : 'days'} prep</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {confirming ? (
          <>
            <span className="text-xs text-muted-foreground">Ingredient stock will be deducted once.</span>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={busy || !allChecked} onClick={async () => { setBusy(true); await task.mark(); setBusy(false); setConfirming(false); }}>{busy ? 'Saving...' : 'Yes, mark prepared'}</Button>
          </>
        ) : (
          <>
            {!allChecked && <span className="text-xs text-muted-foreground">Tick every dish to finish this order.</span>}
            <Button type="button" size="sm" disabled={!allChecked} onClick={() => setConfirming(true)}><PackageCheck data-icon="inline-start" />Mark as prepared</Button>
          </>
        )}
      </div>
    </li>
  );
}
