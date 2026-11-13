'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Bell,
  BellOff,
  CalendarPlus,
  CalendarX,
  CheckCheck,
  ChefHat,
  PackageX,
  Repeat,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import {
  getOwnerNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/app/actions/notification-actions'
import { notifyNotificationsUpdated } from '@/lib/notification-client'
import { DashboardLayout } from '@/app/dashboard-layout'
import { Paged } from '@/components/owner/Pagination'

type Notification = {
  NotificationID: number
  NotificationType: string | null
  Message: string | null
  RelatedBookingID: number | null
  RelatedMealPrepOrderID: number | null
  IsRead: boolean | null
  CreatedAt: string
}

type Group = 'bookings' | 'stock' | 'warnings'

/** One entry per notification type: how it looks, what to call it and where "View" goes. */
const TYPES: Record<string, { label: string; icon: LucideIcon; tile: string; group: Group; href: string; cta: string }> = {
  new_booking: { label: 'New booking', icon: CalendarPlus, tile: 'bg-[#F6E3D3] text-[#C8431B]', group: 'bookings', href: '/owner/bookings', cta: 'Review booking' },
  new_meal_prep_order: { label: 'New meal plan', icon: Repeat, tile: 'bg-[#F6E3D3] text-[#C8431B]', group: 'bookings', href: '/owner/bookings', cta: 'Review plan' },
  allergen_conflict: { label: 'Allergen warning', icon: ShieldAlert, tile: 'bg-[#F8DDD9] text-[#B3261E]', group: 'warnings', href: '/owner/bookings', cta: 'Check order' },
  capacity_conflict: { label: 'Booking blocked', icon: CalendarX, tile: 'bg-[#FBEBCB] text-[#8A5A00]', group: 'warnings', href: '/owner/calendar', cta: 'Open calendar' },
  insufficient_ingredients: { label: 'Low ingredients', icon: PackageX, tile: 'bg-[#F8DDD9] text-[#B3261E]', group: 'stock', href: '/owner/inventory', cta: 'Open inventory' },
  prep_start_confirmed: { label: 'Ready to prepare', icon: ChefHat, tile: 'bg-[#F3E7D6] text-[#2B1D16]', group: 'stock', href: '/owner/prep-schedule', cta: 'Open prep schedule' },
}
const FALLBACK = { label: 'Update', icon: Bell, tile: 'bg-[#F3E7D6] text-[#2B1D16]', group: 'bookings' as Group, href: '/owner/bookings', cta: 'Open' }
const typeInfo = (t: string | null) => TYPES[t ?? ''] ?? FALLBACK

const GROUPS: { key: 'all' | Group; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'stock', label: 'Stock & prep' },
  { key: 'warnings', label: 'Warnings' },
]

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

function readStored(key: string): number[] {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as number[]) : []
  } catch {
    return []
  }
}

export default function OwnerNotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'all' | 'favorite' | 'archive'>('all')
  const [group, setGroup] = useState<'all' | Group>('all')
  const [favorites, setFavorites] = useState<number[]>([])
  const [archived, setArchived] = useState<number[]>([])
  const [prefsLoaded, setPrefsLoaded] = useState(false)

  useEffect(() => {
    getOwnerNotifications().then((result) => {
      if (result.ok) setItems(result.notifications as Notification[])
      setLoading(false)
    })
    setFavorites(readStored('owner-notification-favorites'))
    setArchived(readStored('owner-notification-archived'))
    setPrefsLoaded(true)
  }, [])

  useEffect(() => {
    if (!prefsLoaded) return
    try {
      localStorage.setItem('owner-notification-favorites', JSON.stringify(favorites))
      localStorage.setItem('owner-notification-archived', JSON.stringify(archived))
    } catch {}
  }, [favorites, archived, prefsLoaded])

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  async function read(id: number) {
    const result = await markNotificationRead(id)
    if (result.ok) {
      setItems((cur) => cur.map((n) => (Number(n.NotificationID) === id ? { ...n, IsRead: true } : n)))
      notifyNotificationsUpdated()
    }
  }

  async function readAll() {
    const result = await markAllNotificationsRead()
    if (result.ok) {
      setItems((cur) => cur.map((n) => ({ ...n, IsRead: true })))
      notifyNotificationsUpdated()
    }
  }

  function remove(id: number) {
    setItems((cur) => cur.filter((n) => Number(n.NotificationID) !== id))
    setFavorites((cur) => cur.filter((x) => x !== id))
    setArchived((cur) => cur.filter((x) => x !== id))
  }

  async function open(n: Notification) {
    if (!n.IsRead) await read(Number(n.NotificationID))
    router.push(typeInfo(n.NotificationType).href)
  }

  const unread = items.filter((n) => !n.IsRead && !archived.includes(Number(n.NotificationID)))
  const archiveCount = items.filter((n) => n.IsRead || archived.includes(Number(n.NotificationID))).length
  const favoriteCount = items.filter((n) => favorites.includes(Number(n.NotificationID))).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((n) => {
      const id = Number(n.NotificationID)
      const done = Boolean(n.IsRead) || archived.includes(id)
      if (tab === 'archive' && !done) return false
      if (tab === 'favorite' && !favorites.includes(id)) return false
      if (group !== 'all' && typeInfo(n.NotificationType).group !== group) return false
      if (!q) return true
      return String(n.Message ?? '').toLowerCase().includes(q) || typeInfo(n.NotificationType).label.toLowerCase().includes(q)
    })
  }, [items, search, tab, group, archived, favorites])

  const tabs = [
    { key: 'all' as const, label: 'All', count: unread.length, hot: true },
    { key: 'favorite' as const, label: 'Favorites', count: favoriteCount, hot: false },
    { key: 'archive' as const, label: 'Archive', count: archiveCount, hot: false },
  ]

  const empty = {
    all: { icon: BellOff, title: "You're all caught up", body: 'New bookings and kitchen alerts will show up here.' },
    favorite: { icon: Star, title: 'No favorites yet', body: 'Tap the star on a notification to keep it here.' },
    archive: { icon: Archive, title: 'Nothing archived', body: 'Read and archived notifications are kept here.' },
  }[tab]
  const EmptyIcon = empty.icon

  return (
    <DashboardLayout>
      <section className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-heading text-4xl font-bold uppercase text-[#2B1D16]">Notifications</h1>
            <p className="mt-1 text-sm text-surface-muted-foreground">Booking and kitchen updates for your operation.</p>
          </div>
          <button
            type="button"
            onClick={readAll}
            disabled={unread.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#E8D8C4] bg-white px-4 text-sm font-semibold text-[#2B1D16] transition hover:bg-[#f1f1f2] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck className="size-4" aria-hidden="true" /> Mark all as read
          </button>
        </div>

        {!loading && unread.length > 0 && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#C8431B]/30 bg-[#F6E3D3] px-5 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#C8431B] text-white">
              <Bell className="size-5" aria-hidden="true" />
            </span>
            <div>
              <p className="font-semibold text-[#2B1D16]">
                {unread.length} unread {unread.length === 1 ? 'notification' : 'notifications'}
              </p>
              <p className="text-sm text-[#2B1D16]/70">Open one to jump straight to the booking, calendar or inventory.</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 border-b border-[#E8D8C4]" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
                  tab === t.key ? 'border-[#C8431B] text-[#2B1D16]' : 'border-transparent text-muted-foreground hover:text-[#2B1D16]'
                }`}
              >
                {t.label}
                <span className={`rounded-full px-2 py-0.5 text-xs ${t.hot && t.count > 0 ? 'bg-[#C8431B] text-white' : 'bg-[#F3E7D6] text-[#2B1D16]/70'}`}>{t.count}</span>
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications"
              className="h-10 w-full rounded-full border border-[#E8D8C4] bg-white pl-10 pr-4 text-sm outline-none transition focus:border-[#C8431B]"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              aria-pressed={group === g.key}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                group === g.key ? 'border-[#C8431B] bg-[#C8431B] text-white' : 'border-[#E8D8C4] bg-white text-[#2B1D16] hover:bg-[#f1f1f2]'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-[#E8D8C4] bg-white" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#DCC7A8] bg-white p-12 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-[#F3E7D6] text-[#C8431B]">
              <EmptyIcon className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-4 font-semibold text-[#2B1D16]">{search ? 'No matches' : empty.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{search ? 'Try a different search or filter.' : empty.body}</p>
          </div>
        ) : (
          <Paged items={visible} pageSize={8} label="notifications" className="space-y-3">
            {(n) => {
              const id = Number(n.NotificationID)
              const info = typeInfo(n.NotificationType)
              const Icon = info.icon
              const isFav = favorites.includes(id)
              const isArchived = archived.includes(id)
              const done = Boolean(n.IsRead) || isArchived
              return (
                <article
                  key={id}
                  className={`group relative flex gap-4 rounded-2xl border p-4 transition hover:shadow-sm ${
                    done ? 'border-[#E8D8C4] bg-[#FBF6EE]' : 'border-[#DCC7A8] bg-white'
                  }`}
                >
                  {!done && <span className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-[#C8431B]" aria-hidden="true" />}
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${info.tile} ${done ? 'opacity-70' : ''}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <p className={`text-sm ${done ? 'font-medium text-[#2B1D16]/70' : 'font-bold text-[#2B1D16]'}`}>{info.label}</p>
                      <span className="text-xs text-muted-foreground" title={new Date(n.CreatedAt).toLocaleString()}>
                        {timeAgo(n.CreatedAt)}
                      </span>
                    </div>
                    <p className={`mt-1 line-clamp-3 text-sm leading-6 ${done ? 'text-muted-foreground' : 'text-[#2B1D16]/80'}`}>{n.Message}</p>
                    <button
                      type="button"
                      onClick={() => open(n)}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-[#C8431B] hover:underline"
                    >
                      {info.cta} <ArrowRight className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                    {!n.IsRead && (
                      <button type="button" onClick={() => read(id)} aria-label="Mark as read" title="Mark as read" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#f1f1f2] hover:text-[#2B1D16]">
                        <CheckCheck className="size-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => setFavorites((c) => toggle(c, id))} aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'} title="Favorite" className={`flex size-8 items-center justify-center rounded-lg transition hover:bg-[#f1f1f2] ${isFav ? 'text-[#C8431B]' : 'text-muted-foreground hover:text-[#2B1D16]'}`}>
                      <Star className="size-4" fill={isFav ? 'currentColor' : 'none'} />
                    </button>
                    <button type="button" onClick={() => setArchived((c) => toggle(c, id))} aria-label={isArchived ? 'Restore' : 'Archive'} title={isArchived ? 'Restore' : 'Archive'} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#f1f1f2] hover:text-[#2B1D16]">
                      {isArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                    </button>
                    <button type="button" onClick={() => remove(id)} aria-label="Delete" title="Delete" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-[#F8DDD9] hover:text-[#B3261E]">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </article>
              )
            }}
          </Paged>
        )}
      </section>
    </DashboardLayout>
  )
}
