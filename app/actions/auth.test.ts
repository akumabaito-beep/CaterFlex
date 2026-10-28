import bcrypt from 'bcryptjs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createAdminClient, cookieSet } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  cookieSet: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet, get: vi.fn(), delete: vi.fn() }),
}))
vi.mock('@/lib/session-cookie', () => ({
  SESSION_COOKIE: 'session',
  encodeSession: async () => 'token',
  decodeSession: async () => null,
}))

import { signInAny, signUpCustomer } from './auth'

const hash = bcrypt.hashSync('secret123', 4)

function tables(rows: Record<string, unknown>) {
  createAdminClient.mockReturnValue({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        update: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      }
      return chain
    },
  })
}

describe('signInAny', () => {
  beforeEach(() => vi.clearAllMocks())

  it('signs in an owner without being told the role', async () => {
    tables({ BUSINESS_OWNER: { OperatorID: 2, OwnerName: 'Owner', Email: 'o@x.com', Password: hash } })
    const result = await signInAny({ email: 'o@x.com', password: 'secret123' })
    expect(result.ok && result.user.role).toBe('owner')
  })

  it('signs in a customer without being told the role', async () => {
    tables({ CUSTOMER: { CustomerID: 7, Name: 'Cus', Email: 'c@x.com', Password: hash } })
    const result = await signInAny({ email: 'c@x.com', password: 'secret123' })
    expect(result.ok && result.user.role).toBe('customer')
  })

  it('rejects a wrong password with the same generic message', async () => {
    tables({ CUSTOMER: { CustomerID: 7, Name: 'Cus', Email: 'c@x.com', Password: hash } })
    const result = await signInAny({ email: 'c@x.com', password: 'nope' })
    expect(result).toEqual({ ok: false, error: 'Invalid email or password.' })
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('rejects an unknown email', async () => {
    tables({})
    const result = await signInAny({ email: 'zz@x.com', password: 'secret123' })
    expect(result).toEqual({ ok: false, error: 'Invalid email or password.' })
  })
})

describe('signUpCustomer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('needs only an email and password; name defaults to the email prefix and contact is blank', async () => {
    const insert = vi.fn()
    createAdminClient.mockReturnValue({
      from: () => {
        const chain: Record<string, unknown> = {}
        chain.select = () => chain
        chain.eq = () => chain
        chain.maybeSingle = async () => ({ data: null, error: null })
        chain.insert = (row: unknown) => { insert(row); return chain }
        chain.single = async () => ({ data: { CustomerID: 1, Name: 'maria', Email: 'maria@x.com' }, error: null })
        return chain
      },
    })
    const result = await signUpCustomer({ email: 'maria@x.com', password: 'secret123' })
    expect(result.ok).toBe(true)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ Name: 'maria', Contact: '', Email: 'maria@x.com' }))
  })

  it('still rejects short passwords', async () => {
    const result = await signUpCustomer({ email: 'a@x.com', password: '123' })
    expect(result.ok).toBe(false)
  })
})