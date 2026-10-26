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
    mealPrepDaySelections,
    setActiveMealPrepDay,
    selectedMenuItemIds,
    selectMenuItem,
    deselectMenuItem,
  } = useAppState();

  const isMealPrep = customerOrderType === 'meal_prep';

  useEffect(() => {
    loadOperatorSettings();
  }, [loadOperatorSettings]);


  
const MEAL_PERIOD_OPTIONS = [
  'Breakfast',
  'Lunch',
  'Dinner',
] as const;

const DELIVERY_DAY_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const;

type MealPeriod = (typeof MEAL_PERIOD_OPTIONS)[number];

const toggleDeliveryDay = (day: number) => {
  setMealPrepForm((prev) => {
    const selected = prev.deliveryDays.includes(day);

    return {
      ...prev,
      deliveryDays: selected
        ? prev.deliveryDays.filter((item) => item !== day)
        : [...prev.deliveryDays, day].sort((a, b) => a - b),
      mealPeriodTimes: selected
        ? Object.fromEntries(
            Object.entries(prev.mealPeriodTimes).filter(
              ([key]) => Number(key) !== day
            )
          )
        : prev.mealPeriodTimes,
    };
  });
};

const handleChooseDishes = (day: number) => {
  // Restore this day's saved dishes in the existing Browse selection state.
  const savedIds =
    mealPrepDaySelections[day]
      ? Array.from(
          new Set(
            Object.values(mealPrepDaySelections[day] ?? {})
              .flatMap((meal) => meal?.menuItemIds ?? [])
          )
        )
      : [];

  // Clear the current selection before loading this day's dishes.
  selectedMenuItemIds.forEach((id) => {
    deselectMenuItem(id);
  });

  savedIds.forEach((id) => {
    selectMenuItem(id);
  });

  setActiveMealPrepDay(day);
  router.push('/customer/browse');
};

const toggleMealForDay = (
  day: number,
  period: MealPeriod
) => {
  setMealPrepForm((prev) => {
    const dayTimes = { ...(prev.mealPeriodTimes[day] ?? {}) };

    if (dayTimes[period]) {
      delete dayTimes[period];
    } else {
      dayTimes[period] =
        operatorSettings.operatingHoursStart || '08:00';
    }

    const mealPeriodTimes = { ...prev.mealPeriodTimes };

    if (Object.keys(dayTimes).length === 0) {
      delete mealPeriodTimes[day];
    } else {
      mealPeriodTimes[day] = dayTimes;
    }

    return { ...prev, mealPeriodTimes };
  });
};


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
  planName: '',
  startDate: '',
  deliveryDays: [] as number[],
  mealPeriodTimes: {} as Record<
    number,
    Partial<Record<'Breakfast' | 'Lunch' | 'Dinner', string>>
  >,
  fulfillmentMethod: 'pickup' as FulfillmentMethod,
  servingsPerCycle: '',
  address: '',
  specialRequests: '',
  autoRenew: true,
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
      const selectedDays = mealPrepForm.deliveryDays;

      if (selectedDays.length === 0) {
        alert('Please select at least one fulfillment day.');
        return;
      }

      const hasSelectedMeals = selectedDays.some((day) =>
        MEAL_PERIOD_OPTIONS.some(
          (period) => Boolean(mealPrepForm.mealPeriodTimes[day]?.[period])
        )
      );

      if (!hasSelectedMeals) {
        alert('Please select at least one meal for your selected days.');
        return;
      }

      const missingTime = selectedDays.some((day) =>
        MEAL_PERIOD_OPTIONS.some((period) => {
          const selected = mealPrepForm.mealPeriodTimes[day]?.[period];
      
          return selected !== undefined && selected.trim() === '';
        })
      );

      if (missingTime) {
        alert('Please set a preferred time for every selected meal.');
        return;
      }

      if (!mealPrepForm.startDate) {
        alert('Please choose a subscription start date.');
        return;
      }

      if (
        !mealPrepForm.servingsPerCycle ||
        Number(mealPrepForm.servingsPerCycle) < 1
      ) {
        alert('Please enter at least one serving per selected meal.');
        return;
      }

      const firstDay = selectedDays[0];
      const firstPeriod = MEAL_PERIOD_OPTIONS.find(
        (period) => Boolean(mealPrepForm.mealPeriodTimes[firstDay]?.[period])
      );

      if (!firstPeriod) {
        alert('Please select a meal for your first fulfillment day.');
        return;
      }

      const firstTime = mealPrepForm.mealPeriodTimes[firstDay]?.[firstPeriod];

      setCustomerBookingDraft({
        orderType: 'meal_prep',
        eventType: mealPrepForm.planName,
        eventDate: mealPrepForm.startDate,
        eventTime: firstTime || '',
        venue:
          mealPrepForm.fulfillmentMethod === 'delivery'
            ? mealPrepForm.address
            : 'Pickup at kitchen',
        guestCount: Number(mealPrepForm.servingsPerCycle),
        fulfillmentMethod: mealPrepForm.fulfillmentMethod,
        specialRequests: mealPrepForm.specialRequests,
        mealPrepStartDate: mealPrepForm.startDate,
        deliveryDays: selectedDays,
        mealPeriodTimes: mealPrepForm.mealPeriodTimes,
        mealPeriods: MEAL_PERIOD_OPTIONS.filter((period) =>
          selectedDays.some(
            (day) => Boolean(mealPrepForm.mealPeriodTimes[day]?.[period])
          )
        ),
        deliveryTimes: Object.fromEntries(
          selectedDays.map((day) => [
            day,
            mealPrepForm.mealPeriodTimes[day]?.[
              MEAL_PERIOD_OPTIONS.find(
                (period) => Boolean(mealPrepForm.mealPeriodTimes[day]?.[period])
              )!
            ] ?? '',
          ])
        ),
        servingsPerCycle: Number(mealPrepForm.servingsPerCycle),
        autoRenew: mealPrepForm.autoRenew,
      });

    
      router.push('/customer/meal-prep-preview');
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
    'w-full px-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent';

  /*
   * ============================================================
   * AVAILABILITY BANNER
   * ============================================================
   */

  const availabilityBanner =
    dateAvailability &&
    !dateAvailability.available && (
      <div className="flex flex-col gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-4">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-yellow-700" />

          <div className="space-y-1">
            <p className="text-sm font-medium text-yellow-900">
              This date is not available.
            </p>

            <p className="text-sm text-yellow-800">
              {dateAvailability.reason ??
                'The operator cannot accept bookings for this date.'}
            </p>
          </div>
        </div>

        {suggestedDate && (
          <div className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-2">
            <p className="flex items-center gap-2 text-sm text-yellow-900">
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
          <h1 className="font-heading text-3xl font-bold text-surface-foreground">
            {isMealPrep
              ? 'Start Meal Prep Plan'
              : 'Book Catering'}
          </h1>

          <p className="text-surface-muted-foreground mt-2">
            {isMealPrep
              ? 'Set up an ongoing subscription with recurring meals each week'
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
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              !isMealPrep
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <CalendarDays className="w-6 h-6 text-primary mb-2" />

            <p className="font-heading font-bold text-card-foreground">
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
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              isMealPrep
                ? 'border-primary bg-primary/10'
                : 'border-border bg-card hover:border-primary/40'
            }`}
          >
            <UtensilsCrossed className="w-6 h-6 text-secondary mb-2" />

            <p className="font-heading font-bold text-card-foreground">
              Meal Prep Plan
            </p>

            <p className="text-xs text-muted-foreground mt-1">
              Flexible subscription meal plans
            </p>
          </button>

        </div>

        {/* FORM */}

        <Card className="p-8">
          <form
            onSubmit={handleSubmit}
            className="space-y-8"
          >

            {/* ================================================= */}
            {/* CATERING */}
            {/* ================================================= */}

            {!isMealPrep ? (
              <div className="space-y-6">

                <h2 className="text-lg font-bold text-card-foreground">
                  Event Details
                </h2>

                {/* EVENT TYPE */}

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Event Type *
                  </label>

                  <input
                    type="text"
                    placeholder="Wedding, Corporate Lunch, Birthday Party, etc."
                    value={
                      cateringForm.eventType
                    }
                    onChange={(e) =>
                      setCateringForm({
                        ...cateringForm,
                        eventType:
                          e.target.value,
                      })
                    }
                    required
                    className={inputClass}
                  />
                </div>

                {/* DATE / TIME / GUESTS */}

                <div className="grid md:grid-cols-3 gap-6">

                  {/* DATE */}

                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-2">
                      Event Date *
                    </label>

                    <input
                      type="date"
                      value={
                        cateringForm.eventDate
                      }
                      onChange={(e) =>
                        setCateringForm({
                          ...cateringForm,
                          eventDate:
                            e.target.value,
                        })
                      }
                      required
                      className={inputClass}
                    />
                  </div>

                  {/* TIME */}

                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-2">
                      Event Time *
                    </label>

                    <input
                      type="time"
                      value={
                        cateringForm.eventTime
                      }
                      onChange={(e) =>
                        setCateringForm({
                          ...cateringForm,
                          eventTime:
                            e.target.value,
                        })
                      }
                      required
                      className={inputClass}
                    />
                  </div>

                  {/* GUEST COUNT */}

                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-2">
                      Number of Guests *
                    </label>

                    <input
                      type="number"
                      min="1"
                      max={operatorSettings.maxGuestsPerEvent}
                      value={cateringForm.guestCount}
                      onChange={(e) =>
                        setCateringForm({
                          ...cateringForm,
                          guestCount: e.target.value,
                        })
                      }
                      required
                      className={inputClass}
                    />

                    <p className="mt-1 text-xs text-muted-foreground">
                      Maximum: {operatorSettings.maxGuestsPerEvent} guests
                    </p>

                    {guestCountError && (
                      <p className="mt-1 text-xs text-red-600">
                        {guestCountError}
                      </p>
                    )}
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
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Venue *
                  </label>

                  <input
                    type="text"
                    placeholder="Location of your event"
                    value={
                      cateringForm.venue
                    }
                    onChange={(e) =>
                      setCateringForm({
                        ...cateringForm,
                        venue:
                          e.target.value,
                      })
                    }
                    required
                    className={inputClass}
                  />
                </div>

                {/* SPECIAL REQUESTS */}

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
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

                <h2 className="text-lg font-bold text-card-foreground">
                  Meal Prep Plan
                </h2>

                <p className="text-sm text-muted-foreground">
                  Your plan repeats on a schedule.
                  The operator validates fulfillment
                  day capacity separately from catering
                  events.
                </p>

                {/* PLAN NAME */}

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Plan Name *
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Weekly Fitness Meals, Family Lunch Prep"
                    value={
                      mealPrepForm.planName
                    }
                    onChange={(e) =>
                      setMealPrepForm({
                        ...mealPrepForm,
                        planName:
                          e.target.value,
                      })
                    }
                    required
                    className={inputClass}
                  />
                </div>

                {/* DATE / TIME */}

                
                {/* SUBSCRIPTION START DATE */}
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Start Date *
                  </label>

                  <input
                    type="date"
                    min={new Date().toLocaleDateString('en-CA')}
                    value={mealPrepForm.startDate}
                    onChange={(e) =>
                      setMealPrepForm((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                    required
                    className={inputClass}
                  />

                  <p className="mt-1 text-xs text-muted-foreground">
                    Your subscription continues until you request cancellation
                    or the owner terminates it under the subscription policy.
                  </p>
                </div>

                {/* FULFILLMENT METHOD */}

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
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
                        className="flex items-center gap-2 cursor-pointer text-sm text-card-foreground"
                      >
                        <input
                          type="radio"
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

                {/* DELIVERY DAYS */}
                <div>
                  <h3 className="text-sm font-medium text-card-foreground mb-3">
                  Which days would you like to receive your meals? *
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {DELIVERY_DAY_OPTIONS.map((day) => (
                      <label
                        key={day.value}
                        className="flex items-center gap-2 rounded-lg border border-border p-3 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={mealPrepForm.deliveryDays.includes(day.value)}
                          onChange={() => toggleDeliveryDay(day.value)}
                        />
                        <span className="text-sm">{day.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* DISH SELECTION FOR EACH DAY */}
                  {mealPrepForm.deliveryDays.length > 0 && (
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium text-card-foreground">
                          Choose dishes for each day *
                        </h3>

                        <p className="mt-1 text-xs text-muted-foreground">
                          Select dishes and preferred times separately for every day.
                        </p>
                      </div>

                      {mealPrepForm.deliveryDays.map((dayValue) => {
                        const day = DELIVERY_DAY_OPTIONS.find(
                          (item) => item.value === dayValue
                        );

                        const selections =
                          mealPrepDaySelections[dayValue] ?? {};

                        const selectedMealCount = Object.values(
                          selections
                        ).filter(
                          (meal) => (meal?.menuItemIds.length ?? 0) > 0
                        ).length;

                        const selectedDishCount = Array.from(
                          new Set(
                            Object.values(selections).flatMap(
                              (meal) => meal?.menuItemIds ?? []
                            )
                          )
                        ).length;

                        return (
                          <div
                            key={dayValue}
                            className="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
                          >
                            <div>
                              <p className="font-medium text-card-foreground">
                                {day?.label}
                              </p>

                              <p className="mt-1 text-xs text-muted-foreground">
                                {selectedDishCount > 0
                                  ? `${selectedDishCount} dish(es) selected across ${selectedMealCount} meal period(s)`
                                  : 'No dishes selected yet'}
                              </p>
                            </div>

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleChooseDishes(dayValue)}
                            >
                              {selectedDishCount > 0
                                ? 'Edit Dishes'
                                : 'Choose Dishes'}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* SERVINGS */}
                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
                    Servings per selected meal *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={mealPrepForm.servingsPerCycle}
                    onChange={(e) =>
                      setMealPrepForm((prev) => ({
                        ...prev,
                        servingsPerCycle: e.target.value,
                      }))
                    }
                    required
                    className={inputClass}
                    placeholder="Number of servings"
                  />
                </div>

                {/* RENEWAL */}
                <div>
                  <label className="flex items-center gap-3 text-sm text-card-foreground">
                    <input
                      type="checkbox"
                      checked={mealPrepForm.autoRenew}
                      onChange={(e) =>
                        setMealPrepForm((prev) => ({
                          ...prev,
                          autoRenew: e.target.checked,
                        }))
                      }
                    />
                    Automatically renew this subscription
                  </label>
                </div>

                {/* DELIVERY ADDRESS */}

                {mealPrepForm.fulfillmentMethod ===
                  'delivery' && (
                  <div>
                    <label className="block text-sm font-medium text-card-foreground mb-2">
                      Delivery Address *
                    </label>

                    <input
                      type="text"
                      placeholder="Street, city, delivery notes"
                      value={
                        mealPrepForm.address
                      }
                      onChange={(e) =>
                        setMealPrepForm({
                          ...mealPrepForm,
                          address:
                            e.target.value,
                        })
                      }
                      required
                      className={inputClass}
                    />
                  </div>
                )}

                {/* SPECIAL REQUESTS */}

                <div>
                  <label className="block text-sm font-medium text-card-foreground mb-2">
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

            <div className="space-y-6 pt-6 border-t border-border">

              <h2 className="text-lg font-bold text-card-foreground">
                Dietary Restrictions
              </h2>

              <div className="grid md:grid-cols-2 gap-4">

                {allergenOptions.map(
                  (allergen) => (
                    <label
                      key={allergen}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={dietary.includes(
                          allergen
                        )}
                        onChange={() =>
                          toggleAllergen(
                            allergen
                          )
                        }
                        className="w-4 h-4 border-border rounded"
                      />

                      <span className="text-sm text-card-foreground capitalize">
                        {allergen.replace(
                          '_',
                          ' '
                        )}
                      </span>
                    </label>
                  )
                )}

              </div>
            </div>

            {/* ================================================= */}
            {/* BUTTONS */}
            {/* ================================================= */}

            <div className="flex gap-4 pt-6 border-t border-border">

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
                className="flex-1 bg-primary text-white font-medium hover:bg-brand disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Menu Selection
              </Button>

              <Button
                type="button"
                variant="outline"
                className="flex-1"
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
