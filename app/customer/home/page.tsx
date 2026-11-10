import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { getAuthSession } from '@/app/actions/auth'
import { CustomerShell } from '@/app/customer/customer-shell'
import { MenuGrid } from '@/components/landing/MenuGrid'
import { NewDishCarousel } from '@/components/customer/NewDishCarousel'
import { getPublicMenu } from '@/lib/public-menu'

// The menu changes whenever the owner edits it, so always read the latest.
export const dynamic = 'force-dynamic'

const NEW_COUNT = 8

export default async function CustomerHomePage() {
  const [session, { items, failed }] = await Promise.all([getAuthSession(), getPublicMenu()])
  const firstName = session?.name?.trim().split(/\s+/)[0] || 'there'

  // New dishes = the most recently added to the menu (highest id first).
  const newest = [...items].sort((a, b) => b.id - a.id).slice(0, NEW_COUNT)
  const bannerPhotos = items.filter((i) => i.photoUrl).slice(0, 3)

  return (
    <CustomerShell>
      <div className="mx-auto max-w-6xl space-y-14 px-5 py-8 lg:px-8 lg:py-10">
        {/* Welcome banner */}
        <section className="relative overflow-hidden rounded-2xl bg-[#2B1D16] px-6 py-10 text-white sm:px-10 lg:py-14" aria-labelledby="home-heading">
          <div className="relative z-10 max-w-md xl:max-w-lg">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/80">Welcome back</p>
            <h1 id="home-heading" className="mt-3 font-heading text-4xl font-bold uppercase leading-[1.05] tracking-tight sm:text-5xl">Hi {firstName}, what are we cooking?</h1>
            <p className="mt-4 text-base leading-7 text-white/85">Browse what&apos;s on the menu, then book an event or set up your weekly meals.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/customer/inquiry" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-sm font-semibold leading-none text-[#C8431B] hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#C8431B]">
                Start an order <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link href="/customer/status" className="inline-flex h-12 items-center justify-center rounded-lg border border-white/50 px-6 text-sm font-semibold leading-none text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                My requests
              </Link>
            </div>
          </div>
          {bannerPhotos.length > 0 && (
            <div className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 gap-4 xl:flex" aria-hidden="true">
              {bannerPhotos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={p.id} src={p.photoUrl!} alt="" className="size-36 rounded-full border-4 border-white/90 object-cover shadow-xl" style={{ marginTop: i % 2 ? '2.5rem' : '-0.5rem' }} />
              ))}
            </div>
          )}
        </section>

        {failed ? (
          <div role="alert" className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">We couldn&apos;t load the menu right now. Please refresh in a moment.</div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">The menu is being updated. Please check back soon.</div>
        ) : (
          <>
            {/* What's new */}
            <section aria-labelledby="new-heading">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-[#C8431B]"><Sparkles className="size-4" aria-hidden="true" /> Just added</p>
                  <h2 id="new-heading" className="mt-2 font-heading text-3xl font-bold uppercase tracking-tight text-[#2B1D16]">New on the menu</h2>
                </div>
              </div>
              <div className="mt-6 px-3 sm:px-5">
                <NewDishCarousel items={newest} />
              </div>
            </section>

            {/* Full menu */}
            <section aria-labelledby="menu-heading">
              <h2 id="menu-heading" className="font-heading text-3xl font-bold uppercase tracking-tight text-[#2B1D16]">Our menu</h2>
              <p className="mt-2 text-sm text-muted-foreground">Everything currently available for events and weekly meals.</p>
              <div className="mt-6"><MenuGrid items={items} /></div>
            </section>
          </>
        )}
      </div>
    </CustomerShell>
  )
}
