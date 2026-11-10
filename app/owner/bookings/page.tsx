'use client';

import { useEffect, useMemo, useState } from 'react';

type BookingSection = 'catering' | 'meal_prep' | 'archived';

import { Paged } from '@/components/owner/Pagination';
import { DashboardLayout } from '@/app/dashboard-layout';
import { getCustomersByIds } from '@/app/actions/auth';
import { supabase } from '@/lib/supabase';
import {
  getOwnerBookings,
  updateBookingStatus as updateBookingStatusAction,
  updateMealPrepOrderStatus as updateMealPrepOrderStatusAction,
  updateBookingItemServings,
  archiveBooking,
  restoreBooking,
  archiveMealPrepOrder,
  restoreMealPrepOrder,
} from '@/app/actions/booking-actions';
import { computeBookingTotal } from '@/lib/rules/allocation';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import {
  ChevronDown,
  Check,
  X,
  Clock3,
  CheckCircle2,
  XCircle,
  Utensils,
  PackageCheck,
  UtensilsCrossed,
  Minus,
  Plus,
  Search,
  Users,
  Clock,
  MapPin,
  ArrowUpDown,
  Inbox,
} from 'lucide-react';
import { VenueText } from '@/components/owner/VenueText';
import { eventTypeIcon } from '@/components/booking/EventTypePicker';

type Booking = {
  BookingID: number;
  CustomerID: number | null;
  OperatorID: number | null;
  EventDate: string | null;
  EventTime: string | null;
  OrderType: 'catering' | 'meal_prep' | null;
  Venue: string | null;
  GuestCount: number;
  Status: string | null;
  AllergenConflictFlag: boolean | null;
  IsArchived?: boolean | null;
  ArchivedAt?: string | null;
  DeliveryFee?: number | null;
  EventType?: string | null;
};

type MealPrepOrder = {
  MealPrepOrderID: number;
  CustomerID: number | null;
  OperatorID: number | null;
  RecurrencePattern: string | null;
  MealsPerCycle: number | null;
  Status: string | null;
};

type Customer = {
  CustomerID: number;
  Name: string;
  Email: string;
  Contact: string | null;
};

type BookingItem = {
  BookingItemID: number;
  BookingID: number;
  MenuItemID: number;
  Quantity: number;
  UnitPrice: number | null;
};

type MealPrepItem = {
  MealPrepItemID: number;
  MealPrepOrderID: number;
  MenuItemID: number;
  Quantity: number;
  UnitPrice: number | null;
};

type MenuItem = {
  MenuItemID: number;
  ItemName: string;
  Price: number | null;
};

type BookingDisplay = Booking & {
  mealPrepOrderId?: number;
  customer: Customer | null;
  items: {
    bookingItemId?: number;
    name: string;
    quantity: number;
    price: number | null;
  }[];
};

const OPERATOR_ID = 2;

/** "18:00:00" -> "6:00 PM". Anything that is not a clock time is shown as it is. */
function formatTime(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

const statusConfig: Record<
  string,
  {
    label: string;
    className: string;
    icon: typeof Clock3;
  }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800',
    icon: Clock3,
  },

  confirmed: {
    label: 'Confirmed',
    className: 'bg-green-100 text-green-800',
    icon: CheckCircle2,
  },

  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800',
    icon: CheckCircle2,
  },

  rejected: {
    label: 'Rejected',
    className: 'bg-red-100 text-red-800',
    icon: XCircle,
  },

  cancelled: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
    icon: XCircle,
  },

  completed: {
    label: 'Completed',
    className: 'bg-blue-100 text-blue-800',
    icon: CheckCircle2,
  },
};


type StatusFilter = 'all' | 'pending' | 'confirmed' | 'closed';

const hasPrice = (price: number | null | undefined): price is number => typeof price === 'number' && Number.isFinite(price);
const peso = (value: number) => `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

function statusGroup(status: string | null | undefined): Exclude<StatusFilter, 'all'> {
  const value = status?.toLowerCase() ?? 'pending';
  if (value === 'pending') return 'pending';
  if (value === 'confirmed' || value === 'active') return 'confirmed';
  return 'closed';
}

/** Food, delivery fee and total for one booking. Null when a historical price is missing. */
function bookingTotals(booking: BookingDisplay, draft: Record<number, number>) {
  const deliveryFee = booking.OrderType === 'catering' ? Number(booking.DeliveryFee ?? 0) : 0;
  const missingPrice = booking.items.some((item) => !hasPrice(item.price));
  const foodCost = missingPrice
    ? null
    : booking.OrderType === 'catering'
      ? computeBookingTotal(
          booking.items.map((item) => ({ menuItemId: item.bookingItemId ?? 0, quantity: Number(draft[item.bookingItemId ?? 0] ?? item.quantity) })),
          new Map(booking.items.map((item) => [item.bookingItemId ?? 0, item.price!])),
        )
      : booking.items.reduce((total, item) => total + item.price! * item.quantity, 0);
  return { deliveryFee, foodCost, total: foodCost === null ? null : foodCost + deliveryFee };
}

/** The date at the left of each row: the one thing the owner sorts by. */
function DateLeaf({ date, past }: { date: string | null | undefined; past: boolean }) {
  if (!date) return null;
  const d = new Date(`${date}T12:00:00`);
  return (
    <span className={`flex size-14 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border bg-white text-center ${past ? 'border-[#E8D8C4] opacity-60' : 'border-[#E8D8C4]'}`}>
      <span className="w-full bg-[#C8431B] py-0.5 text-[10px] font-semibold leading-none text-white">{d.toLocaleDateString('en-PH', { month: 'short' })}</span>
      <span className="font-heading text-xl font-bold leading-tight text-[#2B1D16] tabular-nums">{d.getDate()}</span>
      <span className="pb-0.5 text-[10px] leading-none text-muted-foreground">{d.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
    </span>
  );
}


/** Styled replacement for the browser's native select. */
function SortMenu({ value, onChange }: { value: 'soonest' | 'latest'; onChange: (next: 'soonest' | 'latest') => void }) {
  const [open, setOpen] = useState(false);
  const options = [
    { key: 'soonest' as const, label: 'Soonest first' },
    { key: 'latest' as const, label: 'Latest first' },
  ];
  const current = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('[data-sort-menu]')) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick); };
  }, [open]);

  return (
    <div className="relative" data-sort-menu>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white pl-4 pr-3 text-sm font-medium text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"
      >
        <ArrowUpDown className="size-4 text-[#C8431B]" aria-hidden="true" />
        {current.label}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Sort bookings" className="owner-list-page absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-xl border border-[#E8D8C4] bg-white p-1 shadow-lg">
          {options.map((option) => {
            const selected = option.key === value;
            return (
              <li key={option.key} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => { onChange(option.key); setOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f1f1f2] ${selected ? 'font-semibold text-[#C8431B]' : 'text-[#2B1D16]'}`}
                >
                  {option.label}
                  {selected && <Check className="size-4" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<BookingDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [activeSection, setActiveSection] =
    useState<BookingSection>('catering');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [servingDrafts, setServingDrafts] = useState<Record<number, Record<number, number>>>({});
  const [savingServings, setSavingServings] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOrder, setSortOrder] = useState<'soonest' | 'latest'>('soonest');

  // ============================================================
  // LOAD BOOKINGS
  // ============================================================

  const loadBookings = async () => {
    setLoading(true);
    setLoadError(null);

    try {
      const bookingResult = await getOwnerBookings();

      if (!bookingResult.ok) {
        console.error('BOOKING FETCH ERROR:', bookingResult.error);
        setBookings([]);
        return;
      }

      const bookingData = bookingResult.bookings;
      const bookingItemData = bookingResult.bookingItems;
      const mealPrepOrderData = bookingResult.mealPrepOrders;
      const mealPrepItemData = bookingResult.mealPrepItems;

      if (bookingData.length === 0 && mealPrepOrderData.length === 0) {
        setBookings([]);
        return;
      }

      // ============================================================
      // GET CUSTOMER IDS
      // ============================================================

      const customerIds = Array.from(
        new Set(
          [
            ...(bookingData ?? []).map(
              (booking) => booking.CustomerID
            ),
            ...(mealPrepOrderData ?? []).map(
              (order) => order.CustomerID
            ),
          ].filter(
            (id): id is number => id !== null
          )
        )
      );

      // ============================================================
      // GET CUSTOMERS
      // ============================================================

      let customers: Customer[] = [];

      if (customerIds.length > 0) {
        const customerResult = await getCustomersByIds(customerIds);
        if (!customerResult.ok) {
          console.error('CUSTOMER FETCH ERROR:', customerResult.error);
        } else {
          customers = customerResult.customers as Customer[];
        }
      }

      // ============================================================
      // GET CATERING BOOKING ITEMS
      // ============================================================

      const bookingItems = bookingItemData;

      // ============================================================
      // GET ALL MENU ITEMS
      //
      // We combine MenuItemIDs from both:
      // - BOOKING_ITEM
      // - MEAL_PREP_ITEM
      // ============================================================

      const menuItemIds = Array.from(
        new Set([
          ...bookingItems.map(
            (item) => item.MenuItemID
          ),
          ...mealPrepItemData.map(
            (item) => item.MenuItemID
          ),
        ])
      );

      let menuItems: MenuItem[] = [];

      if (menuItemIds.length > 0) {
        const {
          data: menuItemData,
          error: menuItemError,
        } = await supabase
          .from('MENU_ITEM')
          .select(
            'MenuItemID, ItemName, Price'
          )
          .in('MenuItemID', menuItemIds);

        if (menuItemError) {
          console.error(
            'MENU_ITEM FETCH ERROR:',
            menuItemError
          );
        } else {
          menuItems =
            (menuItemData ?? []) as MenuItem[];
        }
      }

      // ============================================================
      // COMBINE CATERING BOOKINGS
      // ============================================================

      const combinedBookings: BookingDisplay[] = [
        ...(bookingData ?? []).map((booking) => {
          const customer = customers.find((item) => item.CustomerID === booking.CustomerID) ?? null;
          const items = bookingItems
            .filter((item) => item.BookingID === booking.BookingID)
            .map((bookingItem) => {
              const menuItem = menuItems.find((item) => item.MenuItemID === bookingItem.MenuItemID);
              return {
                bookingItemId: bookingItem.BookingItemID,
                name: menuItem?.ItemName ?? `Menu Item #${bookingItem.MenuItemID}`,
                quantity: bookingItem.Quantity,
                price:
                  bookingItem.UnitPrice === null
                    ? null
                    : Number(bookingItem.UnitPrice),
              };
            });

          return { ...booking, OrderType: 'catering' as const, customer, items };
        }),
        ...(mealPrepOrderData ?? []).map((order) => {
          const customer = customers.find((item) => item.CustomerID === order.CustomerID) ?? null;
          const items = mealPrepItemData
            .filter((item) => item.MealPrepOrderID === order.MealPrepOrderID)
            .map((mealPrepItem) => {
              const menuItem = menuItems.find((item) => item.MenuItemID === mealPrepItem.MenuItemID);
              return {
                name: menuItem?.ItemName ?? `Menu Item #${mealPrepItem.MenuItemID}`,
                quantity: mealPrepItem.Quantity,
                price:
                  mealPrepItem.UnitPrice === null
                    ? null
                    : Number(mealPrepItem.UnitPrice),
              };
            });

          return {
            BookingID: -Math.abs(order.MealPrepOrderID),
            mealPrepOrderId: order.MealPrepOrderID,
            CustomerID: order.CustomerID,
            OperatorID: order.OperatorID,
            EventDate: null,
            EventTime: order.RecurrencePattern,
            OrderType: 'meal_prep' as const,
            EventType: 'Meal Prep Subscription',
            Venue: null,
            GuestCount: order.MealsPerCycle ?? 0,
            Status: order.Status,
            AllergenConflictFlag: order.AllergenConflictFlag ?? false,
            customer,
            items,
          };
        }),
      ];

      setBookings(combinedBookings);
    } catch (error) {
      console.error(
        'Unexpected booking fetch error:',
        error
      );

      setLoadError(
        error instanceof Error
          ? error.message
          : 'Unable to load bookings.'
      );

      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD WHEN PAGE OPENS
  // ============================================================

  useEffect(() => {
    loadBookings();
  }, []);

  // ============================================================
  // UPDATE BOOKING STATUS
  // ============================================================

  const updateBookingStatus = async (
    bookingId: number,
    status: 'confirmed' | 'rejected'
  ) => {
    if (updatingId !== null) {
      return;
    }

    setUpdatingId(bookingId);

    try {
      const result = await updateBookingStatusAction(bookingId, status);

      if (!result.ok) {
        console.error('BOOKING STATUS UPDATE ERROR:', result.error);
        alert(
          `Failed to ${
            status === 'confirmed' ? 'confirm' : 'reject'
          } booking: ${result.error}`
        );
        return;
      }
  
      // Update owner page immediately
      setBookings((current) =>
        current.map((booking) =>
          booking.BookingID === bookingId
            ? {
                ...booking,
                Status: status,
              }
            : booking
        )
      );
    } catch (error) {
      console.error(
        'Unexpected booking status error:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const updateMealPrepOrderStatus = async (
    mealPrepOrderId: number,
    status: 'active' | 'rejected'
  ) => {
    if (updatingId !== null) {
      return;
    }

    const displayId = -Math.abs(mealPrepOrderId);
    setUpdatingId(displayId);

    try {
      const result = await updateMealPrepOrderStatusAction(mealPrepOrderId, status);

      if (!result.ok) {
        console.error('MEAL PREP STATUS UPDATE ERROR:', result.error);
        alert(`Failed to ${status === 'active' ? 'confirm' : 'reject'} meal-prep order: ${result.error}`);
        return;
      }

      setBookings((current) =>
        current.map((booking) =>
          booking.mealPrepOrderId === mealPrepOrderId
            ? { ...booking, Status: status }
            : booking
        )
      );
    } catch (error) {
      console.error('Unexpected meal-prep status error:', error);
      alert(error instanceof Error ? error.message : 'An unexpected error occurred.');
    } finally {
      setUpdatingId(null);
    }
  };

  const archiveItem = async (booking: BookingDisplay, archived: boolean) => {
    if (!archived && !window.confirm('Restore this order?')) return;
    if (archived && !window.confirm('Archive this booking? You can restore it from the Archived filter.')) return;
    setUpdatingId(booking.BookingID);
    const result = booking.OrderType === 'meal_prep'
      ? (archived ? await archiveMealPrepOrder(booking.mealPrepOrderId!) : await restoreMealPrepOrder(booking.mealPrepOrderId!))
      : (archived ? await archiveBooking(booking.BookingID) : await restoreBooking(booking.BookingID));
    if (!result.ok) alert(result.error);
    else setBookings((current) => current.map((item) => item.BookingID === booking.BookingID ? { ...item, IsArchived: archived } : item));
    setUpdatingId(null);
  };

  const saveBookingServings = async (booking: BookingDisplay) => {
    if (booking.OrderType === 'meal_prep') return;
    const draft = servingDrafts[booking.BookingID] ?? Object.fromEntries(booking.items.flatMap((item) => item.bookingItemId ? [[item.bookingItemId, item.quantity]] : []));
    setSavingServings(booking.BookingID);
    const result = await updateBookingItemServings(booking.BookingID, Object.entries(draft).map(([bookingItemId, servings]) => ({ bookingItemId: Number(bookingItemId), servings: Number(servings) })));
    if (!result.ok) alert(result.error);
    else setBookings((current) => current.map((item) => item.BookingID === booking.BookingID ? { ...item, items: item.items.map((dish) => dish.bookingItemId ? { ...dish, quantity: Number(draft[dish.bookingItemId] ?? dish.quantity) } : dish) } : item));
    setSavingServings(null);
  };

  // ============================================================
  // LISTS
  // ============================================================

  const today = manilaToday();
  const archivedBookings = bookings.filter((booking) => booking.IsArchived);
  const liveBookings = bookings.filter((booking) => !booking.IsArchived);
  const sectionBookings: Record<BookingSection, BookingDisplay[]> = {
    catering: liveBookings.filter((booking) => booking.OrderType !== 'meal_prep'),
    meal_prep: liveBookings.filter((booking) => booking.OrderType === 'meal_prep'),
    archived: archivedBookings,
  };
  const sectionLabels: Record<BookingSection, string> = { catering: 'Catering events', meal_prep: 'Meal prep orders', archived: 'Archived' };

  const needle = query.trim().toLowerCase();
  const inSection = sectionBookings[activeSection];
  const searched = inSection.filter((booking) => {
    if (!needle) return true;
    return [booking.customer?.Name, booking.EventType, `#${Math.abs(booking.BookingID)}`, booking.Venue].some((field) => field?.toLowerCase().includes(needle));
  });
  const chipCounts = {
    all: searched.length,
    pending: searched.filter((b) => statusGroup(b.Status) === 'pending').length,
    confirmed: searched.filter((b) => statusGroup(b.Status) === 'confirmed').length,
    closed: searched.filter((b) => statusGroup(b.Status) === 'closed').length,
  };
  const shown = useMemo(() => {
    const direction = sortOrder === 'soonest' ? 1 : -1;
    return searched
      .filter((b) => statusFilter === 'all' || statusGroup(b.Status) === statusFilter)
      .sort((a, b) => {
        const pendingFirst = Number(statusGroup(b.Status) === 'pending') - Number(statusGroup(a.Status) === 'pending');
        if (pendingFirst !== 0 && activeSection !== 'archived') return pendingFirst;
        return direction * (a.EventDate ?? '9999-12-31').localeCompare(b.EventDate ?? '9999-12-31');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, activeSection, needle, statusFilter, sortOrder]);

  const pendingAll = liveBookings.filter((b) => statusGroup(b.Status) === 'pending');
  const nextEvent = liveBookings
    .filter((b) => statusGroup(b.Status) === 'confirmed' && b.EventDate && b.EventDate >= today)
    .sort((a, b) => a.EventDate!.localeCompare(b.EventDate!))[0];

  // ============================================================
  // ONE BOOKING ROW + ITS ORDER SLIP
  // ============================================================

  const renderBooking = (booking: BookingDisplay) => {
    const statusKey = booking.Status?.toLowerCase() ?? 'pending';
    const status = statusConfig[statusKey] ?? statusConfig.pending;
    const StatusIcon = status.icon;
    const isMeal = booking.OrderType === 'meal_prep';
    const isPending = statusKey === 'pending';
    const open = expandedId === booking.BookingID;
    const EventIcon = eventTypeIcon(booking.EventType);
    const TypeIcon = isMeal ? UtensilsCrossed : EventIcon;
    const title = isMeal ? 'Meal prep subscription' : booking.EventType?.trim() || 'Event type not set';
    const draft = !isMeal ? (servingDrafts[booking.BookingID] ?? {}) : {};
    const hasUnsavedServingEdits = !isMeal && booking.items.some((item) => item.bookingItemId !== undefined && draft[item.bookingItemId] !== undefined && Number(draft[item.bookingItemId]) !== Number(item.quantity));
    const { deliveryFee, foodCost, total } = bookingTotals(booking, draft);
    const busy = updatingId === booking.BookingID;
    const past = Boolean(booking.EventDate && booking.EventDate < today);
    const canArchive = ['rejected', 'cancelled', 'prepared', 'completed'].includes(statusKey) || (statusKey === 'confirmed' && past);
    const servings = booking.items.reduce((sum, item) => sum + Number(draft[item.bookingItemId ?? 0] ?? item.quantity), 0);

    return (
      <article key={booking.BookingID} className={`overflow-hidden rounded-2xl border bg-white transition-shadow ${open ? 'border-[#C8431B]/40 shadow-sm' : 'border-[#E8D8C4]'} ${isPending ? 'border-l-4 border-l-[#C8431B]' : ''}`}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setExpandedId(open ? null : booking.BookingID)}
          className="relative flex w-full flex-wrap items-center gap-x-4 gap-y-3 p-4 pr-10 text-left transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8431B] sm:flex-nowrap sm:pr-4"
        >
          <DateLeaf date={booking.EventDate} past={past && statusKey !== 'pending'} />
          <div className="min-w-[11rem] flex-1 sm:min-w-0">
            <div className="flex items-center gap-2">
              <TypeIcon className="size-4 shrink-0 text-[#C8431B]" aria-hidden="true" />
              <p className="truncate font-heading text-lg font-bold uppercase leading-tight tracking-tight text-card-foreground">{title}</p>
            </div>
            <p className="mt-0.5 truncate text-sm font-medium text-[#2B1D16]">{booking.customer?.Name ?? 'Unknown customer'}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden="true" />{booking.GuestCount} {isMeal ? 'servings' : 'guests'}</span>
              {!isMeal && booking.EventTime && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" />{formatTime(booking.EventTime)}</span>}
              {!isMeal && booking.Venue && <span className="inline-flex min-w-0 max-w-[16rem] items-center gap-1"><MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{booking.Venue.replace(/\s*\[pin:[^\]]*\]?/i, '').trim()}</span></span>}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-row-reverse items-center justify-between gap-1.5 sm:ml-auto sm:w-auto sm:flex-col sm:items-end sm:justify-start">
            <span className="text-base font-bold tabular-nums text-[#2B1D16]">{total === null ? 'Price missing' : peso(total)}</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {booking.AllergenConflictFlag === true && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Allergen warning</span>}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}><StatusIcon className="size-3" aria-hidden="true" />{status.label}</span>
            </div>
          </div>
          <ChevronDown className={`absolute right-3 top-5 size-5 shrink-0 text-muted-foreground transition-transform duration-200 sm:static ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {open && (
          <div className="owner-list-page border-t border-dashed border-[#E8D8C4] bg-[#FBF6EE] p-4 sm:p-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
              {/* WHO AND WHERE */}
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-semibold text-card-foreground">{booking.customer?.Name ?? 'Unknown customer'}</p>
                  {booking.customer?.Email && <p className="break-all text-muted-foreground">{booking.customer.Email}</p>}
                  {booking.customer?.Contact && <p className="text-muted-foreground">{booking.customer.Contact}</p>}
                </div>
                <div>
                  <p className="text-muted-foreground">{isMeal ? 'Delivery address' : 'Venue'}</p>
                  <div className="font-semibold text-card-foreground"><VenueText value={booking.Venue} /></div>
                </div>
                <div>
                  <p className="text-muted-foreground">When</p>
                  <p className="font-semibold text-card-foreground">
                    {booking.EventDate ? new Date(`${booking.EventDate}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'Recurring order'}
                  </p>
                  {!isMeal && <p className="text-muted-foreground">{formatTime(booking.EventTime)}</p>}
                </div>
                <p className="text-xs text-muted-foreground">{isMeal ? 'Order' : 'Booking'} #{Math.abs(booking.BookingID)}</p>
              </div>

              {/* ORDER SLIP */}
              <div className="min-w-0 rounded-xl border border-[#E8D8C4] bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-heading text-base font-bold text-card-foreground">Order slip</h3>
                  <span className="text-xs font-medium text-muted-foreground">{booking.items.length} {booking.items.length === 1 ? 'dish' : 'dishes'}, {servings} servings{!isMeal ? ` for ${booking.GuestCount} guests` : ''}</span>
                </div>

                {booking.items.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[#E8D8C4] p-4 text-sm text-muted-foreground">No menu items recorded for this order.</p>
                ) : (
                  <ul className="space-y-3">
                    {booking.items.map((item, index) => {
                      const editable = !isMeal && isPending && item.bookingItemId !== undefined;
                      const quantity = Number(draft[item.bookingItemId ?? 0] ?? item.quantity);
                      const changed = editable && quantity !== Number(item.quantity);
                      const setQuantity = (value: number) => {
                        const next = Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
                        setServingDrafts((current) => ({ ...current, [booking.BookingID]: { ...(current[booking.BookingID] ?? {}), [item.bookingItemId ?? 0]: next } }));
                      };
                      const tooMany = !isMeal && quantity > booking.GuestCount;
                      return (
                        <li key={`${booking.BookingID}-${item.name}-${index}`} className={`rounded-lg ${changed ? 'bg-[#FBF6EE] ring-1 ring-[#C8431B]/40' : ''}`}>
                          <div className="flex items-end gap-2">
                            <span className="font-semibold text-card-foreground">{item.name}</span>
                            <span aria-hidden="true" className="mb-1 min-w-4 flex-1 border-b-2 border-dotted border-[#E8D8C4]" />
                            <span className="font-semibold tabular-nums text-card-foreground">{hasPrice(item.price) ? peso(item.price * quantity) : 'Price missing'}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{hasPrice(item.price) ? `${peso(item.price)} per serving` : 'Price unavailable'}</span>
                            {editable ? (
                              <div className="inline-flex items-center overflow-hidden rounded-lg border border-border bg-card" role="group" aria-label={`${item.name} servings`}>
                                <button type="button" aria-label={`Decrease ${item.name} servings`} onClick={() => setQuantity(quantity - 1)} disabled={quantity <= 1} className="flex size-8 items-center justify-center text-[#C8431B] transition-colors hover:bg-[#F6E3D3] disabled:cursor-not-allowed disabled:opacity-30"><Minus className="size-4" /></button>
                                <input aria-label={`${item.name} servings`} type="number" inputMode="numeric" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="h-8 w-14 border-x border-border bg-card text-center text-sm font-semibold text-card-foreground [appearance:textfield] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8431B] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                <button type="button" aria-label={`Increase ${item.name} servings`} onClick={() => setQuantity(quantity + 1)} className="flex size-8 items-center justify-center text-[#C8431B] transition-colors hover:bg-[#F6E3D3]"><Plus className="size-4" /></button>
                              </div>
                            ) : (
                              <span className="font-medium text-card-foreground">{quantity} {quantity === 1 ? 'serving' : 'servings'}</span>
                            )}
                          </div>
                          {tooMany && <p className="mt-1 text-xs font-medium text-amber-700">More servings than guests ({booking.GuestCount})</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {hasUnsavedServingEdits && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#F6E3D3] px-4 py-3">
                    <p className="flex-1 text-sm font-medium text-[#C8431B]">You have unsaved serving changes.</p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setServingDrafts((current) => { const next = { ...current }; delete next[booking.BookingID]; return next; })} disabled={savingServings === booking.BookingID}>Reset</Button>
                    <Button type="button" size="sm" onClick={() => saveBookingServings(booking)} disabled={savingServings === booking.BookingID}>{savingServings === booking.BookingID ? 'Saving...' : 'Save servings'}</Button>
                  </div>
                )}

                <div className="mt-4 space-y-1 border-t-2 border-dotted border-[#E8D8C4] pt-3 text-sm">
                  {deliveryFee > 0 && foodCost !== null && (
                    <>
                      <div className="flex justify-between text-muted-foreground"><span>Food</span><span className="tabular-nums">{peso(foodCost)}</span></div>
                      <div className="flex justify-between text-muted-foreground"><span>Delivery fee</span><span className="tabular-nums">{peso(deliveryFee)}</span></div>
                    </>
                  )}
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="font-semibold text-card-foreground">Estimated total</span>
                    <span className="font-heading text-2xl font-bold tabular-nums text-[#C8431B]">{total === null ? <span className="text-sm font-semibold text-muted-foreground">Price missing</span> : peso(total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* DECISION */}
            <div className="mt-5 flex flex-wrap items-start gap-3">
              {booking.IsArchived ? (
                <Button type="button" variant="outline" onClick={() => archiveItem(booking, false)} disabled={busy}>{busy ? 'Restoring...' : 'Restore'}</Button>
              ) : isPending ? (
                <>
                  <div>
                    <Button
                      onClick={() => (isMeal ? updateMealPrepOrderStatus(booking.mealPrepOrderId!, 'active') : updateBookingStatus(booking.BookingID, 'confirmed'))}
                      disabled={busy || hasUnsavedServingEdits}
                      className="min-w-44 gap-2 bg-green-600 text-white hover:bg-green-700"
                    >
                      <Check className="size-4" />
                      {busy ? 'Updating...' : isMeal ? 'Confirm order' : 'Confirm booking'}
                    </Button>
                    {hasUnsavedServingEdits && <p className="mt-1 text-xs text-muted-foreground">Save servings before confirming</p>}
                  </div>
                  <Button
                    onClick={() => (isMeal ? updateMealPrepOrderStatus(booking.mealPrepOrderId!, 'rejected') : updateBookingStatus(booking.BookingID, 'rejected'))}
                    disabled={busy}
                    variant="outline"
                    className="gap-2"
                  >
                    <X className="size-4" />
                    {busy ? 'Updating...' : 'Reject'}
                  </Button>
                </>
              ) : canArchive ? (
                <Button type="button" variant="outline" onClick={() => archiveItem(booking, true)} disabled={busy}>{busy ? 'Archiving...' : 'Archive'}</Button>
              ) : null}
            </div>
          </div>
        )}
      </article>
    );
  };

  // ============================================================
  // PAGE
  // ============================================================

  const tabs: { key: BookingSection; icon: typeof Utensils }[] = [
    { key: 'catering', icon: Utensils },
    { key: 'meal_prep', icon: PackageCheck },
    { key: 'archived', icon: Inbox },
  ];
  const chips: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'closed', label: 'Closed' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Bookings</h1>
          <p className="mt-2 text-surface-muted-foreground">Review requests, confirm events and keep track of orders</p>
        </div>

        {!loading && !loadError && bookings.length > 0 && (
          pendingAll.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#C8431B]/30 bg-[#F6E3D3] px-5 py-4">
              <p className="text-sm font-medium text-[#C8431B]">
                <span className="font-heading text-lg font-bold">{pendingAll.length}</span> {pendingAll.length === 1 ? 'request is' : 'requests are'} waiting for your decision.
                {nextEvent?.EventDate && <span className="text-[#C8431B]/80"> Next confirmed event is on {new Date(`${nextEvent.EventDate}T12:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric' })}.</span>}
              </p>
              <Button type="button" size="sm" onClick={() => { setActiveSection(pendingAll.some((b) => b.OrderType !== 'meal_prep') ? 'catering' : 'meal_prep'); setStatusFilter('pending'); setQuery(''); }}>Show pending</Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#E8D8C4] bg-white px-5 py-4 text-sm text-muted-foreground">
              <span className="font-semibold text-[#2B1D16]">You are all caught up.</span>
              {nextEvent?.EventDate ? ` Next confirmed event is on ${new Date(`${nextEvent.EventDate}T12:00:00`).toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}.` : ' No upcoming confirmed events.'}
            </div>
          )
        )}

        <div className="flex flex-wrap gap-1 border-b border-[#E8D8C4]" role="tablist" aria-label="Booking type">
          {tabs.map((tab) => {
            const active = activeSection === tab.key;
            const pending = sectionBookings[tab.key].filter((b) => statusGroup(b.Status) === 'pending').length;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setActiveSection(tab.key); setStatusFilter('all'); }}
                className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${active ? 'border-[#C8431B] text-[#C8431B]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'}`}
              >
                <tab.icon className="size-4" aria-hidden="true" />
                {sectionLabels[tab.key]}
                <span className="rounded-full bg-[#F6E3D3] px-2 py-0.5 text-xs text-[#C8431B]">{sectionBookings[tab.key].length}</span>
                {pending > 0 && tab.key !== 'archived' && <span className="size-2 rounded-full bg-[#C8431B]" title={`${pending} pending`} aria-label={`${pending} pending`} />}
              </button>
            );
          })}
        </div>

        {loading ? (
          <Card className="p-12 text-center"><p className="text-muted-foreground">Loading bookings...</p></Card>
        ) : loadError ? (
          <Card className="p-12 text-center">
            <p className="font-medium text-destructive">Unable to load bookings</p>
            <p className="mt-2 text-sm text-muted-foreground">{loadError}</p>
          </Card>
        ) : bookings.length === 0 ? (
          <Card className="p-12 text-center">
            <Inbox className="mx-auto mb-3 size-10 text-muted-foreground opacity-50" aria-hidden="true" />
            <p className="font-medium text-[#2B1D16]">No bookings yet</p>
            <p className="mt-1 text-sm text-muted-foreground">New catering requests and meal prep orders will show up here.</p>
          </Card>
        ) : (
          <section aria-label={sectionLabels[activeSection]} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
                {chips.map((chip) => (
                  <button key={chip.key} type="button" aria-pressed={statusFilter === chip.key} onClick={() => setStatusFilter(chip.key)} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${statusFilter === chip.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#F6E3D3]'}`}>
                    {chip.label} <span className="opacity-70">{chipCounts[chip.key]}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="relative">
                  <span className="sr-only">Search bookings</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer or event" className="h-9 w-64 rounded-full border border-[#E8D8C4] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20" />
                </label>
                <SortMenu value={sortOrder} onChange={setSortOrder} />
              </div>
            </div>

            {shown.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="font-medium text-[#2B1D16]">
                  {needle ? `No bookings match "${query}"` : inSection.length === 0 ? `No ${activeSection === 'meal_prep' ? 'meal prep orders' : activeSection === 'archived' ? 'archived bookings' : 'catering events'} yet` : 'Nothing in this view'}
                </p>
                {(needle || statusFilter !== 'all') && inSection.length > 0 && (
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setQuery(''); setStatusFilter('all'); }}>Clear filters</Button>
                )}
              </Card>
            ) : (
              <div>
                <Paged items={shown} pageSize={8} label={activeSection === 'meal_prep' ? 'meal prep orders' : 'bookings'}>
                  {(booking) => renderBooking(booking)}
                </Paged>
              </div>
            )}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
