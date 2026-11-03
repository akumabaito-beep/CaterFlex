'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarCheck } from 'lucide-react'
import { AvailabilityCalendar } from '@/components/booking/AvailabilityCalendar'
import type { Booking, OperatorSettings } from '@/lib/types'

/** Read-only look at which event dates are open, shown on the customer home page. */
export function AvailabilityPanel({ settings, bookings }: { settings: OperatorSettings; bookings: Booking[] }) {
  const [date, setDate] = useState('')

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto] lg:gap-14">
      <div className="max-w-md">
        <p className="flex items-center gap-2 text-xs font-semibold text-[#9B1C2C]"><CalendarCheck className="size-4" aria-hidden="true" /> Plan ahead</p>
        <h2 id="availability-heading" className="mt-2 font-heading text-3xl font-bold uppercase tracking-tight text-[#2A1B1F]">Check available dates</h2>
        <p className="mt-3 text-base leading-7 text-muted-foreground">See which days we can cater your event before you book. Green dates are open, amber dates have one slot left, and grey dates are closed or fully booked.</p>
        <Link href="/customer/inquiry" className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#9B1C2C] px-6 text-sm font-semibold leading-none text-white hover:bg-[#7F1623] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] focus-visible:ring-offset-2">
          Book an event <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <AvailabilityCalendar
        value={date}
        onChange={setDate}
        orderType="catering"
        settings={settings}
        bookings={bookings}
        hint="Tap a date to see how many slots are left."
      />
    </div>
  )
}
