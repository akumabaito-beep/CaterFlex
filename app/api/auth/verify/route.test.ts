import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient }))
vi.mock('@/lib/session-cookie', () => ({ SESSION_COOKIE: 'session', encodeSession: async () => 'token' }))

import { NextRequest } from 'next/server'
import { hashToken } from '@/lib/email-verification'
import { GET } from './route'

const update = vi.fn()

function db(row: unknown) {
  createAdminClient.mockReturnValue({
    from: () => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = (_c: string, v: string) => { chain.lastEq = v; return chain }
      chain.maybeSingle = async () => ({ data: row && chain.lastEq === hashToken('good') ? row : null, error: null })
      chain.update = (v: unknown) => { update(v); return { eq: async () => ({ error: null }) } }
      return chain
    },
  })
}

const call = (token?: string) => GET(new NextRequest(`http://localhost:3000/api/auth/verify${token ? `?token=${token}` : ''}`))
const where = (r: Response) => new URL(r.headers.get('location')!).pathname + new URL(r.headers.get('location')!).search
const future = new Date(Date.now() + 3600_000).toISOString()

describe('email confirmation link', () => {
  beforeEach(() => vi.clearAllMocks())

  it('confirms the account and signs the customer in', async () => {
    db({ CustomerID: 4, Name: 'Maria', Email: 'm@x.com', EmailVerifyExpires: future })
    const res = await call('good')
    expect(where(res)).toBe('/customer/inquiry')
    expect(update).toHaveBeenCalledWith({ EmailVerified: true, EmailVerifyTokenHash: null, EmailVerifyExpires: null })
    expect(res.headers.get('set-cookie')).toContain('session=token')
  })

  it('rejects an unknown token', async () => {
    db({ CustomerID: 4, Name: 'Maria', Email: 'm@x.com', EmailVerifyExpires: future })
    expect(where(await call('bad'))).toBe('/login?error=verify_failed')
    expect(update).not.toHaveBeenCalled()
  })

  it('rejects an expired token and a missing token', async () => {
    db({ CustomerID: 4, Name: 'Maria', Email: 'm@x.com', EmailVerifyExpires: new Date(Date.now() - 1000).toISOString() })
    expect(where(await call('good'))).toBe('/login?error=verify_failed')
    expect(where(await call())).toBe('/login?error=verify_failed')
  })
})