
'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { validatePerServingQuantity } from '@/lib/rules/quantity-validation'
import type { MealType } from '@/lib/types'

type MenuItemUpdate = {
  ItemName: string
  Category: string
  MealType: MealType
  Price: number
  PrepTimeDays: number
  Description: string
  Availability: boolean
}

type MenuItemCreate = MenuItemUpdate

type DishIngredientRow = {
  MenuItemID: number
  IngredientID: number
  QuantityRequiredPerServing: number
}

type MenuAllergyRow = {
  MenuItemID: number
  AllergyTagID: number
}

const MENU_PHOTO_BUCKET = 'menu-images'
const MAX_MENU_PHOTO_SIZE = 5 * 1024 * 1024

const ALLOWED_MENU_PHOTO_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

type AdminClient = ReturnType<typeof createAdminClient>

async function nextPriceId(admin: AdminClient) {
  const { data, error } = await admin
    .from('PRICES')
    .select('PriceID')
    .order('PriceID', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  return Number(data?.PriceID ?? 0) + 1
}

/**
 * PRICES.PriceID uses a sequence that can lag behind existing rows
 * (bulk imports with explicit IDs). Always pick max(PriceID)+1.
 */
async function insertActivePrice(
  admin: AdminClient,
  menuItemId: number,
  price: number
) {
  const now = new Date().toISOString()
  let priceId = await nextPriceId(admin)

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await admin.from('PRICES').insert({
      PriceID: priceId,
      MenuItemID: menuItemId,
      Price: price,
      EffectiveFrom: now,
      EffectiveTo: null,
      ChangedAt: now,
    })

    if (!error) return

    if (error.code !== '23505') {
      throw new Error(error.message)
    }

    priceId += 1
  }

  throw new Error('Unable to record the menu item price.')
}

async function replaceActivePrice(
  admin: AdminClient,
  menuItemId: number,
  price: number
) {
  const { data: current, error: currentError } = await admin
    .from('PRICES')
    .select('PriceID, Price')
    .eq('MenuItemID', menuItemId)
    .is('EffectiveTo', null)
    .maybeSingle()

  if (currentError) throw new Error(currentError.message)

  if (current && Number(current.Price) === Number(price)) return

  if (current) {
    const { error: closeError } = await admin
      .from('PRICES')
      .update({ EffectiveTo: new Date().toISOString() })
      .eq('PriceID', current.PriceID)

    if (closeError) throw new Error(closeError.message)
  }

  await insertActivePrice(admin, menuItemId, price)
}

export async function createMenuItem(values: MenuItemCreate) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('MENU_ITEM')
    .insert({
      ItemName: values.ItemName,
      Category: values.Category,
      MealType: values.MealType,
      Price: values.Price,
      PrepTimeDays: values.PrepTimeDays,
      Description: values.Description,
      Availability: values.Availability,
    })
    .select('MenuItemID')
    .single()

  if (error || data == null) {
    throw new Error(error?.message ?? 'Unable to create the menu item.')
  }

  const menuItemId = Number(data.MenuItemID)

  try {
    await insertActivePrice(admin, menuItemId, values.Price)
  } catch (priceError) {
    await admin.from('MENU_ITEM').delete().eq('MenuItemID', menuItemId)
    throw priceError
  }

  return menuItemId
}

export async function updateMenuItem(
  menuItemId: number,
  values: MenuItemUpdate
) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const { error } = await admin
    .from('MENU_ITEM')
    .update({
      ItemName: values.ItemName,
      Category: values.Category,
      MealType: values.MealType,
      Price: values.Price,
      PrepTimeDays: values.PrepTimeDays,
      Description: values.Description,
      Availability: values.Availability,
    })
    .eq('MenuItemID', menuItemId)

  if (error) {
    throw new Error(error.message)
  }

  await replaceActivePrice(admin, menuItemId, values.Price)
}

export async function replaceMenuItemAllergies(
  menuItemId: number,
  rows: MenuAllergyRow[]
) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  const admin = createAdminClient()

  const { error: deleteError } = await admin
    .from('MENU_ITEM_ALLERGY')
    .delete()
    .eq('MenuItemID', menuItemId)

  if (deleteError) throw new Error(deleteError.message)

  if (rows.length === 0) return

  const { error: insertError } = await admin
    .from('MENU_ITEM_ALLERGY')
    .insert(rows)

  if (insertError) throw new Error(insertError.message)
}

export async function replaceDishIngredients(
  menuItemId: number,
  rows: DishIngredientRow[]
) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  const invalidQuantity = rows
    .map((row) => validatePerServingQuantity(row.QuantityRequiredPerServing))
    .find(Boolean)
  if (invalidQuantity) throw new Error(invalidQuantity)

  const admin = createAdminClient()

  const { error: deleteError } = await admin
    .from('DISH_INGREDIENT')
    .delete()
    .eq('MenuItemID', menuItemId)

  if (deleteError) throw new Error(deleteError.message)

  if (rows.length === 0) return

  const { error: insertError } = await admin
    .from('DISH_INGREDIENT')
    .insert(rows)

  if (insertError) throw new Error(insertError.message)
}

/**
 * Creates a short-lived signed upload URL.
 * The image itself is uploaded directly from the browser.
 */
export async function createMenuItemPhotoUpload(
  menuItemId: number,
  contentType: string,
  fileSize: number
) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  if (!Number.isSafeInteger(menuItemId) || menuItemId <= 0) {
    throw new Error('Invalid menu item ID.')
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      ALLOWED_MENU_PHOTO_TYPES,
      contentType
    )
  ) {
    throw new Error('Please upload a JPG, PNG, or WebP image.')
  }

  if (
    !Number.isFinite(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_MENU_PHOTO_SIZE
  ) {
    throw new Error('Photo must be greater than 0 bytes and 5 MB or smaller.')
  }

  const admin = createAdminClient()

  const { data: menuItem, error: menuError } = await admin
    .from('MENU_ITEM')
    .select('MenuItemID')
    .eq('MenuItemID', menuItemId)
    .maybeSingle()

  if (menuError || !menuItem) {
    throw new Error('Menu item not found.')
  }

  const extension =
    ALLOWED_MENU_PHOTO_TYPES[
      contentType as keyof typeof ALLOWED_MENU_PHOTO_TYPES
    ]

  const path = `${menuItemId}/${crypto.randomUUID()}.${extension}`

  const { data, error } = await admin.storage
    .from(MENU_PHOTO_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) {
    throw new Error(
      `Unable to prepare photo upload: ${error?.message ?? 'Unknown error'}`
    )
  }

  return {
    path: data.path,
    token: data.token,
  }
}

/**
 * Saves the new public URL, then removes the previous file.
 * The previous file is retained if the database update fails.
 */
export async function saveMenuItemPhotoUrl(
  menuItemId: number,
  path: string
) {
  const user = await requireRole('owner')
  if (!user) throw new Error('Unauthorized')

  if (!Number.isSafeInteger(menuItemId) || menuItemId <= 0) {
    throw new Error('Invalid menu item ID.')
  }

  const validPath = new RegExp(
    `^${menuItemId}/[0-9a-f-]+\\.(jpg|png|webp)$`,
    'i'
  )

  if (!validPath.test(path)) {
    throw new Error('Invalid menu photo path.')
  }

  const admin = createAdminClient()

  const { data: menuItem, error: fetchError } = await admin
    .from('MENU_ITEM')
    .select('MenuItemID, PhotoURL')
    .eq('MenuItemID', menuItemId)
    .maybeSingle()

  if (fetchError || !menuItem) {
    throw new Error('Menu item not found.')
  }

  const oldPath = getMenuImagePath(menuItem.PhotoURL)

  const { data: publicUrlData } = admin.storage
    .from(MENU_PHOTO_BUCKET)
    .getPublicUrl(path)

  const { error: updateError } = await admin
    .from('MENU_ITEM')
    .update({ PhotoURL: publicUrlData.publicUrl })
    .eq('MenuItemID', menuItemId)

  if (updateError) {
    // Keep the old file if saving the new URL fails.
    // Clean up the newly uploaded file where possible.
    const { error: cleanupError } = await admin.storage
      .from(MENU_PHOTO_BUCKET)
      .remove([path])

    if (cleanupError) {
      console.error('New menu photo cleanup failed:', cleanupError)
    }

    throw new Error(
      `Could not save the new photo URL: ${updateError.message}`
    )
  }

  if (oldPath && oldPath !== path) {
    const { error: deleteError } = await admin.storage
      .from(MENU_PHOTO_BUCKET)
      .remove([oldPath])

    if (deleteError) {
      console.error('Old menu photo cleanup failed:', deleteError)
    }
  }

  return publicUrlData.publicUrl
}

/**
 * Extracts a Storage path only from a public URL in our own bucket.
 */
function getMenuImagePath(photoUrl: string | null): string | null {
  if (!photoUrl) return null

  const marker = '/storage/v1/object/public/menu-images/'
  const index = photoUrl.indexOf(marker)

  if (index === -1) return null

  const path = photoUrl.slice(index + marker.length)

  try {
    return decodeURIComponent(path)
  } catch {
    return null
  }
}