'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminShell, formatWhen, LogType } from '@/app/admin/admin-shell'
import { getSystemHealth, getSystemLogs, type SystemHealth, type SystemLog } from '@/app/actions/admin-actions'

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [recent, setRecent] = useState<SystemLog[]>([])
  const [lastCheck, setLastCheck] = useState<SystemLog | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      getSystemHealth().catch(() => ({ database: 'disconnected' }) as SystemHealth),
      getSystemLogs({ page: 1 }).catch(() => ({ logs: [] as SystemLog[] })),
      getSystemLogs({ type: 'check' }).catch(() => ({ logs: [] as SystemLog[] })),
    ]).then(([healthResult, all, checks]) => {
      setHealth(healthResult)
      setRecent(all.logs.slice(0, 8))
      setLastCheck(checks.logs[0] ?? null)
      setLoaded(true)
    })
  }, [])

  const connected = health?.database === 'connected'

  return (
    <AdminShell>
      <section aria-live="polite" className="border-b border-border pb-10">
        <div className="flex items-center gap-4">
          <span className="relative flex size-4 shrink-0" aria-hidden>
            {loaded && connected && <span className="absolute inline-flex size-full rounded-full bg-[var(--success)] opacity-60 motion-safe:animate-ping" />}
            <span className={`relative inline-flex size-4 rounded-full ${!loaded ? 'bg-muted-foreground/40' : connected ? 'bg-[var(--success)]' : 'bg-destructive'}`} />
          </span>
          <h1 className="font-heading text-3xl leading-tight md:text-4xl">
            {!loaded ? 'Checking the database…' : connected ? 'Database connected' : 'Database unreachable'}
          </h1>
        </div>
        <p className="mt-4 max-w-prose text-muted-foreground">
          {loaded && !connected
            ? 'The system log could not be read. Check the Supabase project status, then reload this page.'
            : 'This area shows system health and logs only. Customer, booking, menu, inventory and financial data are not visible to administrators.'}
        </p>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <section aria-labelledby="check-heading">
          <h2 id="check-heading" className="text-lg font-semibold">Daily preparation check</h2>
          {lastCheck ? (
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Last run</dt>
                <dd className="mt-0.5 font-medium">{formatWhen(lastCheck.Timestamp)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Result</dt>
                <dd className="mt-0.5 max-w-prose">{lastCheck.Message}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-4 max-w-prose text-sm text-muted-foreground">
              The check has not run yet. It runs once a day at 2:00 PM Philippine time and notifies the owner about preparation start dates and ingredient shortages.
            </p>
          )}
        </section>

        <section aria-labelledby="recent-heading">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="text-lg font-semibold">Recent activity</h2>
            <Link href="/admin/logs" className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">View all logs</Link>
          </div>
          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{loaded ? 'No activity has been logged yet. Sign-ins and daily check results appear here.' : 'Loading…'}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {recent.map((log) => (
                <li key={log.LogID} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[9rem_8rem_minmax(0,1fr)]">
                  <span className="text-sm text-muted-foreground">{formatWhen(log.Timestamp)}</span>
                  <LogType type={log.LogType} />
                  <span className="min-w-0 break-words text-sm">{log.Message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  )
}
