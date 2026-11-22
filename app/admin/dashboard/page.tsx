'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { AdminShell } from '@/app/admin/admin-shell'
import { getSystemHealth, type SystemHealth } from '@/app/actions/admin-actions'

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)

  useEffect(() => {
    getSystemHealth().then(setHealth).catch(() => setHealth({ database: 'disconnected' }))
  }, [])

  return <AdminShell>
    <header className="mb-8"><p className="text-sm font-medium text-primary">System control</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">Dashboard</h2><p className="mt-2 text-muted-foreground">Monitor database status and system activity without exposing business data.</p></header>
    <section aria-label="System health" className="grid gap-4 md:grid-cols-2">
      <Card className="p-5"><p className="text-sm text-muted-foreground">Database</p><p className="mt-2 text-2xl font-semibold capitalize">{health?.database ?? 'Checking…'}</p></Card>
    </section>
    <div className="mt-8 grid gap-4 md:grid-cols-1">
      {[['/admin/logs', 'Logs', 'Review system activity newest first.']].map(([href, title, description]) => <Link key={href} href={href}><Card className="h-full p-5 transition-colors hover:border-primary"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-muted-foreground">{description}</p></Card></Link>)}
    </div>
  </AdminShell>
}
