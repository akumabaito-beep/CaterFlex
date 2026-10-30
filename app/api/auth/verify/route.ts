import { type NextRequest, NextResponse } from 'next/server'
import { hashToken } from '@/lib/email-verification'
import { createAdminClient } from '@/lib/supabase-admin'
import { encodeSession, SESSION_COOKIE } from '@/lib/session-cookie'
import type { User } from '@/lib/types'

// The link in the confirmation email lands here.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.redirect(new URL('/login?error=verify_failed', request.url))

  const admin = createAdminClient()
  const { data: customer } = await admin
    .from('CUSTOMER')
    .select('CustomerID, Name, Email, EmailVerifyExpires')
    .eq('EmailVerifyTokenHash', hashToken(token))
    .maybeSingle()

  const expired = !customer?.EmailVerifyExpires || new Date(customer.EmailVerifyExpires).getTime() < Date.now()
  if (!customer || expired) {
    return NextResponse.redirect(new URL('/login?error=verify_failed', request.url))
  }

  const { error } = await admin
    .from('CUSTOMER')
    .update({ EmailVerified: true, EmailVerifyTokenHash: null, EmailVerifyExpires: null })
    .eq('CustomerID', customer.CustomerID)
  if (error) return NextResponse.redirect(new URL('/login?error=verify_failed', request.url))

  const user: User = {
    id: String(customer.CustomerID),
    name: customer.Name,
    email: customer.Email,
    role: 'customer',
  }
  const response = NextResponse.redirect(new URL('/customer/inquiry', request.url))
  response.cookies.set(SESSION_COOKIE, await encodeSession(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}