'use client';

import { useEffect } from 'react';
import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Clock, CheckCircle2, Utensils } from 'lucide-react';
import { mealTypeLabel, planTitle, readMealPlanDraft, remainingDeliveries, termEndDate } from '@/lib/meal-plan';
import { parsePinnedAddress } from '@/lib/kitchen';

export default function MealPrepPreviewPage() {
  const router = useRouter();
  const { customerBookingDraft, customerOrderType } = useAppState();

  const isMealPrep =
    customerOrderType === 'meal_prep' &&
    customerBookingDraft.orderType === 'meal_prep';
  const valid = isMealPrep && Boolean(customerBookingDraft.eventDate);

  useEffect(() => {
    if (!valid) router.push('/customer/inquiry');
  }, [valid, router]);

  if (!valid || !customerBookingDraft.eventDate) return null;

  const plan = readMealPlanDraft(customerBookingDraft);
  const frequency = customerBookingDraft.mealPrepFrequency || 'weekly';
  const lastDate = termEndDate(customerBookingDraft.eventDate, frequency, plan.termCycles);
  const fulfillmentDates = remainingDeliveries(customerBookingDraft.eventDate, lastDate, frequency);

  const formatDate = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  const delivery = customerBookingDraft.fulfillmentMethod === 'delivery';

  const formatTime = (t: string) => {
    const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const summary = [
    { icon: Utensils, label: 'Meal', value: mealTypeLabel(plan.mealType) },
    { icon: Users, label: 'Servings per cycle', value: String(customerBookingDraft.guestCount) },
    { icon: Clock, label: delivery ? 'Delivery time' : 'Pickup time', value: formatTime(String(customerBookingDraft.eventTime ?? '')) },
    {
      icon: MapPin,
      label: delivery ? 'Delivery address' : 'Pickup',
      value: delivery ? (parsePinnedAddress(String(customerBookingDraft.venue ?? ''))?.address ?? String(customerBookingDraft.venue ?? '')) : 'Kitchen',
    },
    {
      icon: Calendar,
      label: 'Frequency',
      value: customerBookingDraft.mealPrepFrequency === 'biweekly' ? 'Every 2 weeks' : 'Weekly',
    },
  ];

  return (
    <CustomerShell>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9B1C2C] mb-2">
            Step 2 of 3 · Review your plan
          </p>
          <h1 className="font-heading uppercase text-4xl font-bold text-[#2A1B1F]">
            {planTitle(plan.mealType)}
          </h1>
          <p className="text-[#2A1B1F]/70 mt-2">
            {plan.termCycles} deliveries, {frequency === 'biweekly' ? 'every 2 weeks' : 'every week'}. Review your schedule, then pick your dishes.
          </p>
        </div>

        <Card className="p-6 sm:p-8 rounded-2xl border border-[#E8D2D2] bg-white shadow-sm space-y-8">
          <div className="grid sm:grid-cols-2 gap-4">
            {summary.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 rounded-xl bg-[#FDECEC] p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#9B1C2C] text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#2A1B1F]/60">{label}</p>
                  <p className="text-base font-bold text-[#2A1B1F] break-words">{value}</p>
                </div>
              </div>
            ))}
          </div>

          <div>
            <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#9B1C2C] mb-4">
              Your {fulfillmentDates.length} delivery dates
            </h2>
            <ol className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {fulfillmentDates.map((date, i) => (
                <li
                  key={date}
                  className="rounded-lg border border-[#E8D2D2] bg-white p-3 text-center"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9B1C2C] flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Delivery {i + 1} of {fulfillmentDates.length}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#2A1B1F]">{formatDate(date)}</p>
                </li>
              ))}
            </ol>
          </div>

          {customerBookingDraft.specialRequests && (
            <div className="border-t border-[#E8D2D2] pt-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#2A1B1F]/60 mb-2">
                Special requests
              </p>
              <p className="text-[#2A1B1F]">{customerBookingDraft.specialRequests}</p>
            </div>
          )}
        </Card>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/customer/inquiry')}
            className="flex-1 h-11 rounded-lg border-[#9B1C2C] text-[#9B1C2C] hover:bg-[#FDECEC] hover:text-[#7F1623]"
          >
            Back
          </Button>
          <Button
            onClick={() => router.push('/customer/browse')}
            className="flex-1 h-11 rounded-lg bg-[#9B1C2C] text-white font-semibold hover:bg-[#7F1623]"
          >
            Continue to menu selection
          </Button>
        </div>
      </div>
    </CustomerShell>
  );
}
