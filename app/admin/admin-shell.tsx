'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode } from 'react'
import { Activity, LogOut, ScrollText } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const links = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/admin/logs', label: 'System logs', icon: ScrollText },
]

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="min-h-screen bg-surface text-surface-foreground md:flex">
      <aside className="bg-sidebar text-sidebar-foreground md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:h-full md:flex-col md:items-stretch md:justify-start md:gap-10 md:px-6 md:py-8">
          <div>
            <p className="font-heading text-lg leading-none tracking-wide">CaterFlex</p>
            <p className="mt-1.5 text-sm text-sidebar-foreground/60">Administrator</p>
          </div>

          <nav aria-label="Administrator navigation" className="hidden md:flex md:flex-col md:gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-md border-l-2 px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-foreground/60 ${
                    active
                      ? 'border-primary bg-white/10 text-sidebar-foreground'
                      : 'border-transparent text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground'
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 outline-none transition-colors hover:bg-white/5 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-foreground/60 md:mt-auto"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>

        <nav aria-label="Administrator navigation" className="flex gap-1 border-t border-white/10 px-3 py-2 md:hidden">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${pathname === href ? 'bg-white/10 text-sidebar-foreground' : 'text-sidebar-foreground/70'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 px-5 py-8 md:px-12 md:py-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}

const TIME_ZONE = 'Asia/Manila'

export function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-PH', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatWhen(value: string | null) {
  if (!value) return 'Never'
  const date = new Date(value)
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TIME_ZONE })
  const time = date.toLocaleTimeString('en-PH', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' })
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86400000)
  if (day(date) === day(today)) return `Today, ${time}`
  if (day(date) === day(yesterday)) return `Yesterday, ${time}`
  return formatDate(value)
}

const LOG_TYPES: Record<string, { label: string; dot: string }> = {
  error: { label: 'Error', dot: 'bg-destructive' },
  check: { label: 'Daily check', dot: 'bg-[var(--success)]' },
  login: { label: 'Sign-in', dot: 'bg-chart-2' },
  deployment: { label: 'Deployment', dot: 'bg-muted-foreground' },
  backup: { label: 'Backup', dot: 'bg-muted-foreground' },
  restore: { label: 'Restore', dot: 'bg-muted-foreground' },
}

export function LogType({ type }: { type: string }) {
  const entry = LOG_TYPES[type] ?? { label: type, dot: 'bg-muted-foreground' }
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
      <span className={`size-2 rounded-full ${entry.dot}`} aria-hidden />
      {entry.label}
    </span>
  )
}
