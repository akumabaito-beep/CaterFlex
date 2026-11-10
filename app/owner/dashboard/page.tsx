'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/app/dashboard-layout'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { RevenueActivity } from '@/components/owner/RevenueActivity'
import { DateRangePicker } from '@/components/owner/DateRangePicker'
import type { RangeInput, ResolvedRange } from '@/lib/date-range'
import { getOwnerDashboardData } from '@/app/actions/dashboard-actions'
import { ArrowRight, CalendarClock, HandCoins, PackageMinus, RefreshCw } from 'lucide-react'

type DashboardData = {
  pendingBookings: number
  confirmedBookings: number
  lowStockItems: number
  outstandingBalance: number
  totalBookings: number
  completionRate: number
  totalRevenue: number
  recentActivity: {
    id: string
    customerName: string
    status: string
    createdAt: string
  }[]
  alerts: {
    id: string
    message: string
    severity: 'error' | 'warning' | 'info'
    timestamp: string
  }[]
  revenueData: {
    date: string
    revenue: number
  }[]
  range: ResolvedRange
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(value)
}

export default function OwnerDashboard() {
  const [dashboard, setDashboard] =
    useState<DashboardData | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [rangeError, setRangeError] = useState('')
  const [range, setRange] = useState<RangeInput>({ preset: '30d' })

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setRefreshing(true)
      setRangeError('')

      const result = await getOwnerDashboardData(range)
      if (cancelled) return

      if (!result.ok) {
        // First load failure blocks the page; a bad range keeps the old data.
        if (dashboard) setRangeError(result.error)
        else setErrorMessage(result.error)
      } else {
        setErrorMessage('')
        setDashboard(result.data)
      }

      setLoading(false)
      setRefreshing(false)
    }

    void loadDashboard()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const manilaDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
          <div className="h-12 w-64 animate-pulse rounded-xl bg-[#EFE1D0]/60" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />)}
          </div>
          <div className="h-80 animate-pulse rounded-2xl bg-[#EFE1D0]/60" />
        </div>
      </DashboardLayout>
    )
  }

  if (errorMessage || !dashboard) {
    return (
      <DashboardLayout>
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E8D8C4] bg-[#F6E3D3] p-5 text-sm text-[#C8431B]">
          <span>Could not load the dashboard. {errorMessage || 'No dashboard data available.'}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setRange({ ...range })}>Try again</Button>
        </div>
      </DashboardLayout>
    )
  }

  const attention = [
    { key: 'pending', label: 'Bookings to review', value: dashboard.pendingBookings, display: String(dashboard.pendingBookings), href: '/owner/bookings', cta: 'Review', icon: CalendarClock },
    { key: 'stock', label: 'Ingredients running low', value: dashboard.lowStockItems, display: String(dashboard.lowStockItems), href: '/owner/inventory', cta: 'Restock', icon: PackageMinus },
    { key: 'owed', label: 'Still to collect', value: dashboard.outstandingBalance, display: formatPrice(dashboard.outstandingBalance), href: '/owner/payments', cta: 'Collect', icon: HandCoins },
  ]

  const stats = [
    { label: 'Confirmed events', value: String(dashboard.confirmedBookings) },
    { label: 'Total bookings', value: String(dashboard.totalBookings) },
    { label: 'Completion rate', value: `${dashboard.completionRate}%` },
    { label: 'Revenue, all time', value: formatPrice(dashboard.totalRevenue) },
  ]

  return (
    <DashboardLayout>
      <div className={`flex flex-col gap-6 transition-opacity ${refreshing ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Welcome back. Here is what needs you today.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setRange({ ...range })} disabled={refreshing}>
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} data-icon="inline-start" aria-hidden="true" />
            Refresh
          </Button>
        </div>

        <section aria-label="Needs attention" className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {attention.map((item) => {
            const hot = item.value > 0
            return (
              <Link key={item.key} href={item.href} className={`group relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl border p-5 transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] ${hot ? 'border-[#E8D8C4] bg-[#FBF6EE]' : 'border-border bg-white'}`}>
                {hot && <span className="absolute inset-y-0 left-0 w-1 bg-[#C8431B]" aria-hidden="true" />}
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                  <p className={`mt-1 text-3xl font-bold tabular-nums ${hot ? 'text-[#C8431B]' : 'text-[#2B1D16]'}`}>{item.display}</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#C8431B]">
                    {hot ? item.cta : 'All clear'}
                    {hot && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
                  </p>
                </div>
                <item.icon className={`size-8 shrink-0 ${hot ? 'text-[#C8431B]' : 'text-[#E8D8C4]'}`} aria-hidden="true" />
              </Link>
            )
          })}
        </section>

        <div className="space-y-2">
          <DateRangePicker value={range} onChange={setRange} disabled={refreshing} />
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-[#2B1D16]">{dashboard.range.label}</span>
            {refreshing && ', updating…'}. Bookings are counted by event date and revenue by payment date. The cards above always show current figures.
          </p>
          {rangeError && <p role="alert" className="text-sm font-medium text-[#C8431B]">{rangeError}</p>}
        </div>

        <RevenueActivity
          revenueData={dashboard.revenueData}
          rangeLabel={dashboard.range.label}
          bucket={dashboard.range.bucket}
          recentActivity={dashboard.recentActivity}
        />

        <section aria-label="Totals" className="grid grid-cols-2 divide-x divide-y divide-[#E8D8C4] overflow-hidden rounded-2xl border border-[#E8D8C4] bg-white lg:grid-cols-4 lg:divide-y-0">
          {stats.map((stat) => (
            <div key={stat.label} className="p-5">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#2B1D16]">{stat.value}</p>
            </div>
          ))}
        </section>

        {dashboard.alerts.length > 0 && (
          <section aria-label="Recent alerts" className="rounded-2xl border border-border bg-white p-6">
            <h2 className="font-heading text-lg font-bold text-card-foreground">Recent alerts</h2>
            <ul className="mt-4 divide-y divide-[#EFE3D3]">
              {dashboard.alerts.slice(0, 5).map((alert) => (
                <li key={alert.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${alert.severity === 'error' ? 'bg-[#C8431B]' : alert.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2B1D16]">{alert.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{manilaDate(alert.timestamp)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardLayout>
  )
}
