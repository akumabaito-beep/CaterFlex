import {
  getAuthSession,
  signInAny,
  signInCustomer,
  signInOwner,
  signOutSession,
  signUpCustomer,
  resendVerification,
} from '@/app/actions/auth'
import { useAppState } from '@/lib/state'
import type { User, UserRole } from '@/lib/types'

export type AuthSuccess = { ok: true; user: User }
export type AuthFailure = { ok: false; error: string; code?: 'unverified' }
export type AuthResult = AuthSuccess | AuthFailure

function appUser(user: User) {
  useAppState.getState().setCurrentRole(user.role)
  useAppState.getState().setCurrentUser(user)
}

export async function signUpAccount(input: {
  email: string
  password: string
  name?: string
  contact?: string
}) {
  // No session yet: the account is activated by the link sent to the email address.
  return signUpCustomer(input)
}

export { resendVerification }

export async function signInAccount(input: {
  role?: UserRole
  email: string
  password: string
}): Promise<AuthResult> {
  const credentials = { email: input.email, password: input.password }
  const result =
    input.role === 'owner'
      ? await signInOwner(credentials)
      : input.role === 'customer'
        ? await signInCustomer(credentials)
        : await signInAny(credentials)

  if (result.ok) appUser(result.user)
  return result
}

export async function signOutAccount() {
  await signOutSession()
  useAppState.getState().setCurrentUser(null)
  useAppState.getState().setCurrentRole('customer')
  useAppState.getState().clearCustomerSession()
}

export async function restoreSession() {
  const user = await getAuthSession()
  if (!user) {
    useAppState.getState().setCurrentUser(null)
    return
  }
  appUser(user)
}