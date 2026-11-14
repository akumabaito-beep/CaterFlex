'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { customerNeedsContact } from '@/app/actions/profile-actions'

/**
 * Customers without a contact number (for example after Google sign-in) are sent to the
 * sign-up page, where they add it before using the customer pages. Renders nothing.
 */
export function ContactPrompt() {
  const router = useRouter()
  useEffect(() => {
    customerNeedsContact()
      .then((needed) => {
        if (needed) router.replace('/signup?step=contact')
      })
      .catch(() => {})
  }, [router])
  return null
}
