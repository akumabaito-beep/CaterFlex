import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { MenuGrid } from '@/components/landing/MenuGrid'
import { getPublicMenu } from '@/lib/public-menu'

export const metadata: Metadata = {
  title: 'Menu | CaterFlex',
  description: 'Browse the dishes available for events and weekly meal-prep.',
}

// Always read the latest menu; the owner can change availability at any time.
export const dynamic = 'force-dynamic'

export default async function MenuPage() {
  const { items, failed } = await getPublicMenu()

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <LandingHeader current="/menu" />

      <section className="bg-[#8E1F2C] px-6 py-16 text-white lg:py-20">
        <div className="mx-auto max-w-7xl lg:px-10">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-white">Our menu</p>
          <h1 className="mt-4 max-w-2xl font-heading text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">Browse what&apos;s cooking.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/85">Every dish currently available for events and weekly meal-prep. Log in to book or order.</p>
        </div>
      </section>

      <section className="px-6 py-12 lg:py-16">
        <div className="mx-auto max-w-7xl lg:px-10">
          {failed ? (
            <div role="alert" className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">We couldn&apos;t load the menu right now. Please try again in a moment.</div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">The menu is being updated. Please check back soon.</div>
          ) : (
            <MenuGrid items={items} />
          )}
        </div>
      </section>

      <section className="bg-primary-soft px-6 py-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <h2 className="font-heading text-3xl font-bold text-[#8E1F2C] sm:text-4xl">Found something you like?</h2>
          <Link href="/login" className="inline-flex h-12 w-fit items-center justify-center rounded-lg bg-[#9B1C2C] px-7 text-sm font-medium text-white hover:bg-[#7F1623] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] focus-visible:ring-offset-2">Log in to order</Link>
        </div>
      </section>

      <LandingFooter />
    </main>
  )
}