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

import { useEffect, useMemo, useState } from 'react';

import {
  CalendarDays,
  UtensilsCrossed,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

const ALLERGEN_OPTIONS: AllergenType[] = [
  'shellfish',
  'peanuts',
  'dairy',
  'gluten',
  'eggs',
  'soy',
  'tree_nuts',
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
          setAllergenOptions(normalizedOptions);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
        specialRequests: mealPrepForm.specialRequests,
      
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

      specialRequests:
        cateringForm.specialRequests,
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
    'w-full px-4 py-2.5 bg-white text-[#2A1B1F] border border-[#E8D2D2] rounded-lg placeholder:text-[#2A1B1F]/40 focus:outline-none focus:ring-2 focus:ring-[#9B1C2C]/40 focus:border-[#9B1C2C]';

  /*
   * ============================================================
   * AVAILABILITY BANNER
   * ============================================================
   */

  const availabilityBanner =
    dateAvailability &&
    !dateAvailability.available && (
      <div className="flex flex-col gap-2 rounded-lg border border-[#E8B4B4] bg-[#FDECEC] p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#9B1C2C]" />

          <div className="space-y-1">
            <p className="text-sm font-medium text-[#2A1B1F]">
              This date is not available.
            </p>

            <p className="text-sm text-[#2A1B1F]/80">
              {dateAvailability.reason ??
                'The operator cannot accept bookings for this date.'}
            </p>
          </div>
        </div>

        {suggestedDate && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-[#2A1B1F]">
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
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9B1C2C] mb-2">
            {isMealPrep ? 'Step 1 of 3' : 'Step 1 of 2'} · Plan your order
          </p>
          <h1 className="font-heading uppercase text-4xl font-bold text-[#2A1B1F]">
            {isMealPrep
              ? 'Start Meal Prep Plan'
              : 'Book Catering'}
          </h1>

          <p className="text-[#2A1B1F]/70 mt-2">
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
                ? 'border-[#9B1C2C] bg-[#FDECEC] shadow-sm'
                : 'border-[#E8D2D2] bg-white hover:border-[#9B1C2C]/50'
            }`}
          >
            <CalendarDays className="w-6 h-6 text-[#9B1C2C] mb-2" />

            <p className="font-heading uppercase font-bold text-[#2A1B1F]">
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
                ? 'border-[#9B1C2C] bg-[#FDECEC] shadow-sm'
                : 'border-[#E8D2D2] bg-white hover:border-[#9B1C2C]/50'
            }`}
          >
            <UtensilsCrossed className="w-6 h-6 text-[#9B1C2C] mb-2" />

            <p className="font-heading uppercase font-bold text-[#2A1B1F]">
              Meal Prep Plan
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Recurring weekly or bi-weekly meals
            </p>
          </button>

        </div>

        {/* FORM */}

        <Card className="p-6 sm:p-8 rounded-2xl border border-[#E8D2D2] bg-white shadow-sm">
          <form
            onSubmit={handleSubmit}
            className="space-y-8"
          >

            {/* ================================================= */}
            {/* CATERING */}
            {/* ================================================= */}

            {!isMealPrep ? (
              <div className="space-y-6">

                <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#9B1C2C]">
                  Event Details
                </h2>

                {/* EVENT TYPE */}

                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Event Type *
                  </label>

                  <EventTypePicker
                    value={cateringForm.eventType}
                    inputClass={inputClass}
                    onChange={(eventType) =>
                      setCateringForm((f) => ({ ...f, eventType }))
                    }
                  />
                  <input
                    type="text"
                    value={cateringForm.eventType}
                    onChange={() => {}}
                    required
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                </div>

                {/* DATE / TIME / GUESTS */}

                {/* DATE */}

                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Event Date *
                  </label>

                  <AvailabilityCalendar
                    value={cateringForm.eventDate}
                    onChange={(date) =>
                      setCateringForm({
                        ...cateringForm,
                        eventDate: date,
                      })
                    }
                    orderType={customerOrderType}
                    settings={operatorSettings}
                    bookings={availabilityBookings}
                      fill
                  />
                  <input
                    type="text"
                    value={cateringForm.eventDate}
                    onChange={() => {}}
                    required
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                </div>

                {/* TIME / GUESTS */}

                <div className="grid items-stretch gap-6 sm:grid-cols-2">

                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Event Time *
                    </label>

                    <div className="flex-1">
                      <TimePicker
                        value={cateringForm.eventTime}
                        start={operatorSettings.operatingHoursStart}
                        end={operatorSettings.operatingHoursEnd}
                        onChange={(time) =>
                          setCateringForm((f) => ({ ...f, eventTime: time }))
                        }
                      />
                    </div>
                    <input
                      type="text"
                      value={cateringForm.eventTime}
                      onChange={() => {}}
                      required
                      tabIndex={-1}
                      aria-hidden="true"
                      className="sr-only"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Number of Guests *
                    </label>

                    <div className="flex-1">
                      <NumberStepper
                        title="Guests"
                        unit="guests"
                        min={1}
                        max={operatorSettings.maxGuestsPerEvent}
                        value={cateringForm.guestCount}
                        error={guestCountError}
                        onChange={(guestCount) =>
                          setCateringForm((f) => ({ ...f, guestCount }))
                        }
                      />
                    </div>
                  </div>

                </div>

                

                {/* VENUE */}

                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Drop-off Location *
                  </label>

                  <LocationPicker
                    value={cateringForm.venue}
                    inputClass={inputClass}
                    onChange={(venue) =>
                      setCateringForm((f) => ({ ...f, venue }))
                    }
                  />
                  <input
                    type="text"
                    value={cateringForm.venue}
                    onChange={() => {}}
                    required
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                </div>

                {/* SPECIAL REQUESTS */}

                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Special Requests
                  </label>

                  <textarea
                    value={
                      cateringForm.specialRequests
                    }
                    onChange={(e) =>
                      setCateringForm({
                        ...cateringForm,
                        specialRequests:
                          e.target.value,
                      })
                    }
                    rows={4}
                    className={inputClass}
                  />
                </div>

              </div>
            ) : (

              /* ================================================= */
              /* MEAL PREP */
              /* ================================================= */

              
            <div className="space-y-6">
              <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#9B1C2C]">
                Meal Prep Subscription
              </h2>

              <p className="text-sm text-muted-foreground">
                Choose how long your subscription will last, your preferred
                delivery days, and your fulfillment time.
              </p>

              {/* SUBSCRIPTION DURATION */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-3">
                  Subscription Duration *
                </label>

                <div className="grid grid-cols-3 gap-3">
                  {SUBSCRIPTION_WEEK_OPTIONS.map((weeks) => (
                    <button
                      key={weeks}
                      type="button"
                      onClick={() =>
                        setMealPrepForm((prev) => ({
                          ...prev,
                          subscriptionWeeks: weeks,
                        }))
                      }
                      className={`rounded-lg border-2 p-4 text-center transition-colors ${
                        mealPrepForm.subscriptionWeeks === weeks
                          ? 'border-[#9B1C2C] bg-[#FDECEC] text-[#9B1C2C]'
                          : 'border-[#E8D2D2] bg-white text-[#2A1B1F] hover:border-[#9B1C2C]/50'
                      }`}
                    >
                      <p className="font-bold text-lg">{weeks}</p>
                      <p className="text-xs">
                        {weeks === 1 ? 'Week' : 'Weeks'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* START DATE */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                  Preferred Start Date *
                </label>

                <AvailabilityCalendar
                  value={mealPrepForm.startDate}
                  onChange={(date) =>
                    setMealPrepForm((prev) => ({
                      ...prev,
                      startDate: date,
                    }))
                  }
                  orderType={customerOrderType}
                  settings={operatorSettings}
                  bookings={availabilityBookings}
                />

                <input
                  type="text"
                  value={mealPrepForm.startDate}
                  onChange={() => {}}
                  required
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                />
              </div>

              {/* AVAILABILITY */}

              {loadingAvailability &&
                  cateringForm.eventDate && (
                    <p className="text-sm text-muted-foreground">
                      Checking booking availability...
                    </p>
                  )}

                {availabilityBanner}

              {/* DELIVERY DAYS */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                  Preferred Delivery Days *
                </label>

                <p className="text-xs text-muted-foreground mb-3">
                  Select the days you want to receive your meals.
                </p>

                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {[...WEEKDAYS.slice(1), WEEKDAYS[0]].map((day) => {
                    const selected = mealPrepForm.deliveryDays.includes(
                      day.value
                    );

                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDeliveryDay(day.value)}
                        aria-pressed={selected}
                        className={`rounded-lg border-2 px-2 py-3 text-sm font-semibold transition-colors ${
                          selected
                            ? 'border-[#9B1C2C] bg-[#FDECEC] text-[#9B1C2C]'
                            : 'border-[#E8D2D2] bg-white text-[#2A1B1F] hover:border-[#9B1C2C]/50'
                        }`}
                      >
                        {day.label.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>

                {mealPrepForm.deliveryDays.length === 0 && (
                  <p className="text-sm text-red-600 mt-2">
                    Please select at least one delivery day.
                  </p>
                )}
              </div>

              {/* FULFILLMENT TIME */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                  Preferred Pickup / Delivery Time *
                </label>

                <TimePicker
                  value={mealPrepForm.fulfillmentTime}
                  start={operatorSettings.operatingHoursStart}
                  end={operatorSettings.operatingHoursEnd}
                  onChange={(time) =>
                    setMealPrepForm((prev) => ({
                      ...prev,
                      fulfillmentTime: time,
                    }))
                  }
                />
              </div>

              {/* AVAILABILITY */}

              {availabilityBanner}

              {/* DELIVERY SCHEDULE SUMMARY */}

              {mealPrepForm.startDate &&
                isValidDeliveryDays(mealPrepForm.deliveryDays) && (
                  <div className="rounded-xl border border-[#E8D2D2] bg-[#FDECEC] p-4 text-sm text-[#2A1B1F]">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#9B1C2C]">
                      Your Delivery Schedule
                    </p>

                    <p className="mt-2">
                      <span className="font-semibold">
                        {scheduledDeliveries.length} scheduled deliveries
                      </span>
                      {' '}over {mealPrepForm.subscriptionWeeks}{' '}
                      {mealPrepForm.subscriptionWeeks === 1 ? 'week' : 'weeks'}.
                    </p>

                    <p className="mt-1 text-[#2A1B1F]/70">
                      Preferred days:{' '}
                      {WEEKDAYS
                        .filter((day) =>
                          mealPrepForm.deliveryDays.includes(day.value)
                        )
                        .map((day) => day.label)
                        .join(', ')}
                    </p>

                    <p className="mt-1 text-[#2A1B1F]/70">
                      Preferred time: {mealPrepForm.fulfillmentTime}
                    </p>

                    <div className="mt-4 border-t border-[#E8D2D2] pt-3">
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

                    <p className="mt-3 text-xs text-[#2A1B1F]/60">
                      These are your preferred dates. The operator will
                      validate the final fulfillment schedule.
                    </p>
                  </div>
                )}

              {/* FULFILLMENT METHOD */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                  Fulfillment Method *
                </label>

                <div className="flex gap-4">
                  {(['pickup', 'delivery'] as FulfillmentMethod[]).map(
                    (method) => (
                      <label
                        key={method}
                        className={`flex-1 flex items-center justify-center gap-2 cursor-pointer rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                          mealPrepForm.fulfillmentMethod === method
                            ? 'border-[#9B1C2C] bg-[#FDECEC] text-[#9B1C2C]'
                            : 'border-[#E8D2D2] bg-white text-[#2A1B1F] hover:border-[#9B1C2C]/50'
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          name="fulfillmentMethod"
                          checked={mealPrepForm.fulfillmentMethod === method}
                          onChange={() =>
                            setMealPrepForm((prev) => ({
                              ...prev,
                              fulfillmentMethod: method,
                            }))
                          }
                        />

                        <span className="capitalize">{method}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              {/* DELIVERY ADDRESS */}

              {mealPrepForm.fulfillmentMethod === 'delivery' && (
                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Delivery Address *
                  </label>

                  <LocationPicker
                    value={mealPrepForm.address}
                    inputClass={inputClass}
                    onChange={(address) =>
                      setMealPrepForm((prev) => ({
                        ...prev,
                        address,
                      }))
                    }
                  />

                  <input
                    type="text"
                    value={mealPrepForm.address}
                    onChange={() => {}}
                    required
                    tabIndex={-1}
                    aria-hidden="true"
                    className="sr-only"
                  />
                </div>
              )}

              {/* SPECIAL REQUESTS */}

              <div>
                <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                  Special Requests
                </label>

                <textarea
                  value={mealPrepForm.specialRequests}
                  onChange={(e) =>
                    setMealPrepForm((prev) => ({
                      ...prev,
                      specialRequests: e.target.value,
                    }))
                  }
                  rows={3}
                  className={inputClass}
                />
              </div>
            </div>
            )}
            {/* ================================================= */}
            {/* DIETARY RESTRICTIONS */}
            {/* ================================================= */}

            <div className="space-y-6 pt-6 border-t border-[#E8D2D2]">

              <h2 className="font-heading uppercase tracking-wide text-lg font-bold text-[#9B1C2C]">
                Dietary Restrictions
              </h2>

              <AllergenPicker
                options={allergenOptions}
                selected={dietary}
                onToggle={(a) => toggleAllergen(a as AllergenType)}
                onClear={() => setDietary([])}
              />
            </div>

            {/* ================================================= */}
            {/* BUTTONS */}
            {/* ================================================= */}

            <div className="flex gap-4 pt-6 border-t border-[#E8D2D2]">

              <Button
                type="submit"
                disabled={
                  Boolean(
                    dateAvailability &&
                      !dateAvailability.available
                  ) ||
                  loadingAvailability ||
                  Boolean(
                    guestCountError
                  )
                }
                className="flex-1 h-11 rounded-lg bg-[#9B1C2C] text-white font-semibold hover:bg-[#7F1623] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Menu Selection
              </Button>

              <Button
                type="button"
                variant="outline"
                className="flex-1 h-11 rounded-lg border-[#9B1C2C] text-[#9B1C2C] hover:bg-[#FDECEC] hover:text-[#7F1623]"
                onClick={() =>
                  router.back()
                }
              >
                Cancel
              </Button>

            </div>

          </form>
        </Card>
      </div>
    </CustomerShell>
  );
}