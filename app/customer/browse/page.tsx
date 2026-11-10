'use client';

import Image from 'next/image';
import { CustomerShell } from '@/app/customer/customer-shell';
import { useAppState } from '@/lib/state';
import { restoreSession } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Check, AlertCircle, CheckCircle2, Plus, X, CalendarDays, Clock, Users, Repeat, Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { estimateOrder, MAX_DELIVERY_KM } from '@/lib/pricing';
import { supabase } from '@/lib/supabase';
import { createBooking, createMealPrepOrder } from '@/app/actions/booking-actions';
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
    mealPrepSelections,
    customerDietaryRestrictions,
    setDietaryRestrictions,
    selectMenuItem,
    deselectMenuItem,
    addMealPrepSelection,
    updateMealPrepQuantity,
    removeMealPrepSelection,
    customerBookingDraft,
    customerOrderType,
    clearCustomerSession,
  } = useAppState();

  const [dbMenuItems, setDbMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedMealPrepCategory, setSelectedMealPrepCategory] = useState<
  'breakfast' | 'lunch' | 'dinner'
>('breakfast');

const mealPrepCategories = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
] as const;
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
        .select('MenuItemID, ItemName, Category, MealType, Price, PrepTimeDays, Description, PhotoURL')
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
            MealType: string | null;
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
              mealType: item.MealType?.toLowerCase() as MenuItem['mealType'],
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
  
  const isMealPrepDraft =
  customerOrderType === 'meal_prep' ||
  customerBookingDraft.orderType === 'meal_prep';

const filteredMenuItems = isMealPrepDraft
  ? dbMenuItems.filter(
      (item) => item.mealType === selectedMealPrepCategory
    )
  : selectedCategory === 'All'
    ? dbMenuItems
    : dbMenuItems.filter(
        (item) => item.category?.trim() === selectedCategory
      );

      const selectedItems = isMealPrepDraft
      ? dbMenuItems.filter((item) =>
          mealPrepSelections.some(
            (selection) => selection.menuItemId === Number(item.id)
          )
        )
      : dbMenuItems.filter((item) =>
          selectedMenuItemIds.includes(item.id)
        );

  const isMealPrep = customerOrderType === 'meal_prep';

  const mealPrepSelectedItems = mealPrepSelections.flatMap((selection) => {
    const item = dbMenuItems.find(
      (menuItem) => Number(menuItem.id) === selection.menuItemId
    );
  
    return item
      ? [
          {
            ...item,
            mealType: selection.mealType,
            quantity: selection.quantity,
          },
        ]
      : [];
  });
  
  const mealPrepItemCount = mealPrepSelectedItems.length;
  
  const mealPrepPortionCount = mealPrepSelectedItems.reduce(
    (total, item) => total + item.quantity,
    0
  );
  
  const selectedItemCount = isMealPrepDraft
    ? mealPrepItemCount
    : selectedMenuItemIds.length;
  
  const hasAnySelection = selectedItemCount > 0;
  
  const scheduledDeliveryCount = Array.isArray(
    customerBookingDraft.scheduledDeliveries
  )
    ? customerBookingDraft.scheduledDeliveries.length
    : 0;

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
    itemPrices: isMealPrepDraft
      ? mealPrepSelectedItems.flatMap((item) =>
          Array.from({ length: item.quantity }, () => item.price)
        )
      : selectedItems.map((item) => item.price),
  
    servings: isMealPrepDraft
      ? 1
      : parseInt(String(customerBookingDraft.guestCount || '0'), 10) || 0,
  
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
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const isMealPrepOrder =
        customerOrderType === 'meal_prep' ||
        customerBookingDraft.orderType === 'meal_prep';

      const eventDate = String(
        customerBookingDraft.eventDate ?? ''
      ).trim();

      const eventTime = String(
        customerBookingDraft.eventTime ?? ''
      ).trim();

      const venue = String(
        customerBookingDraft.venue ?? ''
      ).trim();

      // Make sure the customer is logged in. The browser copy of the user can be empty after a
      // page reload or a Google sign-in even though the sign-in cookie is valid, so reload it
      // from the cookie before giving up.
      if (!currentUser?.id) await restoreSession();
      const sessionUser = useAppState.getState().currentUser;
      if (!sessionUser?.id || Number.isNaN(Number(sessionUser.id))) {
        alert('Unable to identify your customer account. Please log in again.');
        return;
      }

      if (!eventDate) {
        alert(
          isMealPrepOrder
            ? 'Please select your preferred start date.'
            : 'Please select an event date.'
        );
        return;
      }

      if (!eventTime) {
        alert('Please select a delivery or pickup time.');
        return;
      }

      if (isMealPrepOrder) {
        // Validate the subscription duration.
        const subscriptionWeeks = Number(
          customerBookingDraft.subscriptionWeeks ?? 1
        );

        if (![1, 2, 4].includes(subscriptionWeeks)) {
          alert('Please select a valid subscription duration.');
          return;
        }

        // Validate the selected delivery days.
        const deliveryDays = Array.isArray(
          customerBookingDraft.deliveryDays
        )
          ? customerBookingDraft.deliveryDays
          : [];

        if (deliveryDays.length === 0) {
          alert('Please select at least one delivery day.');
          return;
        }

        // Validate the generated delivery schedule.
        const scheduledDeliveries = Array.isArray(
          customerBookingDraft.scheduledDeliveries
        )
          ? customerBookingDraft.scheduledDeliveries
          : [];

        if (scheduledDeliveries.length === 0) {
          alert('No delivery dates were generated. Please review your schedule.');
          return;
        }

        // Validate pickup or delivery details.
        const fulfillmentMethod = String(
          customerBookingDraft.fulfillmentMethod ?? 'pickup'
        ).toLowerCase();

        if (!['pickup', 'delivery'].includes(fulfillmentMethod)) {
          alert('Please select a valid fulfillment method.');
          return;
        }

        if (fulfillmentMethod === 'delivery' && !venue) {
          alert('Please enter your delivery address.');
          return;
        }

        // Preserve the meal type and quantity selected for each dish.
        const validMealPrepSelections = mealPrepSelections.filter(
          (selection) =>
            dbMenuItems.some(
              (item) => Number(item.id) === selection.menuItemId
            ) &&
            ['breakfast', 'lunch', 'dinner'].includes(selection.mealType) &&
            Number.isInteger(selection.quantity) &&
            selection.quantity > 0
        );

        if (validMealPrepSelections.length === 0) {
          alert('Please select at least one valid dish for your meal prep plan.');
          return;
        }

        // Total portions for one delivery cycle.
        const guestCount = validMealPrepSelections.reduce(
          (total, selection) => total + selection.quantity,
          0
        );

        const selectedItems = validMealPrepSelections.map((selection) => ({
          MenuItemID: selection.menuItemId,
          Quantity: selection.quantity,
          MealType: selection.mealType,
        }));

        const result = await createMealPrepOrder(
          {
            subscriptionWeeks: subscriptionWeeks as 1 | 2 | 4,
            deliveryDays,
            scheduledDeliveries,
            eventDate,
            eventTime,
            guestCount,
            fulfillmentMethod,
            deliveryAddress:
              fulfillmentMethod === 'delivery' ? venue : null,
          },
          selectedItems
        );

        if (!result.ok) {
          console.error('MEAL_PREP_ORDER INSERT ERROR:', result.error);
          alert(`Meal prep order failed: ${result.error}`);
          return;
        }

        setShowBookingSuccess(true);
        return;
      }

      // --------------------------------------------------
      // EXISTING CATERING BOOKING SUBMISSION
      // --------------------------------------------------

      const guestCount = parseInt(
        String(customerBookingDraft.guestCount || '0'),
        10
      );

      if (!venue) {
        alert('Please enter a venue.');
        return;
      }

      if (!Number.isFinite(guestCount) || guestCount <= 0) {
        alert('Please enter a valid guest count.');
        return;
      }

      const validMenuItemIds = selectedMenuItemIds.filter(
        (menuItemId) =>
          dbMenuItems.some((item) => item.id === menuItemId)
      );

      if (validMenuItemIds.length === 0) {
        alert('Please select at least one valid menu item.');
        return;
      }

      const selectedItems = validMenuItemIds.map((menuItemId) => ({
        MenuItemID: Number(menuItemId),
        Quantity: 1,
      }));

      const result = await createBooking(
        {
          ...customerBookingDraft,
          eventDate,
          eventTime,
          venue,
          guestCount,
        },
        selectedItems
      );

      if (!result.ok) {
        console.error('BOOKING INSERT ERROR:', result.error);
        alert(`Booking failed: ${result.error}`);
        return;
      }

      setShowBookingSuccess(true);
    } catch (err) {
      console.error('UNEXPECTED BOOKING ERROR:', err);
      alert('An unexpected error occurred while submitting your booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /*
   * Handles the Submit Booking button.
   */
  const handleSubmit = () => {
    if (!hasAnySelection) {
      alert(
        isMealPrepDraft
          ? 'Please add at least one dish to your meal prep plan.'
          : 'Please select at least one menu item.'
      );
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
    ? {
      icon: Repeat,
      text: `${customerBookingDraft.subscriptionWeeks ?? 1} ${
        (customerBookingDraft.subscriptionWeeks ?? 1) === 1 ? 'week' : 'weeks'
      }`,
    }
      : null,
  ].filter((x): x is { icon: typeof Clock; text: string } => Boolean(x));

  return (
    <CustomerShell>
      <div className="pb-28 lg:pb-0">
        {/* HEADER */}
        <div className="mb-8">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#C8431B]">
            {isMealPrepDraft ? 'Step 3 of 3' : 'Step 2 of 2'} · Choose your dishes
          </p>
          <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">
            Build your menu
          </h1>
          <p className="mt-2 text-[#2B1D16]/70">
            Tap a dish to add it to your {isMealPrepDraft ? 'meal prep plan' : 'event'}.
          </p>

          {recap.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-[#E8D8C4] bg-[#F6E3D3] p-3">
              {recap.map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#2B1D16]"
                >
                  <Icon className="h-4 w-4 text-[#C8431B]" aria-hidden="true" />
                  {text}
                </span>
              ))}
              <button
                type="button"
                onClick={() => router.push('/customer/inquiry')}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#C8431B] hover:bg-white"
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
                {isMealPrepDraft
                  ? mealPrepCategories.map((category) => {
                      const active = selectedMealPrepCategory === category.value;
                      const count = dbMenuItems.filter(
                        (item) => item.mealType === category.value
                      ).length;

                      return (
                        <button
                          key={category.value}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setSelectedMealPrepCategory(category.value)}
                          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                            active
                              ? 'border-[#C8431B] bg-[#C8431B] text-white'
                              : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:border-[#C8431B]/60'
                          }`}
                        >
                          {category.label}
                          <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-[#2B1D16]/50'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })
                  : categories.map((category) => {
                      const active = selectedCategory === category;
                      const count =
                        category === 'All'
                          ? dbMenuItems.length
                          : dbMenuItems.filter(
                              (item) => item.category?.trim() === category
                            ).length;

                      return (
                        <button
                          key={category}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setSelectedCategory(category)}
                          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                            active
                              ? 'border-[#C8431B] bg-[#C8431B] text-white'
                              : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:border-[#C8431B]/60'
                          }`}
                        >
                          {category}
                          <span className={`ml-1.5 text-xs ${active ? 'text-white/80' : 'text-[#2B1D16]/50'}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
              </div>

            {loadingMenu ? (
              <div className="rounded-xl border border-[#E8D8C4] bg-white p-10 text-center text-[#2B1D16]/60">
                Loading menu items...
              </div>
            ) : dbMenuItems.length === 0 ? (
              <div className="rounded-xl border border-[#E8D8C4] bg-white p-10 text-center text-[#2B1D16]/60">
                No menu items are currently available.
              </div>
            ) : filteredMenuItems.length === 0 ? (
              <div className="rounded-xl border border-[#E8D8C4] bg-white p-10 text-center text-[#2B1D16]/60">
                No menu items found in this category.
              </div>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {filteredMenuItems.map((item) => {
                  const isSelected = isMealPrepDraft
                  ? mealPrepSelections.some(
                      (selection) =>
                        selection.mealType === selectedMealPrepCategory &&
                        selection.menuItemId === Number(item.id)
                    )
                  : selectedMenuItemIds.includes(item.id);
                  const itemConflicts = checkAllergenConflict(item, customerDietaryRestrictions);
                  const hasAllergyConflict = itemConflicts.length > 0;
                  
                  const toggle = () => {
                    if (isMealPrepDraft) {
                      if (isSelected) {
                        removeMealPrepSelection(
                          selectedMealPrepCategory,
                          Number(item.id)
                        );
                      } else {
                        addMealPrepSelection(
                          selectedMealPrepCategory,
                          Number(item.id)
                        );
                      }
                    } else {
                      isSelected
                        ? deselectMenuItem(item.id)
                        : selectMenuItem(item.id);
                    }
                  };

                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all ${
                        isSelected
                          ? 'border-[#C8431B] shadow-md'
                          : 'border-[#E8D8C4] hover:border-[#C8431B]/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={toggle}
                        aria-pressed={isSelected}
                        aria-label={`${isSelected ? 'Remove' : 'Add'} ${item.name}`}
                        className="relative block overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8431B]"
                      >
                        {item.photoUrl ? (
                          <img
                            src={item.photoUrl}
                            alt={`${item.name} food`}
                            className="h-44 w-full object-cover transition-transform duration-300 hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-44 w-full items-center justify-center bg-[#F6E3D3] text-sm text-[#2B1D16]/50">
                            No photo available
                          </div>
                        )}

                        <span className="absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1 text-xs font-semibold text-[#2B1D16] backdrop-blur-sm">
                          {item.category || "Chef's selection"}
                        </span>

                        {isSelected && (
                          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[#C8431B] text-white shadow">
                            <Check className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </button>

                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-heading text-lg font-bold uppercase leading-tight text-[#2B1D16]">
                            {item.name}
                          </h3>
                          <span className="shrink-0 text-lg font-bold text-[#C8431B]">
                            ₱{item.price.toFixed(2)}
                          </span>
                        </div>

                        {item.description && (
                          <p className="mt-2 line-clamp-3 text-sm text-[#2B1D16]/70">
                            {item.description}
                          </p>
                        )}

                        {item.allergyTags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {item.allergyTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-md bg-[#F6E3D3] px-2 py-1 text-xs font-medium capitalize text-[#A93615]"
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
                        {isMealPrepDraft ? (
                          <Button
                            type="button"
                            onClick={toggle}
                            className={`w-full ${
                              isSelected
                                ? 'bg-green-600 hover:bg-green-700'
                                : 'bg-[#C8431B] hover:bg-[#A93615]'
                            } text-white`}
                          >
                            {isSelected ? (
                              <>
                                <Check className="mr-2 h-4 w-4" />
                                Added to plan
                              </>
                            ) : (
                              <>
                                <Plus className="mr-2 h-4 w-4" />
                                Add to plan
                              </>
                            )}
                          </Button>
                        ) : (
                            <button
                              type="button"
                              onClick={toggle}
                              className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${
                                isSelected
                                  ? 'border-[#C8431B] bg-[#C8431B] text-white hover:bg-[#A93615]'
                                  : 'border-[#C8431B] bg-white text-[#C8431B] hover:bg-[#F6E3D3]'
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
                          )}
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
              className="flex flex-col overflow-hidden rounded-xl border border-[#E8D8C4] bg-white shadow-sm lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]"
            >
              <div className="flex-1 space-y-5 overflow-y-auto p-6">
              <div>
                <h2 className="font-heading text-xl font-bold uppercase text-[#2B1D16]">
                  Your order
                </h2>
                <p className="mt-1 text-sm text-[#2B1D16]/60">
                  {!hasAnySelection
                    ? 'No dishes selected yet.'
                    : isMealPrepDraft
                      ? `${mealPrepItemCount} dishes · ${mealPrepPortionCount} portions per delivery`
                      : `${selectedItemCount} ${selectedItemCount === 1 ? 'dish' : 'dishes'} selected.`}
                </p>
              </div>

              {/* SELECTED ITEMS */}
              {isMealPrepDraft ? (
                <div className="space-y-4">
                  {mealPrepCategories.map((category) => {
                    const categorySelections = mealPrepSelectedItems.filter(
                      (item) => item.mealType === category.value
                    );

                    if (categorySelections.length === 0) {
                      return null;
                    }

                    return (
                      <div key={category.value}>
                        <h3 className="mb-2 text-sm font-bold text-[#C8431B]">
                          {category.label}
                        </h3>

                        <ul className="divide-y divide-[#E8D8C4] rounded-lg border border-[#E8D8C4]">
                          {categorySelections.map((item) => (
                            <li
                              key={`${category.value}-${item.id}`}
                              className="flex items-center gap-2 p-3"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-[#2B1D16]">
                                  {item.name}
                                </p>
                                <p className="text-xs text-[#2B1D16]/60">
                                  {peso(item.price)} each · {peso(item.price * item.quantity)} per delivery
                                </p>
                              </div>

                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.quantity > 1) {
                                      updateMealPrepQuantity(
                                        category.value,
                                        Number(item.id),
                                        item.quantity - 1
                                      );
                                    } else {
                                      removeMealPrepSelection(
                                        category.value,
                                        Number(item.id)
                                      );
                                    }
                                  }}
                                  aria-label={`Decrease ${item.name} quantity`}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E8D8C4] text-lg font-bold text-[#C8431B] hover:bg-[#F6E3D3]"
                                >
                                  −
                                </button>

                                <span className="w-7 text-center text-sm font-semibold">
                                  {item.quantity}
                                </span>

                                <button
                                  type="button"
                                  onClick={() =>
                                    updateMealPrepQuantity(
                                      category.value,
                                      Number(item.id),
                                      item.quantity + 1
                                    )
                                  }
                                  aria-label={`Increase ${item.name} quantity`}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-[#E8D8C4] text-lg font-bold text-[#C8431B] hover:bg-[#F6E3D3]"
                                >
                                  +
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeMealPrepSelection(
                                      category.value,
                                      Number(item.id)
                                    )
                                  }
                                  aria-label={`Remove ${item.name}`}
                                  className="rounded-md p-1.5 text-[#C8431B] hover:bg-[#F6E3D3]"
                                >
                                  <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              ) : (
            selectedItems.length > 0 && (
              <ul className="max-h-56 divide-y divide-[#E8D8C4] overflow-y-auto rounded-lg border border-[#E8D8C4]">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#2B1D16]">
                        {item.name}
                      </p>
                      <p className="text-xs text-[#2B1D16]/60">
                        {peso(item.price)} per serving
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => deselectMenuItem(item.id)}
                      aria-label={`Remove ${item.name}`}
                      className="rounded-md p-1.5 text-[#C8431B] hover:bg-[#F6E3D3]"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

              {/* ESTIMATED COST */}
              <div className="rounded-lg border border-[#E8D8C4] bg-[#F6E3D3] p-4 text-sm text-[#2B1D16]">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#C8431B]">
                  Estimated cost
                </p>
                <dl className="mt-2 space-y-1">
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#2B1D16]/70">
                      Food ({peso(estimate.perServing)} × {estimate.servings}{' '}
                      {isMealPrepDraft ? 'servings / cycle' : 'guests'})
                    </dt>
                    <dd className="font-semibold">{peso(estimate.foodSubtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-[#2B1D16]/70">
                      Delivery
                      {estimate.distanceKm !== null && ` (${estimate.distanceKm.toFixed(1)} km)`}
                    </dt>
                    <dd className="font-semibold">
                      {estimate.distanceKm !== null ? peso(estimate.deliveryFee) : '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-[#E8D8C4] pt-2 text-base">
                    <dt className="font-bold">{isMealPrepDraft ? 'Per delivery' : 'Estimated total'}</dt>
                    <dd className="font-bold text-[#C8431B]">{peso(estimate.total)}</dd>
                  </div>
                  {isMealPrepDraft && (
                    <div className="flex justify-between gap-2 pt-1">
                      <dt className="font-bold">
                        Plan total ({scheduledDeliveryCount} deliveries)
                      </dt>
                      <dd className="font-bold text-[#C8431B]">
                        {peso(estimate.total * scheduledDeliveryCount)}
                      </dd>
                    </div>
                  )}
                </dl>
                {!estimate.withinRange && (
                  <p className="mt-2 text-xs font-semibold text-[#C8431B]">
                    This location is more than {MAX_DELIVERY_KM} km from the kitchen. The owner may decline it.
                  </p>
                )}
                <p className="mt-2 text-xs text-[#2B1D16]/60">
                  {isMealPrepDraft
                    ? 'Prices are locked when you subscribe, so later menu price changes will not affect this plan until you renew.'
                    : 'Estimate only. The final amount is set by the caterer when they confirm your booking.'}
                </p>
              </div>

              {/* DIETARY RESTRICTIONS */}
              {customerDietaryRestrictions.length > 0 && (
                <div className="rounded-lg bg-[#F6E3D3] p-3">
                  <p className="mb-2 text-xs font-semibold text-[#2B1D16]">Your dietary restrictions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {customerDietaryRestrictions.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-white px-2 py-1 text-xs font-medium capitalize text-[#A93615]"
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
              <div className="border-t border-[#E8D8C4] bg-white p-4">
                <Button
                  onClick={handleSubmit}
                  disabled={!hasAnySelection || loadingMenu || isSubmitting}
                  className="h-12 w-full rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615] disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : isMealPrepDraft ? 'Subscribe to this plan' : 'Submit Booking'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE BOTTOM BAR */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8D8C4] bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[#2B1D16]/60">
              {selectedItemCount} {selectedItemCount === 1 ? 'dish' : 'dishes'} · Estimated total
            </p>
            <p className="text-lg font-bold text-[#C8431B]">{peso(estimate.total)}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              document.getElementById('order-summary')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="h-11 rounded-lg border-[#C8431B] text-[#C8431B] hover:bg-[#F6E3D3]"
          >
            Review
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!hasAnySelection || loadingMenu || isSubmitting}
            className="h-11 rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615] disabled:opacity-50"
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
                <h3 className="font-heading text-xl font-bold uppercase text-[#2B1D16]">
                  Allergen conflict
                </h3>
                <p className="mt-2 text-sm text-[#2B1D16]/70">
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
                className="h-11 rounded-lg border-[#C8431B] text-[#C8431B] hover:bg-[#F6E3D3]"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="h-11 rounded-lg bg-[#C8431B] text-white hover:bg-[#A93615]"
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
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl border-2 border-[#E8D8C4] bg-white p-6 text-center shadow-xl">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
            <h3 className="mt-3 font-heading text-2xl font-bold uppercase text-[#2B1D16]">
              {isMealPrepDraft ? 'Meal prep submitted' : 'Booking submitted'}
            </h3>
            <p className="mt-2 text-sm text-[#2B1D16]/70">
              Your request has been sent. The business owner will review it and confirm the details.
            </p>
            <Button
              type="button"
              className="mt-6 h-11 w-full rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615]"
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