'use client'

import { FormEvent, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { AdminShell, formatDate, LogType } from '@/app/admin/admin-shell'
import { getSystemLogs, type SystemLog } from '@/app/actions/admin-actions'

const PAGE_SIZE = 25
const field = 'h-10 rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20'

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loaded, setLoaded] = useState(false)

  async function load() {
    const result = await getSystemLogs({ search, type, page })
    setLogs(result.logs)
    setTotal(result.total)
    setLoaded(true)
  }
  useEffect(() => {
    load().catch(() => { setLogs([]); setTotal(0); setLoaded(true) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, type])
  function submit(event: FormEvent) {
    event.preventDefault()
    setPage(1)
    load().catch(() => undefined)
  }

  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)
  const showAdmin = logs.some((log) => log.admin)

  return (
    <AdminShell>
      <header className="border-b border-border pb-8">
        <h1 className="font-heading text-3xl leading-tight md:text-4xl">System logs</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">Sign-ins, daily check results and errors, newest first. Times are in Philippine time.</p>
      </header>

      <form onSubmit={submit} role="search" className="mt-8 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search messages</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages" className={`${field} w-full pl-9`} />
        </label>
        <label>
          <span className="sr-only">Filter by type</span>
          <select value={type} onChange={(event) => { setType(event.target.value); setPage(1) }} className={`${field} w-full sm:w-44`}>
            <option value="">All types</option>
            <option value="login">Sign-in</option>
            <option value="check">Daily check</option>
            <option value="error">Error</option>
          </select>
        </label>
        <button type="submit" className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-[var(--primary-hover)] focus-visible:ring-2 focus-visible:ring-primary/40">Search</button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">System log entries</caption>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="w-44 py-3 pr-4 font-medium">Time</th>
              <th scope="col" className="w-36 py-3 pr-4 font-medium">Type</th>
              <th scope="col" className="py-3 pr-4 font-medium">Message</th>
              {showAdmin && <th scope="col" className="w-32 py-3 font-medium">Administrator</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.map((log) => (
              <tr key={log.LogID} className="align-top">
                <td className="whitespace-nowrap py-3 pr-4 text-muted-foreground">{formatDate(log.Timestamp)}</td>
                <td className="py-3 pr-4"><LogType type={log.LogType} /></td>
                <td className="min-w-64 break-words py-3 pr-4">{log.Message}</td>
                {showAdmin && <td className="py-3 text-muted-foreground">{log.admin?.Username ?? log.admin?.Email ?? ''}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && logs.length === 0 && (
          <p className="border-t border-border py-10 text-center text-sm text-muted-foreground">
            {search || type ? 'No entries match this search. Clear the search or choose All types.' : 'No entries yet. Sign-ins and daily check results appear here.'}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>{total === 0 ? '0 entries' : `Showing ${first}–${last} of ${total}`}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page * PAGE_SIZE >= total} onClick={() => setPage((value) => value + 1)} className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-40">Next</button>
        </div>
      </div>
    </AdminShell>
  )
}
