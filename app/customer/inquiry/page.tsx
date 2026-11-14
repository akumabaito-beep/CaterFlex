'use client';

import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { supabase } from '@/lib/supabase';
import {
  getCustomerAllergies,
  setCustomerAllergies,
} from '@/app/actions/allergy-actions';

import type {
  AllergenType,
  Booking,
  FulfillmentMethod,
  OrderType,
} from '@/lib/types';

import {
  getDateAvailability,
  findNextAvailableDate,
} from '@/lib/rules/bookingValidation';
import { useRouter } from 'next/navigation';

import {
  SUBSCRIPTION_WEEK_OPTIONS,
  WEEKDAYS,
  generateDeliveryDates,
  isValidDeliveryDays,
  type SubscriptionWeeks,
} from '@/lib/meal-plan';

import { EventTypePicker } from '@/components/booking/EventTypePicker';
import { AllergenPicker } from '@/components/booking/AllergenPicker';
import { TimePicker } from '@/components/booking/TimePicker';
import { NumberStepper } from '@/components/booking/NumberStepper';
import { LocationPicker } from '@/components/booking/LocationPicker';
import { AvailabilityCalendar } from '@/components/booking/AvailabilityCalendar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  CalendarDays,
  UtensilsCrossed,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const ALLERGEN_OPTIONS: AllergenType[] = [
  'dairy',
  'eggs',
  'gluten',
  'peanuts',
  'shellfish',
  'soy',
  'other',
];

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString(
    undefined,
    {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }
  );
}

export default function InquiryPage() {
  const router = useRouter();

  const {
    bookings,
    operatorSettings,
    customerOrderType,
    loadOperatorSettings,
    setCustomerOrderType,
    setCustomerBookingDraft,
    setDietaryRestrictions,
  } = useAppState();

  const isMealPrep = customerOrderType === 'meal_prep';

  useEffect(() => {
    loadOperatorSettings();
  }, [loadOperatorSettings]);

  /*
   * ============================================================
   * DATABASE BOOKINGS
   * ============================================================
   *
   * BOOKING is the source of truth for catering capacity.
   *
   * BOOKING does not have an OrderType column.
   * Therefore, BOOKING records are treated as catering bookings.
   */

  const [databaseBookings, setDatabaseBookings] = useState<Booking[]>(
    []
  );

  const [loadingAvailability, setLoadingAvailability] =
    useState(false);

  const loadDatabaseBookings = async () => {
    setLoadingAvailability(true);

    const { data, error } = await supabase
      .from('BOOKING')
      .select(
        `
        BookingID,
        CustomerID,
        OperatorID,
        EventDate,
        EventTime,
        Venue,
        GuestCount,
        Status
        `
      )
      .eq('OperatorID', 2);

    if (error) {
      console.error(
        'BOOKING AVAILABILITY FETCH ERROR:',
        error
      );

      setDatabaseBookings([]);
      setLoadingAvailability(false);

      return;
    }

    type DatabaseBooking = {
      BookingID: number;
      CustomerID: number | null;
      OperatorID: number | null;
      EventDate: string;
      EventTime: string;
      Venue: string | null;
      GuestCount: number | null;
      Status: string | null;
    };

    const formattedBookings: Booking[] = (
      (data ?? []) as DatabaseBooking[]
    ).map((booking): Booking => ({
      id: String(booking.BookingID),

      customerId: String(
        booking.CustomerID ?? ''
      ),

      customerName: '',

      customerEmail: '',

      orderType: 'catering',

      eventDate: String(
        booking.EventDate ?? ''
      ),

      eventTime: String(
        booking.EventTime ?? ''
      ),

      eventType: '',

      venue: String(
        booking.Venue ?? ''
      ),

      guestCount: Number(
        booking.GuestCount ?? 0
      ),

      status:
        booking.Status === 'confirmed'
          ? 'confirmed'
          : booking.Status === 'rejected'
            ? 'rejected'
            : booking.Status === 'completed'
              ? 'completed'
              : 'pending',

      selectedMenuItemIds: [],

      dietaryRestrictions: [],

      eventProfileId: '',

      totalCost: 0,

      paymentsReceived: 0,

      createdAt: '',

      specialRequests: '',

      validationPassed: true,

      ruleViolations: [],
    }));

    setDatabaseBookings(formattedBookings);

    setLoadingAvailability(false);
  };

  /*
   * Load current database bookings when the page opens.
   */

  useEffect(() => {
    loadDatabaseBookings();
  }, []);

  /*
   * ============================================================
   * FORM STATE
   * ============================================================
   */

  const [cateringForm, setCateringForm] = useState({
    eventType: '',
    eventDate: '',
    eventTime: '12:00',
    venue: '',
    guestCount: '',
    specialRequests: '',
  });

  const [mealPrepForm, setMealPrepForm] = useState({
    subscriptionWeeks: 1 as SubscriptionWeeks,
    startDate: '',
    deliveryDays: [1, 3] as number[],
    fulfillmentTime: '10:00',
    fulfillmentMethod: 'pickup' as FulfillmentMethod,
    address: '',
    specialRequests: '',
  });

  const toggleDeliveryDay = (day: number) => {
    setMealPrepForm((prev) => {
      const selected = prev.deliveryDays.includes(day);
  
      return {
        ...prev,
        deliveryDays: selected
          ? prev.deliveryDays.filter((d) => d !== day)
          : [...prev.deliveryDays, day].sort((a, b) => a - b),
      };
    });
  };

  const [dietary, setDietary] = useState<AllergenType[]>(
    []
  );

  const [guestCountError, setGuestCountError] =
    useState('');

  /*
   * ============================================================
   * ACTIVE DATE
   * ============================================================
   */

  const activeDate = isMealPrep
    ? mealPrepForm.startDate
    : cateringForm.eventDate;

    const scheduledDeliveries = useMemo(() => {
      if (
        !mealPrepForm.startDate ||
        !isValidDeliveryDays(mealPrepForm.deliveryDays)
      ) {
        return [];
      }
    
      return generateDeliveryDates(
        mealPrepForm.startDate,
        mealPrepForm.deliveryDays,
        mealPrepForm.subscriptionWeeks
      );
    }, [
      mealPrepForm.startDate,
      mealPrepForm.deliveryDays,
      mealPrepForm.subscriptionWeeks,
    ]);

  /*
   * ============================================================
   * BOOKINGS USED FOR AVAILABILITY
   * ============================================================
   *
   * Catering:
   *   Uses real Supabase BOOKING records.
   *
   * Meal prep:
   *   Uses existing application booking data because
   *   MEAL_PREP_ORDER currently has no fulfillment date.
   */

  const availabilityBookings = isMealPrep
    ? bookings
    : databaseBookings;

  /*
   * ============================================================
   * DATE AVAILABILITY
   * ============================================================
   */

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stepError, setStepError] = useState('');
  const stepChangedAt = useRef(0);
  const [otherAllergy, setOtherAllergy] = useState('');
  const [allergenOptions, setAllergenOptions] = useState<AllergenType[]>(ALLERGEN_OPTIONS);
  const [loadingAllergies, setLoadingAllergies] = useState(true);
  const [allergyTagRows, setAllergyTagRows] = useState<Array<{ AllergyTagID: number; AllergenName: string }>>([]);

  const FALLBACK_ALLERGEN_OPTIONS = ALLERGEN_OPTIONS;

  useEffect(() => {
    async function loadAllergies() {
      try {
        const { data: tags, error } = await supabase
          .from('ALLERGY_TAG')
          .select('AllergyTagID, AllergenName');
  
        if (error) {
          throw error;
        }
  
        const validTags =
          (tags ?? []) as Array<{
            AllergyTagID: number;
            AllergenName: string;
          }>;
  
        setAllergyTagRows(validTags);
  
        // Normalize database allergen names so they match AllergenType.
        const normalizedOptions = validTags
          .map((tag) => tag.AllergenName.trim().toLowerCase())
          .filter((name): name is AllergenType =>
            ALLERGEN_OPTIONS.includes(name as AllergenType)
          );
  
        if (normalizedOptions.length > 0) {
          const ordered = ALLERGEN_OPTIONS.filter((o) => o === 'other' || normalizedOptions.includes(o));
          setAllergenOptions(ordered);
        } else {
          setAllergenOptions(ALLERGEN_OPTIONS);
        }
  
        const customerAllergiesResult =
          await getCustomerAllergies();
  
        if (!customerAllergiesResult.ok) {
          console.error(
            'Failed to load customer allergies:',
            customerAllergiesResult.error
          );
  
          setDietary([]);
          setDietaryRestrictions([]);
          return;
        }
  
        const customerAllergies =
          customerAllergiesResult.allergyTagIds;
  
        if (customerAllergies.length === 0) {
          setDietary([]);
          setDietaryRestrictions([]);
          return;
        }
  
        const savedAllergies = customerAllergies
          .map((customerAllergy) => {
            const tag = validTags.find(
              (item) =>
                item.AllergyTagID ===
                customerAllergy
            );
  
            if (!tag) {
              return null;
            }
  
            const normalizedName =
              tag.AllergenName.trim().toLowerCase();
  
            return ALLERGEN_OPTIONS.includes(
              normalizedName as AllergenType
            )
              ? (normalizedName as AllergenType)
              : null;
          })
          .filter(
            (allergen): allergen is AllergenType =>
              allergen !== null
          );
  
        setDietary(savedAllergies);
        setDietaryRestrictions(savedAllergies);
      } catch (error) {
        console.error(
          'Error loading customer allergies:',
          error
        );
  
        setDietary([]);
        setDietaryRestrictions([]);
      } finally {
        setLoadingAllergies(false);
      }
    }
  
    loadAllergies();
  }, [setDietaryRestrictions]);

  const dateAvailability = useMemo(() => {
    return getDateAvailability(activeDate, customerOrderType, operatorSettings, availabilityBookings);
  }, [activeDate, customerOrderType, operatorSettings, availabilityBookings]);


  /*
   * ============================================================
   * SUGGESTED DATE
   * ============================================================
   */

  const suggestedDate = useMemo(() => {
    if (
      !activeDate ||
      !dateAvailability ||
      dateAvailability.available
    ) {
      return null;
    }

    /*
     * IMPORTANT:
     * findNextAvailableDate currently accepts only
     * four arguments.
     */

    return findNextAvailableDate(
      activeDate,
      customerOrderType,
      operatorSettings,
      availabilityBookings
    );
  }, [
    activeDate,
    dateAvailability,
    customerOrderType,
    operatorSettings,
    availabilityBookings,
  ]);

  /*
   * ============================================================
   * APPLY SUGGESTED DATE
   * ============================================================
   */

  const applySuggestedDate = () => {
    if (!suggestedDate) {
      return;
    }

    if (isMealPrep) {
      setMealPrepForm((prev) => ({
        ...prev,
        startDate: suggestedDate,
      }));
    } else {
      setCateringForm((prev) => ({
        ...prev,
        eventDate: suggestedDate,
      }));
    }

    setGuestCountError('');
  };

  /*
   * ============================================================
   * ORDER TYPE
   * ============================================================
   */

  const switchOrderType = (type: OrderType) => {
    setCustomerOrderType(type);
    setGuestCountError('');
    setStep(1);
    setStepError('');
  };

  /*
   * ============================================================
   * ALLERGENS
   * ============================================================
   */

  const toggleAllergen = (
    allergen: AllergenType
  ) => {
    setDietary((prev) =>
      prev.includes(allergen)
        ? prev.filter((a) => a !== allergen)
        : [...prev, allergen]
    );
  };

  /*
   * ============================================================
   * SUBMIT
   * ============================================================
   */

  const saveAllergies = async () => {
    const selectedAllergyTagIds = allergyTagRows
      .filter((tag) => {
        const normalizedName =
          tag.AllergenName.trim().toLowerCase();
  
        return dietary.includes(
          normalizedName as AllergenType
        );
      })
      .map((tag) => tag.AllergyTagID);
  
    const result = await setCustomerAllergies(
      selectedAllergyTagIds
    );
  
    if (!result.ok) {
      throw new Error(result.error);
    }
  };

  const otherNote =
    dietary.includes('other' as AllergenType) && otherAllergy.trim()
      ? `Other allergy: ${otherAllergy.trim()}`
      : '';

  const stepProblem = (which: 1 | 2): string => {
    if (which === 1) {
      if (isMealPrep) {
        if (!mealPrepForm.startDate) return 'Pick a start date on the calendar.';
        if (!isValidDeliveryDays(mealPrepForm.deliveryDays)) return 'Select at least one delivery day.';
        if (!mealPrepForm.fulfillmentTime) return 'Choose a preferred time.';
        if (dateAvailability && !dateAvailability.available) return 'That date is not available. Pick another one.';
        return '';
      }
      if (!cateringForm.eventType) return 'Choose an event type.';
      if (!cateringForm.eventDate) return 'Pick an event date on the calendar.';
      if (dateAvailability && !dateAvailability.available) return 'That date is not available. Pick another one.';
      if (!cateringForm.eventTime) return 'Choose an event time.';
      const guests = Number(cateringForm.guestCount);
      if (!guests || guests < 1) return 'Enter the number of guests.';
      if (guests > operatorSettings.maxGuestsPerEvent) return `The maximum is ${operatorSettings.maxGuestsPerEvent} guests per event.`;
      return '';
    }
    if (isMealPrep) {
      return mealPrepForm.fulfillmentMethod === 'delivery' && !mealPrepForm.address ? 'Pin your delivery address on the map.' : '';
    }
    return cateringForm.venue ? '' : 'Pin the drop-off location on the map.';
  };

  const goNext = () => {
    if (step === 3) return;
    const problem = stepProblem(step);
    setStepError(problem);
    if (problem) return;
    stepChangedAt.current = Date.now();
    setStep((step + 1) as 2 | 3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStepError('');
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The click that moves to step 3 must not also submit the form.
    if (step < 3 || Date.now() - stepChangedAt.current < 400) {
      if (step < 3) goNext();
      return;
    }

    /*
     * Do not allow submission if the selected date
     * is unavailable.
     */

    if (isMealPrep) {
      if (
        !mealPrepForm.startDate ||
        !isValidDeliveryDays(mealPrepForm.deliveryDays) ||
        scheduledDeliveries.length === 0
      ) {
        return;
      }
    } else if (
      dateAvailability &&
      !dateAvailability.available
    ) {
      return;
    }

    /*
     * Guest count validation.
     */

    if (!isMealPrep && cateringForm.guestCount) {
      const guestCount = Number(
        cateringForm.guestCount
      );

      const maxGuests =
        operatorSettings.maxGuestsPerEvent;

      if (guestCount > maxGuests) {
        setGuestCountError(
          `Guest count (${guestCount}) exceeds the maximum allowed guests per event (${maxGuests}).`
        );

        return;
      }

      setGuestCountError('');
    }

    await saveAllergies();
    setDietaryRestrictions(dietary);
    

    /*
     * ==========================================================
     * MEAL PREP
     * ==========================================================
     */

    if (isMealPrep) {
      setCustomerBookingDraft({
        orderType: 'meal_prep',
        eventType: 'Meal Prep Subscription',
        eventDate: mealPrepForm.startDate,
        eventTime: mealPrepForm.fulfillmentTime,
        venue:
          mealPrepForm.fulfillmentMethod === 'delivery'
            ? mealPrepForm.address
            : 'Pickup at kitchen',
        guestCount: 1,
        fulfillmentMethod: mealPrepForm.fulfillmentMethod,
        specialRequests: [mealPrepForm.specialRequests, otherNote].filter(Boolean).join('\n'),
      
        // New subscription details
        subscriptionWeeks: mealPrepForm.subscriptionWeeks,
        deliveryDays: mealPrepForm.deliveryDays,
        scheduledDeliveries,
      });

      router.push(
        '/customer/meal-prep-preview'
      );

      return;
    }

    /*
     * ==========================================================
     * CATERING
     * ==========================================================
     */

    setCustomerBookingDraft({
      orderType: 'catering',

      eventType:
        cateringForm.eventType,

      eventDate:
        cateringForm.eventDate,

      eventTime:
        cateringForm.eventTime,

      venue:
        cateringForm.venue,

      guestCount:
        parseInt(
          cateringForm.guestCount,
          10
        ) || 1,

      specialRequests: [cateringForm.specialRequests, otherNote].filter(Boolean).join('\n'),
    });

    router.push(
      '/customer/browse'
    );
  };

  /*
   * ============================================================
   * INPUT STYLE
   * ============================================================
   */

  const inputClass =
    'w-full px-4 py-2.5 bg-white text-[#2B1D16] border border-[#E8D8C4] rounded-lg placeholder:text-[#2B1D16]/40 focus:outline-none focus:ring-2 focus:ring-[#C8431B]/40 focus:border-[#C8431B]';

  /*
   * ============================================================
   * AVAILABILITY BANNER
   * ============================================================
   */

  const availabilityBanner =
    activeDate &&
    dateAvailability &&
    !dateAvailability.available && (
      <div className="flex flex-col gap-2 rounded-lg border border-[#E3C7A8] bg-[#F6E3D3] p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#C8431B]" />

          <div className="space-y-1">
            <p className="text-sm font-medium text-[#2B1D16]">
              This date is not available.
            </p>

            <p className="text-sm text-[#2B1D16]/80">
              {dateAvailability.reason ??
                'The operator cannot accept bookings for this date.'}
            </p>
          </div>
        </div>

        {suggestedDate && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-[#2B1D16]">
              <Sparkles className="h-4 w-4" />

              Nearest open date:

              <span className="font-semibold">
                {formatDateLabel(
                  suggestedDate
                )}
              </span>
            </p>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={applySuggestedDate}
            >
              Use this date
            </Button>
          </div>
        )}
      </div>
    );

  /*
   * ============================================================
   * PAGE
   * ============================================================
   */

  return (
    <CustomerShell>
      <div className="max-w-3xl mx-auto space-y-8">

        {/* PAGE HEADER */}

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#C8431B] mb-2">
            Plan your order
          </p>
          <h1 className="font-heading uppercase text-4xl font-bold text-[#2B1D16]">
            {isMealPrep
              ? 'Start Meal Prep Plan'
              : 'Book Catering'}
          </h1>

          <p className="text-[#2B1D16]/70 mt-2">
            {isMealPrep
              ? 'Choose your subscription duration, delivery days, and preferred fulfillment schedule.'
              : 'Tell us about your one-time catering event'}
          </p>
        </div>

        {/* ORDER TYPE */}

        <div className="grid grid-cols-2 gap-4">

          <button
            type="button"
            onClick={() =>
              switchOrderType('catering')
            }
            className={`p-5 rounded-xl border-2 text-left transition-all ${
              !isMealPrep
                ? 'border-[#C8431B] bg-[#F6E3D3] shadow-sm'
                : 'border-[#E8D8C4] bg-white hover:border-[#C8431B]/50'
            }`}
          >
            <CalendarDays className="w-6 h-6 text-[#C8431B] mb-2" />

            <p className="font-heading uppercase font-bold text-[#2B1D16]">
              Catering Event
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Weddings, corporate events, parties
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              switchOrderType('meal_prep')
            }
            className={`p-5 rounded-xl border-2 text-left transition-all ${
              isMealPrep
                ? 'border-[#C8431B] bg-[#F6E3D3] shadow-sm'
                : 'border-[#E8D8C4] bg-white hover:border-[#C8431B]/50'
            }`}
          >
            <UtensilsCrossed className="w-6 h-6 text-[#C8431B] mb-2" />

            <p className="font-heading uppercase font-bold text-[#2B1D16]">
              Meal Prep Plan
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Recurring weekly or bi-weekly meals
            </p>
          </button>

        </div>

        {/* FORM */}

        <Card className="p-6 sm:p-8 rounded-2xl border border-[#E8D8C4] bg-white shadow-sm">
          {/* STEP INDICATOR */}
          <ol className="mb-6 flex items-center gap-2 text-xs font-semibold" aria-label="Progress">
            {(['Date & time', 'Delivery', 'Preferences'] as const).map((label, i) => {
              const n = i + 1;
              const done = step > n;
              const current = step === n;
              return (
                <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? 'step' : undefined}>
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${current || done ? 'bg-[#C8431B] text-white' : 'bg-[#F3E7D6] text-[#2B1D16]/60'}`}>{n}</span>
                  <span className={`hidden sm:block ${current ? 'text-[#2B1D16]' : 'text-[#2B1D16]/50'}`}>
                    {isMealPrep && n === 1 ? 'Plan & schedule' : label}
                  </span>
                  {n < 3 && <span className={`h-px flex-1 ${done ? 'bg-[#C8431B]' : 'bg-[#E8D8C4]'}`} />}
                </li>
              );
            })}
          </ol>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>

            {/* ================= STEP 1 : CATERING ================= */}
            {step === 1 && !isMealPrep && (
              <div className="space-y-6">
                <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B]">Event Details</h2>

                <div>
                  <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Event Type *</label>
                  <EventTypePicker
                    value={cateringForm.eventType}
                    inputClass={inputClass}
                    onChange={(eventType) => setCateringForm((f) => ({ ...f, eventType }))}
                  />
                </div>

                <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Event Time *</label>
                      <TimePicker
                        value={cateringForm.eventTime}
                        start={operatorSettings.operatingHoursStart}
                        end={operatorSettings.operatingHoursEnd}
                        onChange={(time) => setCateringForm((f) => ({ ...f, eventTime: time }))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Number of Guests *</label>
                      <NumberStepper
                        title="Guests"
                        unit="guests"
                        min={1}
                        max={operatorSettings.maxGuestsPerEvent}
                        value={cateringForm.guestCount}
                        error={guestCountError}
                        onChange={(guestCount) => setCateringForm((f) => ({ ...f, guestCount }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Event Date *</label>
                    <AvailabilityCalendar
                      value={cateringForm.eventDate}
                      onChange={(date) => setCateringForm({ ...cateringForm, eventDate: date })}
                      orderType={customerOrderType}
                      settings={operatorSettings}
                      bookings={availabilityBookings}
                    />
                  </div>
                </div>

                {loadingAvailability && cateringForm.eventDate && (
                  <p className="text-sm text-muted-foreground">Checking booking availability...</p>
                )}
                {availabilityBanner}
              </div>
            )}

            {/* ================= STEP 1 : MEAL PREP ================= */}
            {step === 1 && isMealPrep && (
              <div className="space-y-6">
                <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B]">Meal Prep Subscription</h2>
                <p className="text-sm text-muted-foreground">
                  Choose how long your subscription lasts, your start date, delivery days and time.
                </p>

                <div>
                  <label className="block text-sm font-semibold text-[#2B1D16] mb-3">Subscription Duration *</label>
                  <div className="grid grid-cols-3 gap-3">
                    {SUBSCRIPTION_WEEK_OPTIONS.map((weeks) => (
                      <button
                        key={weeks}
                        type="button"
                        onClick={() => setMealPrepForm((prev) => ({ ...prev, subscriptionWeeks: weeks }))}
                        className={`rounded-lg border-2 p-3 text-center transition-colors ${
                          mealPrepForm.subscriptionWeeks === weeks
                            ? 'border-[#C8431B] bg-[#F6E3D3] text-[#C8431B]'
                            : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
                        }`}
                      >
                        <p className="font-bold text-lg">{weeks}</p>
                        <p className="text-xs">{weeks === 1 ? 'Week' : 'Weeks'}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Preferred Delivery Days *</label>
                      <p className="text-xs text-muted-foreground mb-3">Select the days you want to receive your meals.</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[...WEEKDAYS.slice(1), WEEKDAYS[0]].map((day) => {
                          const selected = mealPrepForm.deliveryDays.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => toggleDeliveryDay(day.value)}
                              aria-pressed={selected}
                              className={`rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition-colors ${
                                selected
                                  ? 'border-[#C8431B] bg-[#F6E3D3] text-[#C8431B]'
                                  : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
                              }`}
                            >
                              {day.label.slice(0, 3)}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Preferred Pickup / Delivery Time *</label>
                      <TimePicker
                        value={mealPrepForm.fulfillmentTime}
                        start={operatorSettings.operatingHoursStart}
                        end={operatorSettings.operatingHoursEnd}
                        onChange={(time) => setMealPrepForm((prev) => ({ ...prev, fulfillmentTime: time }))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Preferred Start Date *</label>
                    <AvailabilityCalendar
                      value={mealPrepForm.startDate}
                      onChange={(date) => setMealPrepForm((prev) => ({ ...prev, startDate: date }))}
                      orderType={customerOrderType}
                      settings={operatorSettings}
                      bookings={availabilityBookings}
                    />
                  </div>
                </div>

                {loadingAvailability && mealPrepForm.startDate && (
                  <p className="text-sm text-muted-foreground">Checking booking availability...</p>
                )}
                {availabilityBanner}

              {/* DELIVERY SCHEDULE SUMMARY */}

              {mealPrepForm.startDate &&
                isValidDeliveryDays(mealPrepForm.deliveryDays) && (
                  <div className="rounded-xl border border-[#E8D8C4] bg-[#F6E3D3] p-4 text-sm text-[#2B1D16]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#C8431B]">
                      Your Delivery Schedule
                    </p>

                    <p className="mt-2">
                      <span className="font-semibold">
                        {scheduledDeliveries.length} scheduled deliveries
                      </span>
                      {' '}over {mealPrepForm.subscriptionWeeks}{' '}
                      {mealPrepForm.subscriptionWeeks === 1 ? 'week' : 'weeks'}.
                    </p>

                    <p className="mt-1 text-[#2B1D16]/70">
                      Preferred days:{' '}
                      {WEEKDAYS
                        .filter((day) =>
                          mealPrepForm.deliveryDays.includes(day.value)
                        )
                        .map((day) => day.label)
                        .join(', ')}
                    </p>

                    <p className="mt-1 text-[#2B1D16]/70">
                      Preferred time: {mealPrepForm.fulfillmentTime}
                    </p>

                    <div className="mt-4 border-t border-[#E8D8C4] pt-3">
                      <p className="font-semibold mb-2">
                        Planned delivery dates
                      </p>

                      <ul className="space-y-1">
                        {scheduledDeliveries.map((delivery, index) => (
                          <li key={`${delivery.date}-${index}`}>
                            Week {delivery.subscriptionWeek} —{' '}
                            {formatDateLabel(delivery.date)}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="mt-3 text-xs text-[#2B1D16]/60">
                      These are your preferred dates. The operator will
                      validate the final fulfillment schedule.
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* ================= STEP 2 : DELIVERY ================= */}
            {step === 2 && !isMealPrep && (
              <div className="space-y-4">
                <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B]">Delivery</h2>
                <label className="block text-sm font-semibold text-[#2B1D16]">Drop-off Location *</label>
                <LocationPicker
                  value={cateringForm.venue}
                  inputClass={inputClass}
                  onChange={(venue) => setCateringForm((f) => ({ ...f, venue }))}
                />
              </div>
            )}

            {step === 2 && isMealPrep && (
              <div className="space-y-5">
                <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B]">Delivery</h2>
                <div>
                  <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Fulfillment Method *</label>
                  <div className="flex gap-4">
                    {(['pickup', 'delivery'] as FulfillmentMethod[]).map((method) => (
                      <label
                        key={method}
                        className={`flex-1 flex items-center justify-center gap-2 cursor-pointer rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                          mealPrepForm.fulfillmentMethod === method
                            ? 'border-[#C8431B] bg-[#F6E3D3] text-[#C8431B]'
                            : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name="fulfillmentMethod"
                          checked={mealPrepForm.fulfillmentMethod === method}
                          onChange={() => setMealPrepForm((prev) => ({ ...prev, fulfillmentMethod: method }))}
                        />
                        <span className="capitalize">{method}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {mealPrepForm.fulfillmentMethod === 'delivery' && (
                  <div>
                    <label className="block text-sm font-semibold text-[#2B1D16] mb-2">Delivery Address *</label>
                    <LocationPicker
                      value={mealPrepForm.address}
                      inputClass={inputClass}
                      onChange={(address) => setMealPrepForm((prev) => ({ ...prev, address }))}
                    />
                  </div>
                )}
              </div>
            )}

            {/* ================= STEP 3 : PREFERENCES ================= */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B] mb-2">Special Requests</h2>
                  <textarea
                    value={isMealPrep ? mealPrepForm.specialRequests : cateringForm.specialRequests}
                    onChange={(e) =>
                      isMealPrep
                        ? setMealPrepForm((prev) => ({ ...prev, specialRequests: e.target.value }))
                        : setCateringForm({ ...cateringForm, specialRequests: e.target.value })
                    }
                    rows={4}
                    placeholder="Anything the caterer should know?"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-4 pt-6 border-t border-[#E8D8C4]">
                  <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#C8431B]">Dietary Restrictions</h2>
                  <AllergenPicker
                    options={allergenOptions}
                    selected={dietary}
                    onToggle={(a) => toggleAllergen(a as AllergenType)}
                    onClear={() => { setDietary([]); setOtherAllergy(''); }}
                  />
                  {dietary.includes('other' as AllergenType) && (
                    <div>
                      <label htmlFor="other-allergy" className="block text-sm font-semibold text-[#2B1D16] mb-2">Other allergy</label>
                      <input
                        id="other-allergy"
                        type="text"
                        value={otherAllergy}
                        onChange={(e) => setOtherAllergy(e.target.value)}
                        maxLength={120}
                        placeholder="Type the allergy, e.g. mango"
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {stepError && (
              <p role="alert" className="flex items-center gap-2 rounded-lg bg-[#F8DDD9] px-3 py-2 text-sm font-medium text-[#B3261E]">
                <AlertTriangle className="h-4 w-4 shrink-0" /> {stepError}
              </p>
            )}

            {/* ================= BUTTONS ================= */}
            <div className="flex gap-3 pt-6 border-t border-[#E8D8C4]">
              {step === 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-lg border-[#C8431B] px-5 text-[#C8431B] hover:bg-[#F6E3D3] hover:text-[#A93615]"
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 gap-2 rounded-lg border-[#C8431B] px-5 text-[#C8431B] hover:bg-[#F6E3D3] hover:text-[#A93615]"
                  onClick={goBack}
                >
                  <ArrowLeft className="size-4" aria-hidden="true" /> Back
                </Button>
              )}

              {step < 3 ? (
                <Button
                  key="next-btn"
                  type="button"
                  onClick={goNext}
                  disabled={loadingAvailability || Boolean(guestCountError)}
                  className="flex-1 h-11 gap-2 rounded-lg bg-[#C8431B] text-white font-semibold hover:bg-[#A93615] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  key="submit-btn"
                  type="submit"
                  disabled={Boolean(activeDate && dateAvailability && !dateAvailability.available) || loadingAvailability || Boolean(guestCountError)}
                  className="flex-1 h-11 rounded-lg bg-[#C8431B] text-white font-semibold hover:bg-[#A93615] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue to Menu Selection
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </CustomerShell>
  );
}