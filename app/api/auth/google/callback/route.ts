import { type NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { encodeSession, SESSION_COOKIE } from '@/lib/session-cookie'
import type { User } from '@/lib/types'

const STATE_COOKIE = 'caterflex-google-state'

function fail(request: NextRequest, code: string) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.url))
  response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google' })
  return response
}

function readIdToken(idToken: string): Record<string, unknown> | null {
  try {
    const payload = idToken.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

// Step 2: Google sends the browser back here with a one-time code.
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return fail(request, 'google_unavailable')

  if (url.searchParams.get('error')) return fail(request, 'google_cancelled')

  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const savedState = request.cookies.get(STATE_COOKIE)?.value
  if (!code || !state || !savedState || state !== savedState) return fail(request, 'google_failed')

  // The id_token below comes straight from Google's token endpoint over TLS,
  // so it is trusted once its audience, issuer, expiry and email flag check out.
  let claims: Record<string, unknown> | null = null
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: new URL('/api/auth/google/callback', request.url).toString(),
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenResponse.ok) return fail(request, 'google_failed')
    const tokens = (await tokenResponse.json()) as { id_token?: string }
    claims = tokens.id_token ? readIdToken(tokens.id_token) : null
  } catch {
    return fail(request, 'google_failed')
  }

  const issuerOk = claims?.iss === 'https://accounts.google.com' || claims?.iss === 'accounts.google.com'
  const expired = typeof claims?.exp !== 'number' || claims.exp * 1000 < Date.now()
  const email = typeof claims?.email === 'string' ? claims.email.trim() : ''
  if (!claims || claims.aud !== clientId || !issuerOk || expired || claims.email_verified !== true || !email) {
    return fail(request, 'google_failed')
  }

  const admin = createAdminClient()

  // Business owners sign in with their password only.
  const { data: owner, error: ownerError } = await admin
    .from('BUSINESS_OWNER')
    .select('OperatorID')
    .ilike('Email', email)
    .maybeSingle()
  if (ownerError) return fail(request, 'google_failed')
  if (owner) return fail(request, 'google_owner')

  const { data: existing, error: lookupError } = await admin
    .from('CUSTOMER')
    .select('CustomerID, Name, Email')
    .ilike('Email', email)
    .maybeSingle()
  if (lookupError) return fail(request, 'google_failed')

  let customer = existing
  if (!customer) {
    const name = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : email.split('@')[0]
    const { data: created, error: insertError } = await admin
      .from('CUSTOMER')
      .insert({ Name: name, Contact: '', Email: email, Password: null })
      .select('CustomerID, Name, Email')
      .single()
    if (insertError || !created) return fail(request, 'google_failed')
    customer = created
  }

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
  response.cookies.delete({ name: STATE_COOKIE, path: '/api/auth/google' })
  return response
}