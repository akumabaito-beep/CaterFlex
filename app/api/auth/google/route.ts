import { randomBytes } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'

const GOOGLE_STATE_COOKIE = 'caterflex-google-state'

// Step 1: send the browser to Google's account chooser.
export async function GET(request: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(new URL('/login?error=google_unavailable', request.url))
  }

  const state = randomBytes(24).toString('hex')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: new URL('/api/auth/google/callback', request.url).toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })

  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  response.cookies.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: 60 * 10,
  })
  return response
}