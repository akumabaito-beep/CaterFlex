'use server'

import bcrypt from 'bcryptjs'
import { timingSafeEqual } from 'crypto'
import { cookies, headers } from 'next/headers'
import { sendVerificationEmail } from '@/lib/email'
import { newVerificationToken, VERIFY_RESEND_COOLDOWN_MS } from '@/lib/email-verification'
import { createAdminClient } from '@/lib/supabase-admin'
import { decodeSession, encodeSession, SESSION_COOKIE } from '@/lib/session-cookie'
import type { User, UserRole } from '@/lib/types'

type AuthSuccess = { ok: true; user: User }
type AuthFailure = { ok: false; error: string; code?: 'unverified' }
export type AuthActionResult = AuthSuccess | AuthFailure
export type SignUpActionResult = AuthFailure | { ok: true; pendingVerification: true; email: string }

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

async function verificationLink(token: string) {
  return `${await siteOrigin()}/api/auth/verify?token=${encodeURIComponent(token)}`
}

function passwordsMatch(stored: string | null | undefined, provided: string) {
  if (!stored) return false
  const a = Buffer.from(stored)
  const b = Buffer.from(provided)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function isBcryptHash(value: string) {
  return /^\$2[aby]?\$\d{2}\$/.test(value)
}

async function verifyPassword(stored: string | null | undefined, provided: string) {
  if (!stored) return { valid: false, needsUpgrade: false }

  if (isBcryptHash(stored)) {
    return {
      valid: await bcrypt.compare(provided, stored),
      needsUpgrade: false,
    }
  }

  return {
    valid: passwordsMatch(stored, provided),
    needsUpgrade: true,
  }
}

async function setSessionCookie(user: User) {
  const store = await cookies()
  store.set(SESSION_COOKIE, await encodeSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getAuthSession(): Promise<User | null> {
  const store = await cookies()
  return decodeSession(store.get(SESSION_COOKIE)?.value)
}

export async function requireRole(role: UserRole): Promise<User | null> {
  const user = await getAuthSession()
  if (!user || user.role !== role) return null
  return user
}

export async function signUpCustomer(input: {
  name?: string
  contact?: string
  email: string
  password: string
}): Promise<SignUpActionResult> {
  const email = input.email.trim()
  const password = input.password
  // Name and contact are optional at sign-up; the name defaults to the email's local part.
  const name = input.name?.trim() || email.split('@')[0]
  const contact = input.contact?.trim() ?? ''

  if (!email || !name || password.length < 6) {
    return { ok: false, error: 'Enter your email and a password with at least 6 characters.' }
  }

  const admin = createAdminClient()
  const { data: existing, error: existingError } = await admin
    .from('CUSTOMER')
    .select('CustomerID')
    .eq('Email', email)
    .maybeSingle()

  if (existingError) {
    return { ok: false, error: 'Could not create the customer profile.' }
  }
  if (existing) {
    return { ok: false, error: 'This email already has a customer profile. Sign in instead.' }
  }

  const passwordHash = await bcrypt.hash(password, 12)
  const verification = newVerificationToken()
  const { data, error } = await admin
    .from('CUSTOMER')
    .insert({
      Name: name,
      Contact: contact,
      Email: email,
      Password: passwordHash,
      EmailVerified: false,
      EmailVerifyTokenHash: verification.hash,
      EmailVerifyExpires: verification.expires,
      EmailVerifySentAt: new Date().toISOString(),
    })
    .select('CustomerID')
    .single()

  if (error || !data) {
    return { ok: false, error: 'Could not create the customer profile.' }
  }

  // The account only becomes usable once the address proves it is real by opening this link.
  try {
    await sendVerificationEmail(email, name, await verificationLink(verification.token))
  } catch (sendError) {
    console.error('Verification email failed:', sendError)
    await admin.from('CUSTOMER').delete().eq('CustomerID', data.CustomerID)
    return { ok: false, error: 'We could not send a confirmation email to that address. Check it and try again.' }
  }

  return { ok: true, pendingVerification: true, email }
}

// Sends a fresh confirmation link. Always answers the same way so it cannot be used to find out which emails are registered.
export async function resendVerification(emailInput: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = emailInput.trim()
  if (!email) return { ok: false, error: 'Enter your email first.' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('CUSTOMER')
    .select('CustomerID, Name, EmailVerified, EmailVerifySentAt')
    .eq('Email', email)
    .maybeSingle()

  if (data && data.EmailVerified === false) {
    const lastSent = data.EmailVerifySentAt ? new Date(data.EmailVerifySentAt).getTime() : 0
    if (Date.now() - lastSent < VERIFY_RESEND_COOLDOWN_MS) {
      return { ok: false, error: 'Please wait a minute before requesting another email.' }
    }
    const verification = newVerificationToken()
    await admin
      .from('CUSTOMER')
      .update({
        EmailVerifyTokenHash: verification.hash,
        EmailVerifyExpires: verification.expires,
        EmailVerifySentAt: new Date().toISOString(),
      })
      .eq('CustomerID', data.CustomerID)
    try {
      await sendVerificationEmail(email, data.Name, await verificationLink(verification.token))
    } catch (sendError) {
      console.error('Verification email failed:', sendError)
      return { ok: false, error: 'We could not send the email right now. Please try again later.' }
    }
  }
  return { ok: true }
}

export async function signInCustomer(input: {
  email: string
  password: string
}): Promise<AuthActionResult> {
  const email = input.email.trim()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('CUSTOMER')
    .select('CustomerID, Name, Email, Password, EmailVerified')
    .eq('Email', email)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'Could not load the customer profile.' }
  }
  const passwordCheck = await verifyPassword(data?.Password, input.password)
  if (!data || !passwordCheck.valid) {
    return { ok: false, error: 'Invalid email or password.' }
  }

  if (data.EmailVerified === false) {
    return { ok: false, code: 'unverified', error: 'Please confirm your email first. Check your inbox for the link.' }
  }

  if (passwordCheck.needsUpgrade) {
    const passwordHash = await bcrypt.hash(input.password, 12)
    await admin
      .from('CUSTOMER')
      .update({ Password: passwordHash })
      .eq('CustomerID', data.CustomerID)
  }

  const user: User = {
    id: String(data.CustomerID),
    name: data.Name,
    email: data.Email,
    role: 'customer',
  }
  await setSessionCookie(user)
  return { ok: true, user }
}

export async function signInOwner(input: {
  email: string
  password: string
}): Promise<AuthActionResult> {
  const email = input.email.trim()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('BUSINESS_OWNER')
    .select('OperatorID, OwnerName, Email, Password')
    .eq('Email', email)
    .maybeSingle()

  if (error) {
    return { ok: false, error: 'Could not load the owner profile.' }
  }
  const passwordCheck = await verifyPassword(data?.Password, input.password)
  if (!data || !passwordCheck.valid) {
    return { ok: false, error: 'Invalid email or password.' }
  }

  if (passwordCheck.needsUpgrade) {
    const passwordHash = await bcrypt.hash(input.password, 12)
    await admin
      .from('BUSINESS_OWNER')
      .update({ Password: passwordHash })
      .eq('OperatorID', data.OperatorID)
  }

  const user: User = {
    id: String(data.OperatorID),
    name: data.OwnerName,
    email: data.Email,
    role: 'owner',
  }
  await setSessionCookie(user)
  return { ok: true, user }
}

// One sign-in for every role: the account's role is found from the credentials,
// so the caller does not need to know whether it is an owner or a customer.
export async function signInAny(input: {
  email: string
  password: string
}): Promise<AuthActionResult> {
  const owner = await signInOwner(input)
  if (owner.ok) return owner
  return signInCustomer(input)
}

export async function signOutSession() {
  await clearSessionCookie()
}

export async function getCustomersByIds(customerIds: number[]) {
  const owner = await requireRole('owner')
  if (!owner) {
    return { ok: false as const, error: 'Owner access required.', customers: [] }
  }

  const uniqueIds = Array.from(new Set(customerIds.filter((id) => Number.isFinite(id))))
  if (uniqueIds.length === 0) {
    return { ok: true as const, customers: [] }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('CUSTOMER')
    .select('CustomerID, Name, Email, Contact')
    .in('CustomerID', uniqueIds)

  if (error) {
    return { ok: false as const, error: 'Could not load customers.', customers: [] }
  }

  return { ok: true as const, customers: data ?? [] }
}