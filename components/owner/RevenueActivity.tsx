'use client'

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

type RevenuePoint = { date: string; revenue: number }
type Activity = { id: string; customerName: string; status: string; createdAt: string }

type RevenueActivityProps = {
  rangeLabel?: string
  bucket?: 'day' | 'week' | 'month'
  revenueData: RevenuePoint[]
  recentActivity: Activity[]
}

const chartConfig = { revenue: { label: 'Revenue', color: '#C8431B' } } satisfies ChartConfig

const peso = (value: number) =>
  `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function relativeTime(iso: string) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

function activityText(status: string) {
  switch (status) {
    case 'confirmed': return 'confirmed event'
    case 'completed': return 'completed event'
    case 'rejected': return 'had a booking declined'
    case 'cancelled': return 'cancelled booking'
    default: return 'requested a new booking'
  }
}

export function RevenueActivity({ rangeLabel = 'the past 30 days', bucket = 'day', revenueData, recentActivity }: RevenueActivityProps) {
  const total = revenueData.reduce((sum, point) => sum + Number(point.revenue || 0), 0)
  const hasRevenue = revenueData.length > 0 && total > 0

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="rounded-2xl border border-border bg-white p-6 lg:col-span-2" aria-label="Revenue">
        <p className="text-sm text-muted-foreground">Paid revenue, {rangeLabel.toLowerCase()}</p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-[#2B1D16]">{peso(total)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {bucket === 'week' ? 'Weekly totals' : bucket === 'month' ? 'Monthly totals' : 'Daily totals'}, counted by payment date.
        </p>

        {!hasRevenue ? (
          <div className="mt-6 flex h-[240px] items-center justify-center rounded-xl border border-dashed border-[#E8D8C4] text-sm text-muted-foreground">
            No payments received in this range.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="mt-6 h-[240px] w-full">
            <AreaChart data={revenueData} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                minTickGap={24}
                tickFormatter={(value) => {
                  const date = new Date(`${value}T00:00:00Z`)
                  if (Number.isNaN(date.getTime())) return value
                  return date.toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'short', ...(bucket === 'month' ? { year: '2-digit' } : { day: 'numeric' }) })
                }}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={55} tickFormatter={(value) => `₱${(Number(value) / 1000).toFixed(1)}k`} />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      const date = new Date(`${String(value)}T00:00:00Z`)
                      if (Number.isNaN(date.getTime())) return String(value)
                      return date.toLocaleDateString('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'long', ...(bucket === 'month' ? {} : { day: 'numeric' }) }) + (bucket === 'week' ? ' (week of)' : '')
                    }}
                    formatter={(value, name) => (
                      <span className="flex w-full justify-between gap-4">
                        <span className="capitalize text-muted-foreground">{name}</span>
                        <span className="font-mono font-medium">{peso(Number(value))}</span>
                      </span>
                    )}
                  />
                }
              />
              <Area dataKey="revenue" type="monotone" stroke="var(--color-revenue)" fill="url(#fillRevenue)" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-white p-6" aria-label="Recent activity">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold text-card-foreground">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">Latest booking updates.</p>
          </div>
          <Link href="/owner/bookings" className="inline-flex shrink-0 items-center gap-1 rounded-full text-sm font-semibold text-[#C8431B] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]">
            View all <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {recentActivity.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {recentActivity.map((activity) => (
              <li key={activity.id} className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F6E3D3] text-xs font-semibold text-[#C8431B]" aria-hidden="true">
                  {initials(activity.customerName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-snug text-card-foreground">
                    <span className="font-semibold">{activity.customerName}</span> {activityText(activity.status)}{' '}
                    <span className="font-semibold">#{activity.id}</span>.
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{relativeTime(activity.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
