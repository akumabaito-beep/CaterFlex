
'use client';

import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin, Users, Clock } from 'lucide-react';

export default function MealPrepPreviewPage() {
  const router = useRouter();
  const { customerBookingDraft, customerOrderType } = useAppState();

  const isMealPrep =
    customerOrderType === 'meal_prep' &&
    customerBookingDraft.orderType === 'meal_prep';

  if (!isMealPrep || !customerBookingDraft.eventDate) {
    router.push('/customer/inquiry');
    return null;
  }

  const startDate =
    customerBookingDraft.mealPrepStartDate ||
    customerBookingDraft.eventDate;

  const deliveryDays = customerBookingDraft.deliveryDays ?? [];
  const mealPeriods = customerBookingDraft.mealPeriods ?? [];
  const mealPeriodTimes = customerBookingDraft.mealPeriodTimes ?? {};
  const legacyDeliveryTimes = customerBookingDraft.deliveryTimes ?? [];
  const weekdayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];


  const formatTime = (timeStr?: string) => {
    if (!timeStr) return '';

    const [hoursStr, minutesStr] = timeStr.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr || '00';

    if (isNaN(hours)) return timeStr;

    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;

    return `${hours}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T12:00:00`);

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <CustomerShell>
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="font-heading text-3xl font-bold text-surface-foreground">
            Meal Prep Schedule Preview
          </h1>
          <p className="text-surface-muted-foreground mt-2">
            Here&apos;s your recurring fulfillment schedule. Confirm to continue
            with menu selection.
          </p>
        </div>

        <Card className="p-8">
          <div className="space-y-6">
            {/* Plan Summary */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Users className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Servings per selected meal
                  </p>
                  <p className="text-lg font-bold text-card-foreground">
                    {customerBookingDraft.servingsPerCycle ??
                      customerBookingDraft.guestCount}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Preferred meal times
                  </p>
                  <p className="text-lg font-bold text-card-foreground">
                    {mealPeriods.length} selected meal
                    {mealPeriods.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    {customerBookingDraft.fulfillmentMethod === 'delivery'
                      ? 'Delivery'
                      : 'Pickup'}
                  </p>
                  <p className="text-lg font-bold text-card-foreground">
                    {customerBookingDraft.fulfillmentMethod === 'delivery'
                      ? customerBookingDraft.venue
                      : 'Kitchen'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="w-5 h-5 text-primary mt-1" />
                <div>
                  <p className="text-sm text-muted-foreground">
                    Subscription
                  </p>
                  <p className="text-lg font-bold text-card-foreground">
                    Ongoing weekly subscription
                  </p>
                </div>
              </div>
            </div>

            <hr className="border-border" />

            {/* Fulfillment Schedule */}
            <div>
              <h2 className="text-lg font-bold text-card-foreground mb-4">
                Your recurring meal schedule
              </h2>

              {deliveryDays.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No fulfillment days selected.
                </p>
              ) : (
                <div className="space-y-3">
                  {[...deliveryDays]
                    .sort((a, b) => a - b)
                    .map((day) => (
                      <div
                        key={day}
                        className="p-4 bg-muted/50 rounded-lg"
                      >
                        <p className="font-semibold text-card-foreground mb-2">
                          Every {weekdayNames[day]}
                        </p>

                        <div className="space-y-2">
                          {mealPeriods.map((mealPeriod) => {
                            const time =
                              mealPeriodTimes[day]?.[mealPeriod] ??
                              legacyDeliveryTimes[day];

                            return (
                              <div
                                key={`${day}-${mealPeriod}`}
                                className="flex items-center justify-between gap-4 text-sm"
                              >
                                <span className="text-card-foreground">
                                  {mealPeriod}
                                </span>

                                <span className="text-muted-foreground">
                                  {time ? formatTime(time) : 'Time not set'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}

              <p className="mt-4 text-sm text-muted-foreground">
                Your subscription repeats every week from your selected start date
                until it is paused or cancelled according to the subscription policy.
              </p>
            </div>

            {customerBookingDraft.specialRequests && (
              <>
                <hr className="border-border" />
                <div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Special requests
                  </p>
                  <p className="text-card-foreground">
                    {customerBookingDraft.specialRequests}
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={() => router.push('/customer/inquiry')}
            className="flex-1"
          >
            Back
          </Button>

          <Button
            onClick={() => router.push('/customer/browse')}
            className="flex-1"
          >
            Continue to menu selection
          </Button>
        </div>
      </div>
    </CustomerShell>
  );
}
