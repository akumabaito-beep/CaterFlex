'use client';

import Image from 'next/image';
import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, CheckCircle2, Plus, X, CalendarDays, Clock, Users, Repeat, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { estimateOrder, MAX_DELIVERY_KM } from '@/lib/pricing';
import { supabase } from '@/lib/supabase';
import { cancelMealPrepOrder, createBooking, createMealPrepOrder } from '@/app/actions/booking-actions';
import { saveMealPlanDetails } from '@/app/actions/meal-plan-actions';
import { readSubscriptionDraft, deliveryDaysLabel, totalDeliveries } from '@/lib/meal-plan';
import { getCustomerAllergies } from '@/app/actions/allergy-actions';
import {
  checkAllergenConflict,
  getUniqueConflictingAllergens,
} from '@/lib/rules/allergenFiltering';
import type { MenuItem } from '@/lib/types';


export default function BrowsePage() {
  const router = useRouter();

  const {
    currentUser,
    selectedMenuItemIds,
    customerDietaryRestrictions,
    setDietaryRestrictions,
    selectMenuItem,
    deselectMenuItem,
    customerBookingDraft,
    customerOrderType,
    clearCustomerSession,
  } = useAppState();

  const [dbMenuItems, setDbMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [showAllergenConfirm, setShowAllergenConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBookingSuccess, setShowBookingSuccess] = useState(false);

  /*
   * Load menu items from Supabase.
   */
  useEffect(() => {
    const loadMenuItems = async () => {
      try {
        setLoadingMenu(true);

        // Get menu items
        const { data: menuData, error: menuError } = await supabase
        .from('MENU_ITEM')
        .select(
          'MenuItemID, ItemName, Category, Price, PrepTimeDays, Description, PhotoURL'
        )
        .order('MenuItemID');

        if (menuError) {
          console.error('MENU_ITEM loading error:', menuError);
          alert(`Failed to load menu items: ${menuError.message}`);
          return;
        }

        // Get menu item ↔ allergy relationships
        const {
          data: allergyRelations,
          error: allergyRelationError,
        } = await supabase
          .from('MENU_ITEM_ALLERGY')
          .select(`
            MenuItemID,
            AllergyTagID
          `);

        if (allergyRelationError) {
          console.error(
            'MENU_ITEM_ALLERGY loading error:',
            allergyRelationError
          );

          alert(
            `Failed to load menu allergen information: ${allergyRelationError.message}`
          );

          return;
        }

        // Get allergy tag names
        const {
          data: allergyTags,
          error: allergyTagError,
        } = await supabase
          .from('ALLERGY_TAG')
          .select(`
            AllergyTagID,
            AllergenName
          `);

        if (allergyTagError) {
          console.error(
            'ALLERGY_TAG loading error:',
            allergyTagError
          );

          alert(
            `Failed to load allergen information: ${allergyTagError.message}`
          );

          return;
        }

        // Convert database menu items into application's MenuItem format
        const formattedItems: MenuItem[] = (menuData ?? []).map(
          (item: {
            MenuItemID: number;
            ItemName: string;
            Category: string;
            Price: number;
            PrepTimeDays: number;
            Description: string | null;
            PhotoURL: string | null;
          }) => {
            const itemAllergyRelations =
              (allergyRelations ?? []).filter(
                (relation) =>
                  relation.MenuItemID === item.MenuItemID
              );
        
            const itemAllergyNames = itemAllergyRelations
              .map((relation) => {
                const allergyTag = (allergyTags ?? []).find(
                  (tag) =>
                    tag.AllergyTagID === relation.AllergyTagID
                );
        
                return allergyTag?.AllergenName;
              })
              .filter(
                (name): name is string => Boolean(name)
              );
        
            return {
              id: String(item.MenuItemID),
              name: item.ItemName,
              description: item.Description ?? '',
              category: item.Category as MenuItem['category'],
              price: Number(item.Price ?? 0),
              prepTimeDays: Number(item.PrepTimeDays ?? 0),
        
              // IMPORTANT: this is the uploaded Supabase photo
              photoUrl: item.PhotoURL ?? undefined,
        
              allergyTags:
                itemAllergyNames as MenuItem['allergyTags'],
        
              macros: {
                carbs: 0,
                protein: 0,
                fat: 0,
              },
        
              requiredIngredients: [],
              inventoryStatus: 'available',
            };
          }
        );

        console.log('Loaded menu items:', formattedItems);

        setDbMenuItems(formattedItems);
      } catch (error) {
        console.error('Unexpected menu loading error:', error);
        alert('Something went wrong while loading the menu.');
      } finally {
        setLoadingMenu(false);
      }
    };

    loadMenuItems();
  }, []);

  /*
   * Load the customer's saved allergies from Supabase.
   */
  useEffect(() => {
    const loadCustomerAllergies = async () => {
      if (!currentUser?.id) {
        setDietaryRestrictions([]);
        return;
      }

      // Get the customer's saved allergy relationships through the server action.
      const customerAllergiesResult = await getCustomerAllergies();

      if (!customerAllergiesResult.ok) {
        console.error(
          'Customer allergy loading error:',
          customerAllergiesResult.error
        );

        return;
      }

      const allergyTagIds = customerAllergiesResult.allergyTagIds;

      // Customer has no saved allergies
      if (allergyTagIds.length === 0) {
        setDietaryRestrictions([]);
        return;
      }

      // Get actual allergen names
      const {
        data: allergyTags,
        error: allergyTagError,
      } = await supabase
        .from('ALLERGY_TAG')
        .select('AllergyTagID, AllergenName')
        .in('AllergyTagID', allergyTagIds);

      if (allergyTagError) {
        console.error(
          'Allergy tag loading error:',
          allergyTagError
        );

        return;
      }

      const allergies = (allergyTags ?? [])
        .map(
          (tag) =>
            tag.AllergenName as MenuItem['allergyTags'][number]
        )
        .filter(Boolean);

      console.log('Loaded customer allergies:', allergies);

      setDietaryRestrictions(allergies);
    };

    loadCustomerAllergies();
  }, [currentUser?.id, setDietaryRestrictions]);

  /*
   * Get currently selected menu items.
   */
  const categories = [
    'All',
    ...Array.from(
      new Set(
        dbMenuItems
          .map((item) => item.category?.trim())
          .filter((category): category is string => Boolean(category))
      )
    ).sort((a, b) => a.localeCompare(b)),
  ];
  
  const filteredMenuItems =
    selectedCategory === 'All'
      ? dbMenuItems
      : dbMenuItems.filter(
          (item) => item.category?.trim() === selectedCategory
        );

  const selectedItems = dbMenuItems.filter((item) =>
    selectedMenuItemIds.includes(item.id)
  );

  /*
   * Check selected items against customer's allergies.
   */
  const conflictingAllergens = getUniqueConflictingAllergens(
    selectedItems,
    customerDietaryRestrictions
  );

  const hasSelectionConflicts = conflictingAllergens.length > 0;

  /*
   * Estimated cost shown before the customer confirms.
   */
  const estimate = estimateOrder({
    itemPrices: selectedItems.map((item) => item.price),
    servings: parseInt(String(customerBookingDraft.guestCount || '0'), 10) || 0,
    venue: String(customerBookingDraft.venue ?? ''),
    delivers:
      customerBookingDraft.orderType !== 'meal_prep' ||
      customerBookingDraft.fulfillmentMethod === 'delivery',
  });
  const peso = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /*
   * Submit the booking to Supabase.
   */
  const finalizeSubmit = async () => {
    if (isSubmitting) {
      return;
    }
  
    setIsSubmitting(true);
  
    try {
      const eventDate = String(
        customerBookingDraft.eventDate ?? ''
      ).trim();
  
      const eventTime = String(
        customerBookingDraft.eventTime ?? ''
      ).trim();
  
      const venue = String(
        customerBookingDraft.venue ?? ''
      ).trim();
  
      const guestCount = parseInt(
        String(customerBookingDraft.guestCount || '1'),
        10
      );

      if (!eventDate) {
        alert('Please select an event date.');
        setIsSubmitting(false);
        return;
      }
      
      if (!eventTime) {
        alert('Please select an event time.');
        setIsSubmitting(false);
        return;
      }
      
      if (!venue) {
        alert('Please enter a venue.');
        setIsSubmitting(false);
        return;
      }
      
      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        alert('Please enter a valid guest count.');
        setIsSubmitting(false);
        return;
      }
  
      // Validate customer account
      if (!currentUser?.id) {
        alert(
          'Unable to identify your customer account. Please log in again.'
        );
        setIsSubmitting(false);
        return;
      }
  
      const customerId = Number(currentUser.id);
  
      if (Number.isNaN(customerId)) {
        alert('Invalid customer account. Please log in again.');
        setIsSubmitting(false);
        return;
      }

      // Make sure the selected menu items actually exist in Supabase.
      const validMenuItemIds = selectedMenuItemIds.filter(
        (menuItemId) =>
          dbMenuItems.some((item) => item.id === menuItemId)
      );
  
      if (validMenuItemIds.length === 0) {
        alert('Please select at least one valid menu item.');
        setIsSubmitting(false);
        return;
      }

      const selectedItems = validMenuItemIds.map((menuItemId) => ({
        MenuItemID: Number(menuItemId),
        Quantity: 1,
      }));
      const isMealPrepOrder = customerOrderType === 'meal_prep' || customerBookingDraft.orderType === 'meal_prep';
      const result = isMealPrepOrder
        ? await createMealPrepOrder({
            mealPrepFrequency: customerBookingDraft.mealPrepFrequency,
            eventDate,
            guestCount,
          }, selectedItems)
        : await createBooking({
            ...customerBookingDraft,
            eventDate,
            eventTime,
            venue,
            guestCount,
          }, selectedItems);

      if (!result.ok) {
        console.error(isMealPrepOrder ? 'MEAL_PREP_ORDER INSERT ERROR:' : 'BOOKING INSERT ERROR:', result.error);
        alert(`${isMealPrepOrder ? 'Meal prep order' : 'Booking'} failed: ${result.error}`);
        setIsSubmitting(false);
        return;
      }

      if (isMealPrepOrder) {
        // Save the subscription details (meal type, term, delivery) and lock today's prices.
        const plan = readSubscriptionDraft(customerBookingDraft);
        const saved = await saveMealPlanDetails(
          (result as { mealPrepOrderId: number }).mealPrepOrderId,
          {
            mealType: plan.mealType,
            planWeeks: plan.planWeeks,
            deliveryDays: plan.deliveryDays,
            fulfillmentMethod: String(customerBookingDraft.fulfillmentMethod ?? 'pickup'),
            fulfillmentTime: eventTime,
            deliveryAddress: customerBookingDraft.fulfillmentMethod === 'delivery' ? venue : null,
          }
        );
        if (!saved.ok) {
          // Do not leave a half-created plan behind.
          await cancelMealPrepOrder((result as { mealPrepOrderId: number }).mealPrepOrderId);
          alert(`Meal plan could not be saved: ${saved.error}`);
          setIsSubmitting(false);
          return;
        }
        setShowBookingSuccess(true);
        return;
      }

      // Catering bookings receive an invoice only after owner confirmation.
      setShowBookingSuccess(true);
    } catch (err) {
      console.error(
        'UNEXPECTED BOOKING ERROR:',
        err
      );
  
      alert(
        'An unexpected error occurred while submitting your booking.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * Handles the Submit Booking button.
   */
  const handleSubmit = () => {
    if (selectedMenuItemIds.length === 0) {
      alert('Please select at least one menu item.');
      return;
    }

    if (hasSelectionConflicts) {
      setShowAllergenConfirm(true);
      return;
    }

    finalizeSubmit();
  };

  /*
   * Small recap of the inquiry details shown at the top of the page.
   */
  const isMealPrepDraft =
    customerOrderType === 'meal_prep' || customerBookingDraft.orderType === 'meal_prep';
  const recapDate = customerBookingDraft.eventDate
    ? new Date(`${customerBookingDraft.eventDate}T12:00:00`).toLocaleDateString('en-PH', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';
  const recapTime = (() => {
    const t = String(customerBookingDraft.eventTime ?? '');
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    const h = Number(m[1]);
    return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
  })();
  const recap = [
    !isMealPrepDraft && customerBookingDraft.eventType
      ? { icon: CalendarDays, text: String(customerBookingDraft.eventType) }
      : null,
    recapDate ? { icon: CalendarDays, text: recapDate } : null,
    recapTime ? { icon: Clock, text: recapTime } : null,
    customerBookingDraft.guestCount
      ? {
          icon: Users,
          text: `${customerBookingDraft.guestCount} ${isMealPrepDraft ? 'servings / cycle' : 'guests'}`,
        }
      : null,
    isMealPrepDraft
      ? { icon: Repeat, text: `${deliveryDaysLabel(readSubscriptionDraft(customerBookingDraft).deliveryDays)} · ${readSubscriptionDraft(customerBookingDraft).planWeeks} ${readSubscriptionDraft(customerBookingDraft).planWeeks === 1 ? 'week' : 'weeks'}` }
      : null,
  ].filter((x): x is { icon: typeof Clock; text: string } => Boolean(x));

  return (
    <CustomerShell>
      <div className="pb-28 lg:pb-0">
        {/* HEADER */}
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#9B1C2C]">
            {isMealPrepDraft ? 'Step 3 of 3' : 'Step 2 of 2'} · Choose your dishes
          </p>
          <h1 className="font-heading text-4xl font-bold uppercase text-[#2A1B1F]">
            Build your menu
          </h1>
          <p className="mt-2 text-[#2A1B1F]/70">
            Tap a dish to add it to your {isMealPrepDraft ? 'meal prep plan' : 'event'}.
          </p>

          {recap.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E8D2D2] bg-[#FDECEC] p-3">
              {recap.map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#2A1B1F]"
                >
                  <Icon className="h-4 w-4 text-[#9B1C2C]" aria-hidden="true" />
                  {text}
                </span>
              ))}
              <button
                type="button"
                onClick={() => router.push('/customer/inquiry')}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#9B1C2C] hover:bg-white"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit details
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* MENU ITEMS */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Menu categories">
              {categories.map((category) => {
                const active = selectedCategory === category;
                const count =
                  category === 'All'
                    ? dbMenuItems.length
                    : dbMenuItems.filter((item) => item.category?.trim() === category).length;

                return (
                  <button
                    key={category}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(category)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] ${
                      active
                        ? 'border-[#9B1C2C] bg-[#9B1C2C] text-white'
                        : 'border-[#E8D2D2] bg-white text-[#2A1B1F] hover:border-[#9B1C2C]/60'
                    }`}
                  >
                    {category}
                    <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-[#2A1B1F]/50'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {loadingMenu ? (
              <div className="rounded-xl border border-[#E8D2D2] bg-white p-10 text-center text-[#2A1B1F]/60">
                Loading menu items...
              </div>
            ) : dbMenuItems.length === 0 ? (
              <div className="rounded-xl border border-[#E8D2D2] bg-white p-10 text-center text-[#2A1B1F]/60">
                No menu items are currently available.
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <div className="rounded-xl border border-[#E8D2D2] bg-white p-10 text-center text-[#2A1B1F]/60">
                No menu items found in this category.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {filteredMenuItems.map((item) => {
                  const isSelected = selectedMenuItemIds.includes(item.id);
                  const itemConflicts = checkAllergenConflict(item, customerDietaryRestrictions);
                  const hasAllergyConflict = itemConflicts.length > 0;
                  const toggle = () =>
                    isSelected ? deselectMenuItem(item.id) : selectMenuItem(item.id);

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all ${
                        isSelected
                          ? 'border-[#9B1C2C] shadow-md'
                          : 'border-[#E8D2D2] hover:border-[#9B1C2C]/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={toggle}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? 'Remove' : 'Add'} ${item.name}`}
                        className="relative block overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9B1C2C]"
                      >
                        {item.photoUrl ? (
                          <img
                            src={item.photoUrl}
                            alt={`${item.name} food`}
                            className="h-44 w-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-44 w-full items-center justify-center bg-[#FDECEC] text-sm text-[#2A1B1F]/50">
                            No photo available
                          </div>
                        )}

                        <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1 text-xs font-semibold text-[#2A1B1F] backdrop-blur-sm">
                          {item.category || "Chef's selection"}
                        </span>

                        {isSelected && (
                          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#9B1C2C] text-white shadow">
                            <Check className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </button>

                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-lg font-bold uppercase leading-tight text-[#2A1B1F]">
                            {item.name}
                          </h3>
                          <span className="shrink-0 text-lg font-bold text-[#9B1C2C]">
                            ₱{item.price.toFixed(2)}
                          </span>
                        </div>

                        {item.description && (
                          <p className="mt-2 line-clamp-3 text-sm text-[#2A1B1F]/70">
                            {item.description}
                          </p>
                        )}

                        {item.allergyTags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {item.allergyTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md bg-[#FDECEC] px-2 py-1 text-xs font-medium capitalize text-[#7F1623]"
                              >
                                {tag.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}

                        {hasAllergyConflict && (
                          <div className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                            <p className="text-xs text-red-700">
                              Conflicts with your declared{' '}
                              {itemConflicts.length === 1 ? 'allergy' : 'allergies'}:{' '}
                              {itemConflicts.map((tag) => tag.replace('_', ' ')).join(', ')}
                            </p>
                          </div>
                        )}

                        <div className="mt-auto pt-4">
                        <button
                          type="button"
                          onClick={toggle}
                          className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] ${
                            isSelected
                              ? 'border-[#9B1C2C] bg-[#9B1C2C] text-white hover:bg-[#7F1623]'
                              : 'border-[#9B1C2C] bg-white text-[#9B1C2C] hover:bg-[#FDECEC]'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <Check className="h-4 w-4" aria-hidden="true" /> Added
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" aria-hidden="true" /> Add to order
                            </>
                          )}
                        </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ORDER SUMMARY */}
          <div>
            <div
              id="order-summary"
              className="flex flex-col overflow-hidden rounded-xl border border-[#E8D2D2] bg-white shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]"
            >
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div>
                <h2 className="font-heading text-xl font-bold uppercase text-[#2A1B1F]">
                  Your order
                </h2>
                <p className="mt-1 text-sm text-[#2A1B1F]/60">
                  {selectedMenuItemIds.length === 0
                    ? 'No dishes selected yet.'
                    : `${selectedMenuItemIds.length} ${selectedMenuItemIds.length === 1 ? 'dish' : 'dishes'} selected.`}
                </p>
              </div>

              {/* SELECTED ITEMS */}
              {selectedItems.length > 0 && (
                <ul className="max-h-56 divide-y divide-[#E8D2D2] overflow-y-auto rounded-lg border border-[#E8D2D2]">
                  {selectedItems.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#2A1B1F]">{item.name}</p>
                        <p className="text-xs text-[#2A1B1F]/60">{peso(item.price)} per serving</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deselectMenuItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="rounded-md p-1.5 text-[#9B1C2C] hover:bg-[#FDECEC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C]"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* ESTIMATED COST */}
              <div className="rounded-lg border border-[#E8D2D2] bg-[#FDECEC] p-4 text-sm text-[#2A1B1F]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#9B1C2C]">
                  Estimated cost
                </p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#2A1B1F]/70">
                      Food ({peso(estimate.perServing)} × {estimate.servings}{' '}
                      {isMealPrepDraft ? 'servings / cycle' : 'guests'})
                    </dt>
                    <dd className="font-semibold">{peso(estimate.foodSubtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#2A1B1F]/70">
                      Delivery
                      {estimate.distanceKm !== null && ` (${estimate.distanceKm.toFixed(1)} km)`}
                    </dt>
                    <dd className="font-semibold">
                      {estimate.distanceKm !== null ? peso(estimate.deliveryFee) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-[#E8D2D2] pt-2 text-base">
                    <dt className="font-bold">{isMealPrepDraft ? 'Per delivery' : 'Estimated total'}</dt>
                    <dd className="font-bold text-[#9B1C2C]">{peso(estimate.total)}</dd>
                  </div>
                  {isMealPrepDraft && (
                    <div className="flex justify-between gap-2 pt-1">
                      <dt className="font-bold">
                        Plan total ({totalDeliveries(readSubscriptionDraft(customerBookingDraft).planWeeks, readSubscriptionDraft(customerBookingDraft).deliveryDays)} deliveries)
                      </dt>
                      <dd className="font-bold text-[#9B1C2C]">
                        {peso(estimate.total * totalDeliveries(readSubscriptionDraft(customerBookingDraft).planWeeks, readSubscriptionDraft(customerBookingDraft).deliveryDays))}
                      </dd>
                    </div>
                  )}
                </dl>
                {!estimate.withinRange && (
                  <p className="mt-2 text-xs font-semibold text-[#9B1C2C]">
                    This location is more than {MAX_DELIVERY_KM} km from the kitchen. The owner may decline it.
                  </p>
                )}
                <p className="mt-2 text-xs text-[#2A1B1F]/60">
                  {isMealPrepDraft
                    ? 'Prices are locked when you subscribe, so later menu price changes will not affect this plan until you renew.'
                    : 'Estimate only. The final amount is set by the caterer when they confirm your booking.'}
                </p>
              </div>

              {/* DIETARY RESTRICTIONS */}
              {customerDietaryRestrictions.length > 0 && (
                <div className="rounded-lg bg-[#FDECEC] p-3">
                  <p className="mb-2 text-xs font-semibold text-[#2A1B1F]">Your dietary restrictions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customerDietaryRestrictions.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-white px-2 py-1 text-xs font-medium capitalize text-[#7F1623]"
                      >
                        {tag.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ALLERGEN CONFLICT */}
              {hasSelectionConflicts && (
                <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="mb-1 text-xs font-semibold text-red-700">Allergen conflict</p>
                    <p className="text-xs text-red-700">
                      Your selection contains{' '}
                      {conflictingAllergens.map((tag) => tag.replace('_', ' ')).join(', ')}, which you
                      declared as a restriction. You will be asked to confirm before submitting.
                    </p>
                  </div>
                </div>
              )}

              </div>

              {/* Always visible, even with many dishes selected */}
              <div className="border-t border-[#E8D2D2] bg-white p-4">
                <Button
                  onClick={handleSubmit}
                  disabled={selectedMenuItemIds.length === 0 || loadingMenu || isSubmitting}
                  className="h-12 w-full rounded-lg bg-[#9B1C2C] font-semibold text-white hover:bg-[#7F1623] disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : isMealPrepDraft ? 'Subscribe to this plan' : 'Submit Booking'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8D2D2] bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#2A1B1F]/60">
              {selectedMenuItemIds.length} {selectedMenuItemIds.length === 1 ? 'dish' : 'dishes'} · Estimated total
            </p>
            <p className="text-lg font-bold text-[#9B1C2C]">{peso(estimate.total)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              document.getElementById('order-summary')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="h-11 rounded-lg border-[#9B1C2C] text-[#9B1C2C] hover:bg-[#FDECEC]"
          >
            Review
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selectedMenuItemIds.length === 0 || loadingMenu || isSubmitting}
            className="h-11 rounded-lg bg-[#9B1C2C] font-semibold text-white hover:bg-[#7F1623] disabled:opacity-50"
          >
            Submit
          </Button>
        </div>
      </div>

      {/* ALLERGEN CONFIRMATION MODAL */}
      {showAllergenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-xl border-2 border-red-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex gap-3">
              <AlertCircle className="h-6 w-6 shrink-0 text-red-600" />
              <div>
                <h3 className="font-heading text-xl font-bold uppercase text-[#2A1B1F]">
                  Allergen conflict
                </h3>
                <p className="mt-2 text-sm text-[#2A1B1F]/70">
                  Your selection includes items with declared allergens:{' '}
                  <span className="font-semibold text-red-700">
                    {conflictingAllergens.map((tag) => tag.replace('_', ' ')).join(', ')}
                  </span>
                  . Are you sure you want to submit this booking?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAllergenConfirm(false)}
                disabled={isSubmitting}
                className="h-11 rounded-lg border-[#9B1C2C] text-[#9B1C2C] hover:bg-[#FDECEC]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-lg bg-[#9B1C2C] text-white hover:bg-[#7F1623]"
                onClick={() => {
                  setShowAllergenConfirm(false);
                  finalizeSubmit();
                }}
                disabled={isSubmitting}
              >
                Submit anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING SUCCESS MODAL */}
      {showBookingSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border-2 border-[#E8D2D2] bg-white p-6 text-center shadow-xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
            <h3 className="mt-3 font-heading text-2xl font-bold uppercase text-[#2A1B1F]">
              {isMealPrepDraft ? 'Meal prep submitted' : 'Booking submitted'}
            </h3>
            <p className="mt-2 text-sm text-[#2A1B1F]/70">
              Your request has been sent. The business owner will review it and confirm the details.
            </p>
            <Button
              type="button"
              className="mt-6 h-11 w-full rounded-lg bg-[#9B1C2C] font-semibold text-white hover:bg-[#7F1623]"
              onClick={() => {
                setShowBookingSuccess(false);
                clearCustomerSession();
                router.push('/customer/active-orders');
              }}
            >
              View my active orders
            </Button>
          </div>
        </div>
      )}
    </CustomerShell>
  );
}
