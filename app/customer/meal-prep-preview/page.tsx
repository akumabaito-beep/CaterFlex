
'use client';

import { useEffect } from 'react';
import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Calendar,
  MapPin,
  Clock,
  CheckCircle2,
  Utensils,
} from 'lucide-react';
import { WEEKDAYS } from '@/lib/meal-plan';
import { parsePinnedAddress } from '@/lib/kitchen';

export default function MealPrepPreviewPage() {
  const router = useRouter();
  const { customerBookingDraft, customerOrderType } = useAppState();

  const isMealPrep =
    customerOrderType === 'meal_prep' &&
    customerBookingDraft.orderType === 'meal_prep';

  const scheduledDeliveries =
    customerBookingDraft.scheduledDeliveries ?? [];

  const valid =
    isMealPrep &&
    Boolean(customerBookingDraft.eventDate) &&
    scheduledDeliveries.length > 0;

  useEffect(() => {
    if (!valid) router.push('/customer/inquiry');
  }, [valid, router]);

  if (!valid) return null;

  const subscriptionWeeks = customerBookingDraft.subscriptionWeeks ?? 1;
  const deliveryDays = customerBookingDraft.deliveryDays ?? [];

  const selectedWeekdays = WEEKDAYS
    .filter((day) => deliveryDays.includes(day.value))
    .map((day) => day.label);

  const formatDate = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatTime = (time: string) => {
    const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})/);

    if (!match) return time;

    const hour = Number(match[1]);

    return `${hour % 12 === 0 ? 12 : hour % 12}:${match[2]} ${
      hour >= 12 ? 'PM' : 'AM'
    }`;
  };

  const delivery =
    customerBookingDraft.fulfillmentMethod === 'delivery';

  const address = String(customerBookingDraft.venue ?? '');

  const summary = [
    {
      icon: Calendar,
      label: 'Subscription duration',
      value: `${subscriptionWeeks} ${
        subscriptionWeeks === 1 ? 'week' : 'weeks'
      }`,
    },
    {
      icon: Utensils,
      label: 'Delivery weekdays',
      value: selectedWeekdays.join(', ') || 'Not selected',
    },
    {
      icon: Clock,
      label: delivery ? 'Delivery time' : 'Pickup time',
      value: formatTime(String(customerBookingDraft.eventTime ?? '')),
    },
    {
      icon: MapPin,
      label: delivery ? 'Delivery address' : 'Pickup location',
      value: delivery
        ? parsePinnedAddress(address)?.address ?? address
        : 'Kitchen',
    },
  ];

  return (
    <CustomerShell>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C8431B] mb-2">
            Step 2 of 3 · Review your plan
          </p>

          <h1 className="font-heading uppercase text-4xl font-bold text-[#2B1D16]">
            Your Meal Prep Subscription
          </h1>

          <p className="text-[#2B1D16]/70 mt-2">
            Review your subscription details and delivery schedule before
            selecting your meals.
          </p>
        </div>

        <Card className="p-6 sm:p-8 rounded-2xl border border-[#E8D8C4] bg-white shadow-sm space-y-8">
          <div className="grid sm:grid-cols-2 gap-4">
            {summary.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-start gap-3 rounded-xl bg-[#F6E3D3] p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#C8431B] text-white">
                  <Icon className="h-5 w-5" />
                </span>

                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60">
                    {label}
                  </p>

                  <p className="text-base font-bold text-[#2B1D16] break-words">
                    {value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B] mb-4">
              Your {scheduledDeliveries.length} scheduled deliveries
            </h2>

            <ol className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {scheduledDeliveries.map((delivery, index) => (
                <li
                  key={`${delivery.date}-${index}`}
                  className="rounded-lg border border-[#E8D8C4] bg-white p-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#C8431B] flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Week {delivery.subscriptionWeek}
                  </p>

                  <p className="mt-1 text-sm font-semibold text-[#2B1D16]">
                    {formatDate(delivery.date)}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {customerBookingDraft.specialRequests && (
            <div className="border-t border-[#E8D8C4] pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60 mb-2">
                Special requests
              </p>

              <p className="text-[#2B1D16]">
                {customerBookingDraft.specialRequests}
              </p>
            </div>
          )}
        </Card>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/customer/inquiry')}
            className="flex-1 h-11 rounded-lg border-[#C8431B] text-[#C8431B] hover:bg-[#F6E3D3] hover:text-[#A93615]"
          >
            Back
          </Button>

          <Button
            onClick={() => router.push('/customer/browse')}
            className="flex-1 h-11 rounded-lg bg-[#C8431B] text-white font-semibold hover:bg-[#A93615]"
          >
            Continue to menu selection
          </Button>
        </div>
      </div>
    </CustomerShell>
  );
}
