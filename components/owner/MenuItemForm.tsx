'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/card';
import { Dropdown, type DropdownGroup } from '@/components/owner/Dropdown';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

import {
  createMenuItem,
  replaceDishIngredients,
  replaceMenuItemAllergies,
  updateMenuItem,
  createMenuItemPhotoUpload,
  saveMenuItemPhotoUrl,
} from '@/app/actions/menu-actions'
import { supabase } from '@/lib/supabase';
import type { AllergenType, MenuItem } from '@/lib/types';
import { ALLERGEN_OPTIONS, allergenLabel, isSupportedAllergen } from '@/lib/allergens';
import { PageLoader } from '@/components/ui/PageLoader'

const CATEGORIES: MenuItem['category'][] = [
  'appetizers',
  'mains',
  'sides',
  'desserts',
  'beverages',
];

const FALLBACK_ALLERGEN_OPTIONS: AllergenType[] = ALLERGEN_OPTIONS;

export type MenuItemFormValues = Omit<
  MenuItem,
  'inventoryStatus' | 'macros'
>;

interface MenuItemFormProps {
  open: boolean;
  item: MenuItem | null;
  onClose: () => void;
}

type IngredientCategory = 'meats' | 'dairy' | 'baking' | 'produce' | 'pantry' | 'herbs_spices' | 'other'

interface DbIngredient {
  IngredientID: number;
  IngredientName: string;
  UnitOfMeasure: string;
  CurrentStock: number;
  MaxStorageCapacity: number;
  category?: string | null;
}

const ingredientCategoryLabels: Record<IngredientCategory, string> = {
  meats: 'Meat & seafood',
  dairy: 'Dairy & eggs',
  baking: 'Baking',
  produce: 'Produce',
  pantry: 'Pantry',
  herbs_spices: 'Herbs & spices',
  other: 'Other',
}

function getIngredientCategory(ingredient: DbIngredient): IngredientCategory {
  const category = ingredient.category?.toLowerCase().replace(/[- ]/g, '_')
  if (category && category in ingredientCategoryLabels) return category as IngredientCategory

  const name = ingredient.IngredientName.toLowerCase()
  if (/chicken|beef|pork|salmon|shrimp|fish|turkey|bacon|meat/.test(name)) return 'meats'
  if (/milk|cream|cheese|butter|yogurt|egg/.test(name)) return 'dairy'
  if (/flour|sugar|yeast|baking|cocoa/.test(name)) return 'baking'
  if (/salt|pepper|spice|cumin|paprika|cinnamon|oregano|basil|thyme|garlic powder/.test(name)) return 'herbs_spices'
  if (/oil|vinegar|sauce|rice|pasta|bean|stock|broth|noodle/.test(name)) return 'pantry'
  if (/tomato|onion|lettuce|carrot|potato|spinach|lemon|apple|berry|vegetable/.test(name)) return 'produce'
  return 'other'
}

interface DbAllergyTag {
  AllergyTagID: number;
  AllergenName: string;
}

interface RequiredIngredient {
  id: string;
  name: string;
  qty: number;
  unit: string;
}

/*
 * Convert a database-loaded MenuItem into
 * the form structure.
 */
function toFormValues(
  item: MenuItem | null
): MenuItemFormValues {
  if (item) {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      prepTimeDays: item.prepTimeDays,
      availability: item.availability !== false,
      allergyTags: item.allergyTags ?? [],
      requiredIngredients:
        item.requiredIngredients ?? [],
    };
  }

  return {
    id: '',
    name: '',
    description: '',
    category: 'mains',
    price: 0,
    prepTimeDays: 1,
    availability: true,
    allergyTags: [],
    requiredIngredients: [],
  };
}

export function MenuItemForm({
  open,
  item,
  onClose,
}: MenuItemFormProps) {
  const [form, setForm] =
    useState<MenuItemFormValues>(
      () => toFormValues(item)
    );

  /*
   * Price is kept as a string while editing.
   *
   * This allows the user to:
   * - delete the current price
   * - type a new price
   * - type decimal values
   * - freely edit an existing price
   */
  const [priceInput, setPriceInput] =
    useState('');

  const [ingredients, setIngredients] =
    useState<DbIngredient[]>([]);

  const [allergyTags, setAllergyTags] =
    useState<DbAllergyTag[]>([]);

  const [ingredientId, setIngredientId] =
    useState('');

  const [ingredientQty, setIngredientQty] =
    useState('');

  const [loadingData, setLoadingData] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [selectedPhoto, setSelectedPhoto] =
    useState<File | null>(null);

  const [photoPreview, setPhotoPreview] =
    useState('');

  const isEditing = Boolean(item);

  /*
   * Load all database information needed
   * by the form.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const loadFormData = async () => {
      setLoadingData(true);
      setErrorMessage('');

      /*
       * Reset form values whenever the form
       * opens for a new/different item.
       */
      setForm(toFormValues(item));

      /*
       * IMPORTANT:
       * Keep price separate as a string.
       */
      setPriceInput(
        item
          ? String(item.price ?? '')
          : ''
      );

      setIngredientId('');
      setIngredientQty('');
      setSelectedPhoto(null);
      setPhotoPreview(item?.photoUrl?.trim() ?? '');

      try {
        /*
         * Load ingredients and allergy tags
         * directly from Supabase.
         */
        const [
          {
            data: ingredientData,
            error: ingredientError,
          },
          {
            data: allergyData,
            error: allergyError,
          },
        ] = await Promise.all([
          supabase
            .from('INGREDIENT')
            .select(
              `
                IngredientID,
        IngredientName,
        UnitOfMeasure,
        CurrentStock,
        MaxStorageCapacity,
        category

              `
            )
            .order('IngredientName', {
              ascending: true,
            }),

          supabase
            .from('ALLERGY_TAG')
            .select(
              'AllergyTagID, AllergenName'
            )
            .order('AllergenName', {
              ascending: true,
            }),
        ]);

        if (ingredientError) {
          console.error(
            'INGREDIENT loading error:',
            ingredientError
          );

          throw new Error(
            'Unable to load ingredients from the database.'
          );
        }

        if (allergyError) {
          console.error(
            'ALLERGY_TAG loading error:',
            allergyError
          );

          throw new Error(
            'Unable to load allergy tags from the database.'
          );
        }

        setIngredients(
          ingredientData ?? []
        );

        setAllergyTags(
          (allergyData ?? [])
            .filter((tag) => isSupportedAllergen(tag.AllergenName))
            .sort(
              (a, b) =>
                ALLERGEN_OPTIONS.indexOf(a.AllergenName.trim().toLowerCase() as AllergenType) -
                ALLERGEN_OPTIONS.indexOf(b.AllergenName.trim().toLowerCase() as AllergenType)
            )
        );

        /*
         * If editing an existing menu item,
         * load its relationships from Supabase.
         */
        if (item) {
          const menuItemId =
            Number(item.id);

          if (
            Number.isNaN(menuItemId)
          ) {
            throw new Error(
              'Invalid menu item ID.'
            );
          }

          const [
            {
              data: dishIngredients,
              error: dishIngredientError,
            },
            {
              data: menuAllergies,
              error: menuAllergyError,
            },
          ] = await Promise.all([
            supabase
              .from('DISH_INGREDIENT')
              .select(
                `
                  IngredientID,
                  QuantityRequiredPerServing
                `
              )
              .eq(
                'MenuItemID',
                menuItemId
              ),

            supabase
              .from('MENU_ITEM_ALLERGY')
              .select(
                'AllergyTagID'
              )
              .eq(
                'MenuItemID',
                menuItemId
              ),
          ]);

          if (dishIngredientError) {
            console.error(
              'DISH_INGREDIENT loading error:',
              dishIngredientError
            );

            throw new Error(
              'Unable to load the menu item ingredients.'
            );
          }

          if (menuAllergyError) {
            console.error(
              'MENU_ITEM_ALLERGY loading error:',
              menuAllergyError
            );

            throw new Error(
              'Unable to load the menu item allergens.'
            );
          }

          /*
           * Convert database ingredient
           * relationships into the form structure.
           */
          const requiredIngredients: RequiredIngredient[] =
            (dishIngredients ?? [])
              .map((row) => {
                const ingredient =
                  (
                    ingredientData ?? []
                  ).find(
                    (ing) =>
                      ing.IngredientID ===
                      row.IngredientID
                  );

                if (!ingredient) {
                  return null;
                }

                return {
                  id: String(
                    ingredient.IngredientID
                  ),
                  name:
                    ingredient.IngredientName,
                  qty: Number(
                    row.QuantityRequiredPerServing
                  ),
                  unit:
                    ingredient.UnitOfMeasure,
                };
              })
              .filter(
                (
                  value
                ): value is RequiredIngredient =>
                  value !== null
              );

          /*
           * Convert database allergy IDs
           * into allergen names.
           */
          const selectedAllergens: AllergenType[] =
            (menuAllergies ?? [])
              .map((row) => {
                const tag =
                  (
                    allergyData ?? []
                  ).find(
                    (allergy) =>
                      allergy.AllergyTagID ===
                      row.AllergyTagID
                  );

                return tag?.AllergenName;
              })
              .filter(
                (
                  name
                ): name is AllergenType => {
                  if (!name) {
                    return false;
                  }

                  return FALLBACK_ALLERGEN_OPTIONS.includes(
                    name as AllergenType
                  );
                }
              );

          /*
           * Put the database relationships
           * into the form.
           */
          setForm((previous) => ({
            ...previous,
            requiredIngredients,
            allergyTags:
              selectedAllergens,
          }));
          const { data: photoData, error: photoError } = await supabase
          .from('MENU_ITEM')
          .select('PhotoURL')
          .eq('MenuItemID', menuItemId)
          .maybeSingle();

        if (photoError) {
          console.error('Menu photo loading error:', photoError);
        } else {
          const savedPhotoUrl = photoData?.PhotoURL?.trim() ?? '';

          if (savedPhotoUrl) {
            setPhotoPreview(savedPhotoUrl);
          }
        }
        }

      } catch (error) {
        console.error(
          'Menu item form loading error:',
          error
        );

        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Unable to load menu item data.'
        );
      } finally {
        setLoadingData(false);
      }
    };

    loadFormData();
  }, [open, item]);

  /*
   * Do not render anything while closed.
   */
  if (!open) {
    return null;
  }

  /*
   * Toggle allergen selection.
   */
  const toggleAllergen = (
    tag: AllergenType
  ) => {
    setForm((previous) => ({
      ...previous,
      allergyTags:
        previous.allergyTags.includes(tag)
          ? previous.allergyTags.filter(
              (existingTag) =>
                existingTag !== tag
            )
          : [
              ...previous.allergyTags,
              tag,
            ],
    }));
  };

  /*
   * Add an ingredient to the dish.
   */
  const addIngredient = () => {
    const ingredient =
      ingredients.find(
        (ing) =>
          String(
            ing.IngredientID
          ) === ingredientId
      );

    const quantity =
      parseFloat(ingredientQty);

    if (!ingredient) {
      setErrorMessage(
        'Please select an ingredient.'
      );
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      setErrorMessage(
        'Please enter a whole-number quantity greater than or equal to 1.'
      );
      return;
    }

    const alreadyExists =
      form.requiredIngredients.some(
        (required) =>
          required.id ===
          String(
            ingredient.IngredientID
          )
      );

    if (alreadyExists) {
      setErrorMessage(
        'This ingredient has already been added.'
      );
      return;
    }

    setForm((previous) => ({
      ...previous,
      requiredIngredients: [
        ...previous.requiredIngredients,
        {
          id: String(
            ingredient.IngredientID
          ),
          name:
            ingredient.IngredientName,
          qty: quantity,
          unit:
            ingredient.UnitOfMeasure,
        },
      ],
    }));

    setIngredientId('');
    setIngredientQty('');
    setErrorMessage('');
  };

  /*
   * Remove an ingredient.
   */
  const removeIngredient = (
    id: string
  ) => {
    setForm((previous) => ({
      ...previous,
      requiredIngredients:
        previous.requiredIngredients.filter(
          (required) =>
            required.id !== id
        ),
    }));
  };

  /*
   * Save menu item directly to Supabase.
   */
  const handleSubmit = async (
    event: React.FormEvent
  ) => {
    event.preventDefault();

    if (saving) {
      return;
    }

    /*
     * Validate name.
     */
    if (!form.name.trim()) {
      setErrorMessage(
        'Menu item name is required.'
      );
      return;
    }

    /*
     * Validate description.
     */
    if (!form.description.trim()) {
      setErrorMessage(
        'Menu item description is required.'
      );
      return;
    }

    /*
     * Validate price.
     */
    const numericPrice =
      Number(priceInput);

    if (
      priceInput.trim() === '' ||
      Number.isNaN(numericPrice) ||
      numericPrice < 0
    ) {
      setErrorMessage(
        'Please enter a valid price.'
      );
      return;
    }

    setSaving(true);
    setErrorMessage('');

    try {
      /*
       * Check the current Supabase session.
       */
      const {
        data: {
          session,
        },
      } =
        await supabase.auth.getSession();

      console.log(
        'SUPABASE SESSION BEFORE MENU SAVE:',
        {
          hasSession: !!session,
          userId:
            session?.user?.id ??
            null,
          email:
            session?.user?.email ??
            null,
        }
      );

      /*
       * Convert the UI category into
       * the database category format.
       *
       * Example:
       * mains -> Mains
       */
      const databaseCategory =
        form.category
          .charAt(0)
          .toUpperCase() +
        form.category.slice(1);

      let menuItemId: number;

      /*
       * ====================================
       * CREATE MENU ITEM
       * ====================================
       */
      if (!isEditing || !item) {
        menuItemId = await createMenuItem({
          ItemName: form.name.trim(),
          Category: databaseCategory,
          Price: numericPrice,
          PrepTimeDays: Math.max(0, Number(form.prepTimeDays) || 0),
          Description: form.description.trim(),
          Availability: form.availability !== false,
        })
      }

      /*
       * ====================================
       * UPDATE MENU ITEM
       * ====================================
       */
      else {
        menuItemId =
          Number(item.id);

        if (
          Number.isNaN(
            menuItemId
          )
        ) {
          throw new Error(
            'Invalid menu item ID.'
          );
        }

        await updateMenuItem(menuItemId, {
          ItemName: form.name.trim(),
          Category: databaseCategory,
          Price: numericPrice,
          PrepTimeDays: Math.max(0, Number(form.prepTimeDays) || 0),
          Description: form.description.trim(),
          Availability: form.availability !== false,
        })
      }

      /*
       * ====================================
       * REMOVE OLD INGREDIENT RELATIONSHIPS
       * ====================================
       *
       * We remove the old rows first and
       * recreate them from the current form.
       */
      // Relationship writes run server-side because the app's custom session is not a Supabase Auth session.


      /*
       * ====================================
       * REMOVE OLD ALLERGEN RELATIONSHIPS
       * ====================================
       */
      // Allergen relationship writes run server-side for the same custom-session RLS boundary.

      /*
       * ====================================
       * SAVE INGREDIENT RELATIONSHIPS
       * ====================================
       */
      {
        const dishIngredientRows =
          form.requiredIngredients.map(
            (ingredient) => ({
              MenuItemID:
                menuItemId,

              IngredientID:
                Number(
                  ingredient.id
                ),

              QuantityRequiredPerServing:
                Number(
                  ingredient.qty
                ),
            })
          );

        try {
          await replaceDishIngredients(menuItemId, dishIngredientRows)
        } catch (error) {
          console.error('DISH_INGREDIENT SAVE ERROR:', error)
          if (!isEditing) {
            await supabase.from('MENU_ITEM').delete().eq('MenuItemID', menuItemId)
          }
          throw error
        }
      }

      /*
       * ====================================
       * SAVE ALLERGEN RELATIONSHIPS
       * ====================================
       */
      {
        const menuAllergyRows = form.allergyTags
          .map((allergen) => {
            const tag = allergyTags.find((allergy) => allergy.AllergenName === allergen)
            return tag ? { MenuItemID: menuItemId, AllergyTagID: tag.AllergyTagID } : null
          })
          .filter((row): row is { MenuItemID: number; AllergyTagID: number } => row !== null)

        try {
          await replaceMenuItemAllergies(menuItemId, menuAllergyRows)
        } catch (error) {
          console.error('MENU_ITEM_ALLERGY SAVE ERROR:', error)
          if (!isEditing) {
            await supabase.from('MENU_ITEM').delete().eq('MenuItemID', menuItemId)
          }
          throw error
        }
      }

      /*
       * ====================================
       * SAVE MENU PHOTO
       * ====================================
       */
      if (selectedPhoto) {
        const { path, token } = await createMenuItemPhotoUpload(
          menuItemId,
          selectedPhoto.type,
          selectedPhoto.size
        )
      
        const { error: uploadError } = await supabase.storage
          .from('menu-images')
          .uploadToSignedUrl(path, token, selectedPhoto, {
            contentType: selectedPhoto.type,
          })
      
        if (uploadError) {
          throw new Error(`Unable to upload menu photo: ${uploadError.message}`)
        }
      
        await saveMenuItemPhotoUrl(menuItemId, path)
      }

      /*
       * ====================================
       * SUCCESS
       * ====================================
       *
       * Supabase is now the source of truth.
       *
       * We intentionally DO NOT call:
       *
       * addMenuItem()
       * updateMenuItem()
       *
       * because those are Zustand/mock
       * operations.
       */

      console.log(
        'MENU ITEM SAVED TO SUPABASE:',
        menuItemId
      );

      /*
       * Tell the parent page that the
       * database has changed.
       */

      onClose();
    } catch (error) {
      console.error(
        'Menu item save error:',
        error
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to save the menu item.'
      );
    } finally {
      setSaving(false);
    }
  };

  /*
   * Shared input styling.
   */
  const inputClass =
    'mt-1.5 h-11 w-full rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm text-[#2B1D16] outline-none transition-colors placeholder:text-[#2B1D16]/40 focus:border-[#C8431B] focus:ring-2 focus:ring-[#C8431B]/20';
  const labelClass = 'text-xs font-semibold uppercase tracking-wide text-[#2B1D16]/60';
  const sectionClass = 'rounded-2xl border border-[#E8D8C4] bg-[#FBF6EE] p-5';
  const sectionTitle = 'mb-4 font-heading text-sm font-bold uppercase tracking-wide text-[#C8431B]';

  const ingredientGroups: DropdownGroup[] = Object.entries(
    ingredients.reduce<Record<IngredientCategory, DbIngredient[]>>(
      (groups, ingredient) => {
        groups[getIngredientCategory(ingredient)].push(ingredient)
        return groups
      },
      { meats: [], dairy: [], baking: [], produce: [], pantry: [], herbs_spices: [], other: [] }
    )
  )
    .filter(([, list]) => list.length > 0)
    .map(([category, list]) => ({
      label: ingredientCategoryLabels[category as IngredientCategory],
      options: list.map((ingredient) => ({
        value: String(ingredient.IngredientID),
        label: ingredient.IngredientName,
        hint: ingredient.UnitOfMeasure || 'unit',
      })),
    }));
  const pickedUnit =
    ingredients.find((ingredient) => String(ingredient.IngredientID) === ingredientId)?.UnitOfMeasure || 'unit';
  const allergenList = (
    allergyTags.length > 0
      ? allergyTags
      : FALLBACK_ALLERGEN_OPTIONS.map((name, index) => ({ AllergyTagID: index + 1, AllergenName: name }))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B1D16]/55 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* HEADER */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E8D8C4] px-6 py-5">
          <div>
            <h2 className="font-heading text-2xl font-bold uppercase text-[#2B1D16]">
              {isEditing ? 'Edit menu item' : 'Add menu item'}
            </h2>
            <p className="mt-1 text-sm text-[#2B1D16]/60">
              {isEditing
                ? 'Changes to the price only apply to new orders. Old bookings keep the price they were made at.'
                : 'Add a dish, its price and the ingredients it needs per serving.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-[#2B1D16]/60 transition-colors hover:bg-[#f1f1f2] hover:text-[#2B1D16]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        {loadingData ? (
          <PageLoader compact label="Loading menu item" />
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">

              {errorMessage && (
                <div role="alert" className="rounded-xl border border-[#B3261E]/30 bg-[#F8DDD9] p-3 text-sm font-medium text-[#B3261E]">
                  {errorMessage}
                </div>
              )}

              {/* BASICS */}
              <section className={sectionClass}>
                <h3 className={sectionTitle}>Dish details</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className={labelClass}>Name *</label>
                    <input
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={inputClass}
                      placeholder="Dish name"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className={labelClass}>Description *</label>
                    <textarea
                      required
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      className={`${inputClass} h-auto py-2.5`}
                      placeholder="Short description for customers"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Category</label>
                    <Dropdown
                      className="mt-1.5"
                      ariaLabel="Category"
                      value={form.category as string}
                      onChange={(category) => setForm({ ...form, category: category as MenuItem['category'] })}
                      groups={[{ options: CATEGORIES.map((c) => ({ value: c as string, label: c.charAt(0).toUpperCase() + c.slice(1) })) }]}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Price per serving</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 mt-[3px] -translate-y-1/2 text-sm font-semibold text-[#C8431B]">₱</span>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        className={`${inputClass} pl-7`}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Prep time (days)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.prepTimeDays}
                      onChange={(e) => setForm({ ...form, prepTimeDays: parseInt(e.target.value, 10) || 0 })}
                      className={inputClass}
                    />
                  </div>

                  <div className="flex items-end">
                    <label className="flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#E8D8C4] bg-white px-3 text-sm text-[#2B1D16]">
                      <span className="font-medium">Available for ordering</span>
                      <input
                        type="checkbox"
                        checked={form.availability !== false}
                        onChange={(e) => setForm({ ...form, availability: e.target.checked })}
                        className="peer sr-only"
                      />
                      <span aria-hidden="true" className="relative h-6 w-11 rounded-full bg-[#E8D8C4] transition-colors peer-checked:bg-[#C8431B] after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                </div>
              </section>

              {/* PHOTO */}
              <section className={sectionClass}>
                <h3 className={sectionTitle}>Photo</h3>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex h-32 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-[#DCC7A8] bg-white sm:w-44">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt={form.name ? `${form.name} preview` : 'Menu preview'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="px-3 text-center text-sm text-[#2B1D16]/50">No photo selected</span>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col gap-2">
                    <p className="text-xs text-[#2B1D16]/60">JPG, PNG or WebP. Up to 5 MB.</p>
                    <label className="inline-flex h-10 w-fit cursor-pointer items-center rounded-full bg-[#C8431B] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#A93615]">
                      {photoPreview ? 'Change photo' : 'Choose photo'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;

                          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                            setErrorMessage('Please select a JPG, PNG, or WebP image.');
                            return;
                          }

                          if (file.size > 5 * 1024 * 1024) {
                            setErrorMessage('Photo must be 5 MB or smaller.');
                            return;
                          }

                          setSelectedPhoto(file);
                          setPhotoPreview(URL.createObjectURL(file));
                          setErrorMessage('');
                        }}
                      />
                    </label>
                    {selectedPhoto && <p className="text-xs text-[#2B1D16]/60">Selected: {selectedPhoto.name}</p>}
                  </div>
                </div>
              </section>

              {/* ALLERGENS */}
              <section className={sectionClass}>
                <h3 className={sectionTitle}>Allergens in this dish</h3>
                <div className="flex flex-wrap gap-2">
                  {allergenList.map((tag) => {
                    const allergen = tag.AllergenName as AllergenType;
                    const checked = form.allergyTags.includes(allergen);
                    return (
                      <label
                        key={tag.AllergyTagID}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium capitalize transition-colors ${
                          checked ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
                        }`}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleAllergen(allergen)} className="sr-only" />
                        {checked && <Check className="size-3.5" aria-hidden="true" />}
                        {allergenLabel(tag.AllergenName)}
                      </label>
                    );
                  })}
                </div>
              </section>

              {/* REQUIRED INGREDIENTS */}
              <section className={sectionClass}>
                <h3 className={sectionTitle}>Ingredients per serving</h3>

                {form.requiredIngredients.length > 0 ? (
                  <ul className="mb-4 grid gap-2 sm:grid-cols-2">
                    {form.requiredIngredients.map((required) => (
                      <li
                        key={required.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-[#E8D8C4] bg-white px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate font-medium text-[#2B1D16]">{required.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full bg-[#F6E3D3] px-2.5 py-0.5 text-xs font-semibold text-[#C8431B]">
                            {required.qty} {required.unit}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeIngredient(required.id)}
                            aria-label={`Remove ${required.name}`}
                            className="rounded-full p-1 text-[#2B1D16]/50 transition-colors hover:bg-[#F8DDD9] hover:text-[#B3261E]"
                          >
                            <X className="size-4" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-4 rounded-xl border border-dashed border-[#DCC7A8] bg-white px-4 py-3 text-sm text-[#2B1D16]/60">
                    No ingredients yet. Add what one serving needs so stock can be checked.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                  <div>
                    <label className={labelClass}>Ingredient</label>
                    <Dropdown
                      className="mt-1.5"
                      searchable
                      ariaLabel="Ingredient"
                      placeholder="Choose an ingredient"
                      value={ingredientId}
                      onChange={setIngredientId}
                      groups={ingredientGroups}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Qty ({pickedUnit})</label>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={ingredientQty}
                      onChange={(e) => setIngredientQty(e.target.value)}
                      className={inputClass}
                      placeholder="0"
                    />
                  </div>

                  <Button
                    type="button"
                    onClick={addIngredient}
                    className="h-11 rounded-lg bg-[#2B1D16] px-5 text-white hover:bg-black"
                  >
                    Add
                  </Button>
                </div>
              </section>
            </div>

            {/* ACTION BUTTONS */}
            <div className="flex gap-3 border-t border-[#E8D8C4] bg-white px-6 py-4">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-lg border-[#E8D8C4] text-[#2B1D16] hover:bg-[#f1f1f2]"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="h-11 flex-[2] rounded-lg bg-[#C8431B] font-semibold text-white hover:bg-[#A93615]"
              >
                {saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add item'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
