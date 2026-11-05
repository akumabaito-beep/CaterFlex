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
  MealPrepFrequency,
  OrderType,
} from '@/lib/types';
import {
  getDateAvailability,
  findNextAvailableDate,
} from '@/lib/rules/bookingValidation';
import { useRouter } from 'next/navigation';

import { EventTypePicker } from '@/components/booking/EventTypePicker';
import { AllergenPicker } from '@/components/booking/AllergenPicker';
import { TimePicker } from '@/components/booking/TimePicker';
import { OptionCardPicker } from '@/components/booking/OptionCardPicker';
import { NumberStepper } from '@/components/booking/NumberStepper';
import { LocationPicker } from '@/components/booking/LocationPicker';
import { AvailabilityCalendar } from '@/components/booking/AvailabilityCalendar';
import {
  MEAL_TYPES,
  PLAN_WEEKS,
  deliveryDaysLabel,
  deliveryDates,
  planEndDate,
  planTitle,
  totalDeliveries,
  type MealType,
  type PlanWeeks,
} from '@/lib/meal-plan';
import { DaysPicker } from '@/components/booking/DaysPicker';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

import { useEffect, useMemo, useState } from 'react';

import {
  CalendarDays,
  UtensilsCrossed,
  AlertTriangle,
  Sparkles,
  Repeat,
} from 'lucide-react';

const ALLERGEN_OPTIONS: AllergenType[] = [
  'shellfish',
  'fish',
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
    mealType: 'lunch' as MealType,
    planWeeks: 2 as PlanWeeks,
    deliveryDays: [1, 2, 3, 4, 5] as number[],
    startDate: '',
    fulfillmentTime: '10:00',
    frequency: 'weekly' as MealPrepFrequency,
    fulfillmentMethod: 'pickup' as FulfillmentMethod,
    servingsPerCycle: '',
    address: '',
    specialRequests: '',
  });

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

    if (
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

        eventType:
          planTitle(mealPrepForm.mealType),

        eventDate:
          mealPrepForm.startDate,

        eventTime:
          mealPrepForm.fulfillmentTime,

        venue:
          mealPrepForm.fulfillmentMethod ===
          'delivery'
            ? mealPrepForm.address
            : 'Pickup at kitchen',

        guestCount:
          parseInt(
            mealPrepForm.servingsPerCycle,
            10
          ) || 1,

        mealPrepFrequency:
          mealPrepForm.frequency,

        fulfillmentMethod:
          mealPrepForm.fulfillmentMethod,

        specialRequests:
          mealPrepForm.specialRequests,

        // subscription details; read back with readMealPlanDraft()
        ...({
          mealType: mealPrepForm.mealType,
          planWeeks: mealPrepForm.planWeeks,
          deliveryDays: mealPrepForm.deliveryDays,
        } as object),
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
              ? 'Set up a recurring weekly or bi-weekly meal prep order'
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

                {/* AVAILABILITY */}

                {loadingAvailability &&
                  cateringForm.eventDate && (
                    <p className="text-sm text-muted-foreground">
                      Checking booking availability...
                    </p>
                  )}

                {availabilityBanner}

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
                  Meal Prep Plan
                </h2>

                <p className="text-sm text-muted-foreground">
                  Your plan repeats on a schedule.
                  The operator validates fulfillment
                  day capacity separately from catering
                  events.
                </p>

                {/* MEAL TYPE / PLAN LENGTH */}

                <div className="grid items-stretch gap-6 md:grid-cols-2">
                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Meal plan *
                    </label>
                    <div className="flex-1">
                      <OptionCardPicker<MealType>
                        title="Which meal?"
                        icon={UtensilsCrossed}
                        value={mealPrepForm.mealType}
                        onChange={(mealType) =>
                          setMealPrepForm((f) => ({ ...f, mealType }))
                        }
                        options={MEAL_TYPES}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Plan length *
                    </label>
                    <div className="flex-1">
                      <OptionCardPicker<`${PlanWeeks}`>
                        title="How long?"
                        icon={CalendarDays}
                        value={`${mealPrepForm.planWeeks}`}
                        onChange={(v) =>
                          setMealPrepForm((f) => ({ ...f, planWeeks: Number(v) as PlanWeeks }))
                        }
                        options={PLAN_WEEKS.map((n) => ({
                          value: `${n}` as `${PlanWeeks}`,
                          label: `${n} ${n === 1 ? 'week' : 'weeks'}`,
                          hint: `${totalDeliveries(n, mealPrepForm.deliveryDays)} deliveries`,
                        }))}
                      />
                    </div>
                  </div>
                </div>

                {/* DATE / TIME */}

                <div className="grid items-start md:grid-cols-2 gap-6">

                  <div>
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      First Fulfillment Date *
                    </label>

                    <AvailabilityCalendar
                      value={mealPrepForm.startDate}
                      onChange={(date) =>
                        setMealPrepForm({
                          ...mealPrepForm,
                          startDate: date,
                        })
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

                  <div>
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Pickup / Delivery Time *
                    </label>

                    <TimePicker
                      value={mealPrepForm.fulfillmentTime}
                      start={operatorSettings.operatingHoursStart}
                      end={operatorSettings.operatingHoursEnd}
                      onChange={(time) =>
                        setMealPrepForm((f) => ({ ...f, fulfillmentTime: time }))
                      }
                    />
                    <input
                      type="text"
                      value={mealPrepForm.fulfillmentTime}
                      onChange={() => {}}
                      required
                      tabIndex={-1}
                      aria-hidden="true"
                      className="sr-only"
                    />
                  </div>

                </div>

                {/* AVAILABILITY */}

                {availabilityBanner}

                {/* DELIVERY DAYS / SERVINGS */}

                <div className="grid items-stretch md:grid-cols-2 gap-6">

                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Delivery days *
                    </label>

                    <div className="flex-1">
                      <DaysPicker
                        value={mealPrepForm.deliveryDays}
                        onChange={(deliveryDays) =>
                          setMealPrepForm((f) => ({ ...f, deliveryDays }))
                        }
                      />
                      <input
                        type="text"
                        value={mealPrepForm.deliveryDays.join(',')}
                        onChange={() => {}}
                        required
                        tabIndex={-1}
                        aria-hidden="true"
                        className="sr-only"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Servings per delivery *
                    </label>

                    <div className="flex-1">
                      <NumberStepper
                        title="Servings"
                        unit="meals"
                        min={1}
                        value={mealPrepForm.servingsPerCycle}
                        onChange={(servingsPerCycle) =>
                          setMealPrepForm((f) => ({ ...f, servingsPerCycle }))
                        }
                      />
                    </div>
                  </div>

                </div>

                {/* SCHEDULE SUMMARY */}

                {mealPrepForm.startDate && mealPrepForm.deliveryDays.length > 0 && (() => {
                  const fmt = (d: string) =>
                    new Date(`${d}T12:00:00`).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
                  const first = deliveryDates(mealPrepForm.startDate, 1, mealPrepForm.deliveryDays)[0]
                  const last = planEndDate(mealPrepForm.startDate, mealPrepForm.planWeeks, mealPrepForm.deliveryDays)
                  const count = totalDeliveries(mealPrepForm.planWeeks, mealPrepForm.deliveryDays)
                  return (
                    <div className="rounded-xl border border-[#E8D2D2] bg-[#FDECEC] p-4 text-sm text-[#2A1B1F]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#9B1C2C]">
                        Your delivery schedule
                      </p>
                      <p className="mt-1 font-semibold">
                        {deliveryDaysLabel(mealPrepForm.deliveryDays)} for {mealPrepForm.planWeeks}{' '}
                        {mealPrepForm.planWeeks === 1 ? 'week' : 'weeks'}, starting {fmt(first)}.
                      </p>
                      <p className="mt-1 text-[#2A1B1F]/70">
                        {count} deliveries, last one on {fmt(last)}. You can pause, skip a delivery,
                        cancel or renew anytime from Meal Plans.
                      </p>
                    </div>
                  )
                })()}

                {/* FULFILLMENT METHOD */}

                <div>
                  <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                    Fulfillment Method *
                  </label>

                  <div className="flex gap-4">

                    {(
                      [
                        'pickup',
                        'delivery',
                      ] as FulfillmentMethod[]
                    ).map((method) => (
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
                          checked={
                            mealPrepForm.fulfillmentMethod ===
                            method
                          }
                          onChange={() =>
                            setMealPrepForm({
                              ...mealPrepForm,
                              fulfillmentMethod:
                                method,
                            })
                          }
                        />

                        <span className="capitalize">
                          {method}
                        </span>
                      </label>
                    ))}

                  </div>
                </div>

                {/* DELIVERY ADDRESS */}

                {mealPrepForm.fulfillmentMethod ===
                  'delivery' && (
                  <div>
                    <label className="block text-sm font-semibold text-[#2A1B1F] mb-2">
                      Delivery Address *
                    </label>

                    <LocationPicker
                      value={mealPrepForm.address}
                      inputClass={inputClass}
                      onChange={(address) =>
                        setMealPrepForm((f) => ({ ...f, address }))
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
                    value={
                      mealPrepForm.specialRequests
                    }
                    onChange={(e) =>
                      setMealPrepForm({
                        ...mealPrepForm,
                        specialRequests:
                          e.target.value,
                      })
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
