'use client';

import { useEffect, useState } from 'react';

import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import { getCustomerBookings } from '@/app/actions/booking-actions';
import { OWNER_CONTACT } from '@/lib/constants';

import { parsePinnedAddress } from '@/lib/kitchen';

import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Clock3,
  MapPin,
  Users,
  XCircle,
} from 'lucide-react';

type Booking = {
  BookingID: number;
  CustomerID: number;
  OperatorID: number | null;
  EventDate: string;
  EventTime: string;
  Venue: string | null;
  GuestCount: number;
  Status: string | null;
  EventType?: string | null;
  DeliveryFee?: number | null;
  RejectionReason?: string | null;
};

type BookingItem = {
  BookingItemID: number;
  BookingID: number;
  MenuItemID: number;
  Quantity: number;
  UnitPrice: number | null;
};

type MenuItem = {
  MenuItemID: number;
  ItemName: string;
  Price: number | null;
};

type BookingWithItems = Booking & {
  items: {
    name: string;
    quantity: number;
    price: number | null;
  }[];
};

const statusCopy: Record<
  string,
  { label: string; icon: typeof Clock3; badge: string; note: string }
> = {
  pending: {
    label: 'Pending review',
    icon: Clock3,
    badge: 'bg-amber-100 text-amber-900 border-amber-300',
    note: 'The caterer is reviewing your request.',
  },
  confirmed: {
    label: 'Confirmed',
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    note: 'Your booking is confirmed.',
  },
  rejected: {
    label: 'Declined',
    icon: XCircle,
    badge: 'bg-red-100 text-red-800 border-red-300',
    note: 'The caterer could not accept this booking.',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    badge: 'bg-[#F6E3D3] text-[#A93615] border-[#E3C7A8]',
    note: 'This event is done. Thank you for ordering!',
  },
};

const STEPS = ['Submitted', 'Confirmed', 'Completed'];
const stepIndex: Record<string, number> = { pending: 0, confirmed: 1, completed: 2 };

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatTime(t: string) {
  const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export default function CustomerStatusPage() {
  const { currentUser } = useAppState();

  const [bookings, setBookings] = useState<BookingWithItems[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadBookings = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      const customerId = Number(currentUser.id);

      if (Number.isNaN(customerId)) {
        setLoading(false);
        return;
      }

      try {
        const result = await getCustomerBookings();

        if (!result.ok) {
          console.error('BOOKING FETCH ERROR:', result.error);
          setBookings([]);
          return;
        }

        const bookingData = result.bookings;
        const bookingItemData = result.bookingItems;

        if (bookingData.length === 0) {
          setBookings([]);
          return;
        }

        const bookingIds = bookingData.map(
          (booking) => booking.BookingID
        );

        const menuItemIds = Array.from(
          new Set(
            (bookingItemData ?? []).map(
              (item) => item.MenuItemID
            )
          )
        );

        let menuItems: MenuItem[] = [];

        if (menuItemIds.length > 0) {
          const { data: menuItemData, error: menuItemError } =
            await supabase
              .from('MENU_ITEM')
              .select('MenuItemID, ItemName, Price')
              .in('MenuItemID', menuItemIds);

          if (menuItemError) {
            console.error(
              'MENU_ITEM FETCH ERROR:',
              menuItemError
            );
          } else {
            menuItems = menuItemData ?? [];
          }
        }

        // Combine bookings + booking items + menu items
        const combinedBookings: BookingWithItems[] =
          bookingData.map((booking) => {
            const itemsForBooking =
              (bookingItemData ?? []).filter(
                (item) => item.BookingID === booking.BookingID
              );

            const items = itemsForBooking.map((bookingItem) => {
              const menuItem = menuItems.find(
                (item) =>
                  item.MenuItemID === bookingItem.MenuItemID
              );

              return {
                name:
                  menuItem?.ItemName ??
                  `Menu Item #${bookingItem.MenuItemID}`,
                quantity: bookingItem.Quantity,
                price:
                  bookingItem.UnitPrice === null
                    ? null
                    : Number(bookingItem.UnitPrice),
              };
            });

            return {
              ...booking,
              items,
            };
          });

        setBookings(combinedBookings);
      } catch (error) {
        console.error('Unexpected booking fetch error:', error);
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    loadBookings();
  }, [currentUser?.id]);

  return (
    <CustomerShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-8">
        <header>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C8431B]">
            Your catering requests
          </p>
          <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">
            My bookings
          </h1>
          <p className="mt-2 text-[#2B1D16]/70">
            Track your submitted bookings and their current status.
          </p>
        </header>

        {loading ? (
          <div className="rounded-xl border border-[#E8D8C4] bg-white p-12 text-center text-[#2B1D16]/60">
            Loading your bookings...
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E8D8C4] bg-white p-12 text-center text-[#2B1D16]/60">
            No bookings yet. Start a new order to see it here.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {bookings.map((booking) => {
              const statusKey = booking.Status?.toLowerCase() ?? 'pending';
              const status = statusCopy[statusKey] ?? statusCopy.pending;
              const StatusIcon = status.icon;

              const hasUnavailablePrices = booking.items.some(
                (item) => item.price === null
              );
              
              const foodTotal = hasUnavailablePrices
                ? null
                : booking.items.reduce(
                    (total, item) => total + item.price! * item.quantity,
                    0
                  );
              
              const deliveryFee = Number(booking.DeliveryFee ?? 0);
              
              const estimatedTotal =
                foodTotal === null ? null : foodTotal + deliveryFee;

              const title = booking.EventType?.trim() || 'Catering order';
              const pinned = parsePinnedAddress(booking.Venue ?? '');
              const address = pinned?.address ?? booking.Venue ?? '';
              const date = new Date(`${booking.EventDate}T12:00:00`).toLocaleDateString('en-PH', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              });
              const step = stepIndex[statusKey];

              return (
                <article
                  key={booking.BookingID}
                  className="overflow-hidden rounded-xl border border-[#DCC7A8] bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8D8C4] bg-[#FBF6EE] px-6 py-5">
                    <div>
                      <h2 className="font-heading text-2xl font-bold uppercase leading-tight text-[#2B1D16]">
                        {title}
                      </h2>
                      <p className="mt-1 text-sm text-[#2B1D16]/60">Order #{booking.BookingID}</p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold ${status.badge}`}
                    >
                      <StatusIcon className="size-4" aria-hidden="true" />
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-6 p-6">
                    {/* PROGRESS */}
                    {step !== undefined ? (
                      <ol className="flex items-center" aria-label="Booking progress">
                        {STEPS.map((label, i) => (
                          <li key={label} className="flex flex-1 items-center last:flex-none">
                            <span
                              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                i <= step ? 'bg-[#C8431B] text-white' : 'bg-neutral-200 text-neutral-500'
                              }`}
                              aria-current={i === step ? 'step' : undefined}
                            >
                              {i < step ? '✓' : i + 1}
                            </span>
                            <span
                              className={`ml-2 text-xs font-semibold uppercase tracking-wide ${
                                i <= step ? 'text-[#2B1D16]' : 'text-[#2B1D16]/40'
                              }`}
                            >
                              {label}
                            </span>
                            {i < STEPS.length - 1 && (
                              <span
                                className={`mx-3 h-0.5 flex-1 rounded ${i < step ? 'bg-[#C8431B]' : 'bg-neutral-200'}`}
                                aria-hidden="true"
                              />
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {statusKey === 'rejected' && booking.RejectionReason ? `Reason: ${booking.RejectionReason}` : status.note}
                      </p>
                    )}

                    {/* DETAILS */}
                    <dl className="grid gap-4 sm:grid-cols-2">
                      {[
                        { icon: CalendarDays, label: 'Date', value: date },
                        { icon: Clock, label: 'Time', value: formatTime(booking.EventTime) },
                        { icon: Users, label: 'Guests', value: `${booking.GuestCount} guests` },
                      ].map(({ icon: Icon, label, value }) => (
                        <div key={label} className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C8431B] text-white">
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">{label}</dt>
                            <dd className="font-semibold text-[#2B1D16]">{value}</dd>
                          </div>
                        </div>
                      ))}
                      {address && (
                        <div className="flex items-start gap-3 sm:col-span-2">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#C8431B] text-white">
                            <MapPin className="size-4" aria-hidden="true" />
                          </span>
                          <div>
                            <dt className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">Drop-off location</dt>
                            <dd className="font-semibold text-[#2B1D16]">{address}</dd>
                            {pinned && (
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${pinned.lat}&mlon=${pinned.lng}#map=17/${pinned.lat}/${pinned.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm font-semibold text-[#C8431B] underline"
                              >
                                View pin on map
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </dl>

                    {/* MENU ITEMS */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">
                        Selected menu items
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {booking.items.length === 0 ? (
                          <span className="text-sm text-[#2B1D16]/60">No menu items recorded.</span>
                        ) : (
                          booking.items.map((item) => (
                            <span
                              key={`${booking.BookingID}-${item.name}`}
                              className="rounded-lg border border-[#E8D8C4] bg-white px-3 py-1.5 text-sm font-medium text-[#2B1D16]"
                            >
                              <div>
                              <span>{item.name}</span>
                              {item.quantity > 1 && (
                                <span className="text-[#2B1D16]/50">
                                  {' '}× {item.quantity}
                                </span>
                              )}
                              <p className="mt-1 text-xs text-[#2B1D16]/60">
                                {item.price === null
                                  ? 'Price unavailable'
                                  : `${peso(item.price)} each`}
                              </p>
                            </div>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                    {/* TOTAL */}
                    <div className="space-y-1 border-t border-[#E8D8C4] pt-4 text-sm">
                      <div className="flex justify-between text-[#2B1D16]/70">
                        <span>Food</span>
                        <span>
                          {foodTotal === null ? 'Unavailable' : peso(foodTotal)}
                        </span>
                      </div>
                      {deliveryFee > 0 && (
                        <div className="flex justify-between text-[#2B1D16]/70">
                          <span>Delivery</span>
                          <span>{peso(deliveryFee)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-semibold text-[#2B1D16]">Estimated total</span>
                        <span className="text-xl font-bold text-[#C8431B]">
                          {estimatedTotal === null ? 'Unavailable' : peso(estimatedTotal)}
                        </span>
                      </div>
                    </div>

                    {(statusKey === 'pending' || statusKey === 'confirmed') && (
                      <p className="rounded-lg bg-[#F6E3D3] p-3 text-sm text-[#2B1D16]">
                        Need to cancel or change this booking? Please contact the caterer at{' '}
                        <a href={`mailto:${OWNER_CONTACT}`} className="font-semibold text-[#C8431B] underline">
                          {OWNER_CONTACT}
                        </a>
                        .
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </CustomerShell>
  );
}
