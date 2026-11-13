'use client';

import { DashboardLayout } from '@/app/dashboard-layout';
import { getOwnerFinancialData, recordOwnerPayment } from '@/app/actions/booking-actions';
import type { PaymentType, Invoice, Payment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileDown,
  HandCoins,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { printInvoicePdf } from '@/lib/pdf/invoicePdf';

type BookingRow = { BookingID: number; CustomerID: number; OperatorID: number; EventDate: string; EventTime: string; Venue: string; GuestCount: number; Status: string };
type CustomerRow = { CustomerID: number; Name: string; Email: string };
type BookingItemRow = { BookingItemID: number; BookingID: number; MenuItemID: number; Quantity: number };
type MenuItemRow = { MenuItemID: number; ItemName: string; Price: number };
type InvoiceRow = { InvoiceID: number; BookingID: number; TotalAmount: number; DateGenerated: string };
type PaymentRow = { PaymentID: number; InvoiceID: number; Amount: number; PaymentType: string; Status: string; DatePaid: string };

type FinancialBooking = {
  id: string;
  customerName: string;
  customerEmail: string;
  eventDate: string;
  venue: string;
  guestCount: number;
  status: string;
  totalCost: number;
  paymentsReceived: number;
  hasInvoice: boolean;
};

type Tab = 'balances' | 'history';
type Filter = 'all' | 'owing' | 'paid';
type SortKey = 'owed' | 'event' | 'name';
type RangeKey = 'month' | '30' | 'year' | 'all' | 'custom';

const PAGE_SIZE = 8;
const TYPE_LABEL: Record<PaymentType, string> = { down_payment: 'Down payment', partial: 'Partial payment', full_payment: 'Full payment' };

const peso = (value: number) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const manilaDay = (value: string | Date) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const niceDate = (value: string) => {
  if (!value) return 'No date';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+08:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'No date';
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
};
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const typeLabel = (type: string) => TYPE_LABEL[type as PaymentType] ?? type.replace(/_/g, ' ');

function rangeFor(key: Exclude<RangeKey, 'custom'>): { start: string; end: string } {
  const today = manilaDay(new Date());
  if (key === 'month') return { start: `${today.slice(0, 8)}01`, end: today };
  if (key === '30') return { start: addDays(today, -29), end: today };
  if (key === 'year') return { start: `${today.slice(0, 4)}-01-01`, end: today };
  return { start: '1970-01-01', end: today };
}

function SortMenu({ value, onChange }: { value: SortKey; onChange: (next: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const options: { key: SortKey; label: string }[] = [
    { key: 'owed', label: 'Most owed first' },
    { key: 'event', label: 'Latest event first' },
    { key: 'name', label: 'Customer A to Z' },
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
      <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="inline-flex h-9 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white pl-4 pr-3 text-sm font-medium text-[#2B1D16] transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
        <ArrowUpDown className="size-4 text-[#C8431B]" aria-hidden="true" />
        {current.label}
        <ChevronDown className={`size-4 text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-label="Sort balances" className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-[#E8D8C4] bg-white p-1 shadow-lg">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={o.key === value}>
              <button type="button" onClick={() => { onChange(o.key); setOpen(false); }} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[#f1f1f2] ${o.key === value ? 'font-semibold text-[#C8431B]' : 'text-[#2B1D16]'}`}>
                {o.label}
                {o.key === value && <Check className="size-4" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pager({ page, pageCount, total, onChange, label }: { page: number; pageCount: number; total: number; onChange: (p: number) => void; label: string }) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  return (
    <nav aria-label={`${label} pages`} className="flex items-center justify-between gap-3 pt-2 text-sm text-muted-foreground">
      <span>{from}–{to} of {total} {label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page" className="inline-flex size-9 items-center justify-center rounded-full border border-[#E8D8C4] bg-white transition-colors hover:bg-[#f1f1f2] disabled:opacity-40 disabled:hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><ChevronLeft className="size-4" /></button>
        <span className="tabular-nums text-[#2B1D16]">{page} / {pageCount}</span>
        <button type="button" onClick={() => onChange(page + 1)} disabled={page >= pageCount} aria-label="Next page" className="inline-flex size-9 items-center justify-center rounded-full border border-[#E8D8C4] bg-white transition-colors hover:bg-[#f1f1f2] disabled:opacity-40 disabled:hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><ChevronRight className="size-4" /></button>
      </div>
    </nav>
  );
}

export default function PaymentsPage() {
  const [bookings, setBookings] = useState<FinancialBooking[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [tab, setTab] = useState<Tab>('balances');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('owed');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [periodStart, setPeriodStart] = useState(() => rangeFor('month').start);
  const [periodEnd, setPeriodEnd] = useState(() => rangeFor('month').end);

  const [paymentForm, setPaymentForm] = useState<{ bookingId: string; invoiceId: number; amount: string; type: PaymentType } | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadFinancialData = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    setError('');
    try {
      const result = await getOwnerFinancialData();
      if (!result.ok) throw new Error(result.error);

      const typedBookings = result.bookings as BookingRow[];
      const typedCustomers = result.customers as CustomerRow[];
      const typedBookingItems = result.bookingItems as BookingItemRow[];
      const typedMenuItems = result.menuItems as MenuItemRow[];

      // Only this owner's bookings count; the invoice and payment queries are not filtered by owner.
      const ownBookingIds = new Set(typedBookings.map((b) => b.BookingID));
      const typedInvoices = (result.invoices as InvoiceRow[]).filter((i) => ownBookingIds.has(i.BookingID));
      const invoiceIds = new Set(typedInvoices.map((i) => i.InvoiceID));
      const typedPayments = (result.payments as PaymentRow[]).filter((p) => invoiceIds.has(p.InvoiceID));

      const mappedPayments: Payment[] = typedPayments.map((payment) => {
        const invoice = typedInvoices.find((item) => item.InvoiceID === payment.InvoiceID);
        return {
          id: String(payment.PaymentID),
          bookingId: invoice ? String(invoice.BookingID) : '',
          amount: Number(payment.Amount),
          date: payment.DatePaid,
          type: payment.PaymentType as PaymentType,
        };
      });

      const paidByBooking = new Map<string, number>();
      for (const payment of mappedPayments) {
        if (!payment.bookingId) continue;
        paidByBooking.set(payment.bookingId, (paidByBooking.get(payment.bookingId) ?? 0) + payment.amount);
      }

      const mappedBookings: FinancialBooking[] = typedBookings.map((booking) => {
        const customer = typedCustomers.find((item) => item.CustomerID === booking.CustomerID);
        const invoice = typedInvoices.find((item) => item.BookingID === booking.BookingID);
        return {
          id: String(booking.BookingID),
          customerName: customer?.Name ?? 'Unknown customer',
          customerEmail: customer?.Email ?? '',
          eventDate: booking.EventDate,
          venue: booking.Venue,
          guestCount: Number(booking.GuestCount),
          status: booking.Status,
          totalCost: invoice ? Number(invoice.TotalAmount) : 0,
          paymentsReceived: paidByBooking.get(String(booking.BookingID)) ?? 0,
          hasInvoice: Boolean(invoice),
        };
      });

      const mappedInvoices: Invoice[] = typedInvoices.map((invoice) => {
        const booking = typedBookings.find((item) => item.BookingID === invoice.BookingID);
        const customer = booking ? typedCustomers.find((item) => item.CustomerID === booking.CustomerID) : undefined;
        const lineItems = typedBookingItems
          .filter((item) => item.BookingID === invoice.BookingID)
          .map((bookingItem) => {
            const menuItem = typedMenuItems.find((item) => item.MenuItemID === bookingItem.MenuItemID);
            // Use the price saved on the booking, never today's menu price.
            const unitPrice = Number((bookingItem as { UnitPrice?: number | null }).UnitPrice ?? menuItem?.Price ?? 0);
            const quantity = Number(bookingItem.Quantity);
            return { name: menuItem?.ItemName ?? 'Unknown menu item', unitPrice, quantity, total: unitPrice * quantity };
          });
        const paymentsMade = paidByBooking.get(String(invoice.BookingID)) ?? 0;
        return {
          id: String(invoice.InvoiceID),
          bookingId: String(invoice.BookingID),
          generatedAt: invoice.DateGenerated,
          customerName: customer?.Name ?? 'Unknown customer',
          customerEmail: customer?.Email ?? '',
          eventDate: booking?.EventDate ?? '',
          eventType: 'Catering Event',
          lineItems,
          guestCount: Number(booking?.GuestCount ?? 0),
          subtotal: Number(invoice.TotalAmount),
          totalDue: Number(invoice.TotalAmount),
          paymentsMade,
          balanceDue: Number(invoice.TotalAmount) - paymentsMade,
        };
      });

      setBookings(mappedBookings);
      setPayments(mappedPayments);
      setInvoices(mappedInvoices);
    } catch (loadError) {
      console.error('Failed to load financial data:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load financial data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadFinancialData(true); }, [loadFinancialData]);

  useEffect(() => {
    if (!paymentForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) setPaymentForm(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paymentForm, saving]);

  const owedOf = (b: FinancialBooking) => Math.max(b.totalCost - b.paymentsReceived, 0);
  const canRecord = (b: FinancialBooking) => b.status === 'confirmed' && b.hasInvoice && owedOf(b) > 0.004;

  const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalOwed = bookings.reduce((sum, b) => (b.status === 'confirmed' ? sum + owedOf(b) : sum), 0);
  const owingBookings = bookings.filter((b) => canRecord(b));

  const periodPayments = useMemo(
    () => payments.filter((p) => { const day = manilaDay(p.date); return day >= periodStart && day <= periodEnd; }),
    [payments, periodStart, periodEnd],
  );
  const periodRevenue = periodPayments.reduce((sum, p) => sum + p.amount, 0);

  const pickRange = (key: Exclude<RangeKey, 'custom'>) => {
    const r = rangeFor(key);
    setRangeKey(key); setPeriodStart(r.start); setPeriodEnd(r.end); setPage(1);
  };

  const visibleBalances = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = bookings.filter((b) => {
      if (filter === 'owing' && !canRecord(b)) return false;
      if (filter === 'paid' && !(b.hasInvoice && owedOf(b) <= 0.004)) return false;
      return !q || b.customerName.toLowerCase().includes(q) || b.venue.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.customerName.localeCompare(b.customerName);
      if (sort === 'event') return (b.eventDate || '').localeCompare(a.eventDate || '');
      return owedOf(b) - owedOf(a) || (b.eventDate || '').localeCompare(a.eventDate || '');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, filter, query, sort]);

  const visibleHistory = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...payments]
      .filter((p) => {
        const name = bookings.find((b) => b.id === p.bookingId)?.customerName ?? '';
        return !q || name.toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, bookings, query]);

  const activeList = tab === 'balances' ? visibleBalances : visibleHistory;
  const pageCount = Math.max(1, Math.ceil(activeList.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const slice = activeList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openRecord = (b: FinancialBooking) => {
    const invoice = invoices.find((i) => i.bookingId === b.id);
    if (!invoice) return;
    setFormError('');
    setPaymentForm({
      bookingId: b.id,
      invoiceId: Number(invoice.id),
      amount: owedOf(b).toFixed(2),
      type: b.paymentsReceived === 0 ? 'down_payment' : 'full_payment',
    });
  };

  const selectedBooking = paymentForm ? bookings.find((b) => b.id === paymentForm.bookingId) : null;
  const formOwed = selectedBooking ? owedOf(selectedBooking) : 0;
  const formAmount = paymentForm ? parseFloat(paymentForm.amount) || 0 : 0;
  const formAfter = Math.max(formOwed - formAmount, 0);

  const setAmount = (value: number, type?: PaymentType) => {
    setFormError('');
    setPaymentForm((f) => (f ? { ...f, amount: value.toFixed(2), type: type ?? f.type } : f));
  };

  const handleRecordPayment = async () => {
    if (!paymentForm || !selectedBooking) return;
    if (formAmount <= 0) { setFormError('Enter an amount greater than zero.'); return; }
    if (formAmount > formOwed + 0.004) { setFormError(`That is more than the ${peso(formOwed)} still owed.`); return; }
    setSaving(true);
    setFormError('');
    const result = await recordOwnerPayment({ invoiceId: paymentForm.invoiceId, amount: formAmount, type: paymentForm.type });
    setSaving(false);
    if (!result.ok) { setFormError(result.error); return; }
    setPaymentForm(null);
    await loadFinancialData();
  };

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: bookings.length },
    { key: 'owing', label: 'Owes balance', count: owingBookings.length },
    { key: 'paid', label: 'Paid in full', count: bookings.filter((b) => b.hasInvoice && owedOf(b) <= 0.004).length },
  ];
  const ranges: { key: Exclude<RangeKey, 'custom'>; label: string }[] = [
    { key: 'month', label: 'This month' },
    { key: '30', label: 'Last 30 days' },
    { key: 'year', label: 'This year' },
    { key: 'all', label: 'All time' },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Payments</h1>
            <p className="mt-1 text-muted-foreground">Who still owes you, what came in, and an invoice for every booking.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void loadFinancialData()} disabled={loading || refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8D8C4] bg-[#F6E3D3] p-4 text-sm text-[#C8431B]">
            <span>{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadFinancialData(bookings.length === 0)}>Try again</Button>
          </div>
        )}

        {loading ? (
          <div className="space-y-5" aria-busy="true" aria-label="Loading payments">
            <div className="h-20 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />
            <div className="h-28 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />)}
          </div>
        ) : (
          <>
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${owingBookings.length > 0 ? 'border-[#E8D8C4] bg-[#FBF6EE]' : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="flex items-center gap-3">
                {owingBookings.length > 0 ? <AlertTriangle className="size-5 text-[#C8431B]" aria-hidden="true" /> : <CheckCircle2 className="size-5 text-emerald-700" aria-hidden="true" />}
                <div>
                  <p className="font-semibold text-[#2B1D16]">
                    {owingBookings.length > 0
                      ? `${peso(totalOwed)} still to collect from ${owingBookings.length} booking${owingBookings.length === 1 ? '' : 's'}`
                      : 'Nothing is owed right now'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {owingBookings.length > 0 ? 'Confirmed bookings with an unpaid balance.' : 'Every confirmed booking is paid in full.'}
                  </p>
                </div>
              </div>
              {owingBookings.length > 0 && (
                <Button type="button" size="sm" onClick={() => { setTab('balances'); setFilter('owing'); setSort('owed'); setPage(1); }} className="bg-[#C8431B] text-white hover:bg-[#A93615]">Show them</Button>
              )}
            </div>

            <section aria-label="Money summary" className="rounded-2xl border border-[#E8D8C4] bg-white">
              <div className="grid grid-cols-1 divide-y divide-[#E8D8C4] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-5">
                  <p className="text-sm text-muted-foreground">Collected, all time</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-[#2B1D16]">{peso(totalCollected)}</p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-muted-foreground">Still owed</p>
                  <p className={`mt-1 text-3xl font-bold tabular-nums ${totalOwed > 0 ? 'text-[#C8431B]' : 'text-[#2B1D16]'}`}>{peso(totalOwed)}</p>
                </div>
                <div className="p-5">
                  <p className="text-sm text-muted-foreground">Collected in range</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-[#2B1D16]">{peso(periodRevenue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{periodPayments.length} payment{periodPayments.length === 1 ? '' : 's'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-[#E8D8C4] px-5 py-3">
                <span className="mr-1 text-sm text-muted-foreground">Range</span>
                {ranges.map((r) => (
                  <button key={r.key} type="button" aria-pressed={rangeKey === r.key} onClick={() => pickRange(r.key)} className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${rangeKey === r.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'}`}>{r.label}</button>
                ))}
                <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
                  <label className="sr-only" htmlFor="pay-from">From</label>
                  <input id="pay-from" type="date" value={periodStart} max={periodEnd} onChange={(e) => { setPeriodStart(e.target.value); setRangeKey('custom'); }} className="h-9 rounded-full border border-[#E8D8C4] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]" />
                  <span className="text-muted-foreground">to</span>
                  <label className="sr-only" htmlFor="pay-to">To</label>
                  <input id="pay-to" type="date" value={periodEnd} min={periodStart} onChange={(e) => { setPeriodEnd(e.target.value); setRangeKey('custom'); }} className="h-9 rounded-full border border-[#E8D8C4] bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]" />
                </div>
              </div>
            </section>

            <div role="tablist" className="flex gap-6 border-b border-[#E8D8C4]">
              {([['balances', 'Balances', bookings.length], ['history', 'Payment history', payments.length]] as const).map(([key, label, count]) => (
                <button key={key} role="tab" aria-selected={tab === key} type="button" onClick={() => { setTab(key); setPage(1); }} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${tab === key ? 'border-[#C8431B] text-[#C8431B]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'}`}>
                  {label}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${tab === key ? 'bg-[#F6E3D3] text-[#C8431B]' : 'bg-[#f1f1f2] text-muted-foreground'}`}>{count}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {tab === 'balances' && (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <button key={c.key} type="button" aria-pressed={filter === c.key} onClick={() => { setFilter(c.key); setPage(1); }} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${filter === c.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'}`}>
                      {c.label} <span className={filter === c.key ? 'text-white/80' : 'text-muted-foreground'}>{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <label className="relative">
                  <span className="sr-only">Search customers</span>
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search customer" className="h-9 w-56 rounded-full border border-[#E8D8C4] bg-white pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-[#C8431B]" />
                </label>
                {tab === 'balances' && <SortMenu value={sort} onChange={(s) => { setSort(s); setPage(1); }} />}
              </div>
            </div>

            {activeList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#E8D8C4] p-10 text-center text-sm text-muted-foreground">
                {tab === 'history' ? (payments.length === 0 ? 'No payments recorded yet.' : 'No payments match that search.') : bookings.length === 0 ? 'No bookings to collect on yet.' : 'No bookings match these filters.'}
              </div>
            ) : tab === 'balances' ? (
              <div className="space-y-3">
                {(slice as FinancialBooking[]).map((b) => {
                  const owed = owedOf(b);
                  const pct = b.totalCost > 0 ? Math.min(100, (b.paymentsReceived / b.totalCost) * 100) : 0;
                  const invoice = invoices.find((i) => i.bookingId === b.id);
                  const settled = b.hasInvoice && owed <= 0.004;
                  return (
                    <article key={b.id} className="rounded-2xl border border-border bg-white p-4 transition-shadow hover:shadow-sm sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-[#2B1D16]">{b.customerName}</h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">{niceDate(b.eventDate)}{b.venue ? `, ${b.venue.replace(/\s*\[pin:[^\]]*\]/i, '')}` : ''}</p>
                        </div>
                        {!b.hasInvoice ? (
                          <span className="shrink-0 rounded-full bg-[#f1f1f2] px-2.5 py-1 text-xs font-semibold text-muted-foreground">{b.status === 'pending' ? 'Awaiting your confirmation' : 'No invoice'}</span>
                        ) : settled ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><CheckCircle2 className="size-3" aria-hidden="true" />Paid in full</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-[#F6E3D3] px-2.5 py-1 text-xs font-semibold text-[#C8431B]">{peso(owed)} owed</span>
                        )}
                      </div>

                      {b.hasInvoice && (
                        <div className="mt-4">
                          <div className="h-1.5 overflow-hidden rounded-full bg-[#EFE1D0]" role="img" aria-label={`${Math.round(pct)}% paid`}>
                            <div className={`h-full rounded-full ${settled ? 'bg-emerald-600' : 'bg-[#C8431B]'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-1.5 text-sm text-muted-foreground">
                            <span className="font-medium tabular-nums text-[#2B1D16]">{peso(b.paymentsReceived)}</span> paid of <span className="tabular-nums">{peso(b.totalCost)}</span>
                          </p>
                        </div>
                      )}

                      {(canRecord(b) || invoice) && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {canRecord(b) && (
                            <Button type="button" size="sm" onClick={() => openRecord(b)} className="bg-[#C8431B] text-white hover:bg-[#A93615]">
                              <HandCoins className="size-4" data-icon="inline-start" aria-hidden="true" />
                              Record payment
                            </Button>
                          )}
                          {invoice && (
                            <Button type="button" size="sm" variant="outline" onClick={() => printInvoicePdf(invoice)}>
                              <FileDown className="size-4" data-icon="inline-start" aria-hidden="true" />
                              Invoice
                            </Button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                <Pager page={safePage} pageCount={pageCount} total={activeList.length} onChange={setPage} label="bookings" />
              </div>
            ) : (
              <div className="space-y-3">
                <ul className="divide-y divide-[#EFE3D3] overflow-hidden rounded-2xl border border-border bg-white">
                  {(slice as Payment[]).map((p) => {
                    const b = bookings.find((x) => x.id === p.bookingId);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-[#2B1D16]">{b?.customerName ?? `Booking ${p.bookingId}`}</p>
                          <p className="text-sm text-muted-foreground">{typeLabel(p.type)} on {niceDate(p.date)}</p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums text-emerald-700">+{peso(p.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
                <Pager page={safePage} pageCount={pageCount} total={activeList.length} onChange={setPage} label="payments" />
              </div>
            )}
          </>
        )}
      </div>

      {paymentForm && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-4" onClick={() => !saving && setPaymentForm(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="record-title" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[#E8D8C4] bg-white shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-[#E8D8C4] p-5">
              <div className="min-w-0">
                <h2 id="record-title" className="font-heading text-xl font-bold text-[#2B1D16]">Record payment</h2>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{selectedBooking.customerName}, {niceDate(selectedBooking.eventDate)}</p>
              </div>
              <button type="button" onClick={() => setPaymentForm(null)} disabled={saving} aria-label="Close" className="rounded-full p-2 transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"><X className="size-5 text-muted-foreground" /></button>
            </div>

            <div className="space-y-5 p-5">
              <div className="flex items-baseline justify-between rounded-xl bg-[#FBF6EE] p-4">
                <span className="text-sm text-muted-foreground">Still owed</span>
                <span className="text-2xl font-bold tabular-nums text-[#2B1D16]">{peso(formOwed)}</span>
              </div>

              <fieldset>
                <legend className="text-sm font-medium text-[#2B1D16]">What kind of payment</legend>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {(Object.keys(TYPE_LABEL) as PaymentType[]).map((t) => (
                    <button key={t} type="button" aria-pressed={paymentForm.type === t} onClick={() => setPaymentForm({ ...paymentForm, type: t })} className={`rounded-xl border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${paymentForm.type === t ? 'border-[#C8431B] bg-[#F6E3D3] text-[#C8431B]' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'}`}>
                      {TYPE_LABEL[t].replace(' payment', '')}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="pay-amount" className="text-sm font-medium text-[#2B1D16]">Amount received</label>
                <div className="relative mt-2">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">₱</span>
                  <input id="pay-amount" type="number" inputMode="decimal" min="0" step="0.01" value={paymentForm.amount} onChange={(e) => { setFormError(''); setPaymentForm({ ...paymentForm, amount: e.target.value }); }} className="h-11 w-full rounded-xl border border-[#E8D8C4] bg-white pl-8 pr-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]" placeholder="0.00" autoFocus />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAmount(formOwed, 'full_payment')} className="rounded-full border border-[#E8D8C4] px-3 py-1 text-xs font-medium transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">Full balance</button>
                  <button type="button" onClick={() => setAmount(Math.round(formOwed * 50) / 100, 'partial')} className="rounded-full border border-[#E8D8C4] px-3 py-1 text-xs font-medium transition-colors hover:bg-[#f1f1f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">Half</button>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {formAmount > 0 && formAmount <= formOwed + 0.004
                    ? formAfter <= 0.004 ? 'This settles the booking.' : `${peso(formAfter)} will still be owed after this.`
                    : ' '}
                </p>
                {formError && <p role="alert" className="mt-1 text-sm font-medium text-[#C8431B]">{formError}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#E8D8C4] p-5">
              <Button type="button" variant="outline" onClick={() => setPaymentForm(null)} disabled={saving}>Cancel</Button>
              <Button type="button" onClick={handleRecordPayment} disabled={saving} className="bg-[#C8431B] text-white hover:bg-[#A93615]">{saving ? 'Saving…' : 'Record payment'}</Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
