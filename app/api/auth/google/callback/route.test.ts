import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient }))
vi.mock('@/lib/session-cookie', () => ({ SESSION_COOKIE: 'session', encodeSession: async () => 'token' }))

import { NextRequest } from 'next/server'
import { GET } from './route'

const CLIENT_ID = 'client-123'

function idToken(claims: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `x.${body}.y`
}
const goodClaims = {
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 600,
  email: 'Juan@Gmail.com',
  email_verified: true,
  name: 'Juan Dela Cruz',
}

function request(opts: { state?: string; cookie?: string; error?: string } = {}) {
  const url = new URL('http://localhost:3000/api/auth/google/callback')
  if (opts.error) url.searchParams.set('error', opts.error)
  else {
    url.searchParams.set('code', 'abc')
    url.searchParams.set('state', opts.state ?? 's1')
  }
  return new NextRequest(url, { headers: { cookie: `caterflex-google-state=${opts.cookie ?? 's1'}` } })
}

function db(tables: { owner?: unknown; customer?: unknown }, inserted = vi.fn()) {
  createAdminClient.mockReturnValue({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.ilike = () => chain
      chain.maybeSingle = async () => ({ data: table === 'BUSINESS_OWNER' ? (tables.owner ?? null) : (tables.customer ?? null), error: null })
      chain.insert = (row: unknown) => { inserted(row); return chain }
      chain.single = async () => ({ data: { CustomerID: 99, Name: 'Juan Dela Cruz', Email: 'Juan@Gmail.com' }, error: null })
      return chain
    },
  })
  return inserted
}

function googleReturns(claims: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ id_token: idToken(claims) }) })))
}
const location = (res: Response) => new URL(res.headers.get('location')!).pathname + new URL(res.headers.get('location')!).search

describe('Google callback', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID
    process.env.GOOGLE_CLIENT_SECRET = 'secret'
  })

  it('creates a customer and signs them in', async () => {
    googleReturns(goodClaims)
    const inserted = db({})
    const res = await GET(request())
    expect(location(res)).toBe('/customer/inquiry')
    expect(inserted).toHaveBeenCalledWith({ Name: 'Juan Dela Cruz', Contact: '', Email: 'Juan@Gmail.com', Password: null, EmailVerified: true })
    expect(res.headers.get('set-cookie')).toContain('session=token')
  })

  it('signs in an existing customer without creating a new one', async () => {
    googleReturns(goodClaims)
    const inserted = db({ customer: { CustomerID: 5, Name: 'Juan', Email: 'juan@gmail.com' } })
    const res = await GET(request())
    expect(location(res)).toBe('/customer/inquiry')
    expect(inserted).not.toHaveBeenCalled()
  })

  it('refuses owner emails', async () => {
    googleReturns(goodClaims)
    db({ owner: { OperatorID: 2 } })
    expect(location(await GET(request()))).toBe('/login?error=google_owner')
  })

  it('rejects a mismatched state', async () => {
    googleReturns(goodClaims)
    db({})
    expect(location(await GET(request({ state: 'evil' })))).toBe('/login?error=google_failed')
  })

  it('rejects unverified emails and wrong audience', async () => {
    db({})
    googleReturns({ ...goodClaims, email_verified: false })
    expect(location(await GET(request()))).toBe('/login?error=google_failed')
    googleReturns({ ...goodClaims, aud: 'other' })
    expect(location(await GET(request()))).toBe('/login?error=google_failed')
  })

  it('handles the user cancelling', async () => {
    expect(location(await GET(request({ error: 'access_denied' })))).toBe('/login?error=google_cancelled')
  })
})