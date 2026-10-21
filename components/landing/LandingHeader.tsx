'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

// On the home page these scroll to a section. On other pages they go home and then scroll.
const links = [
  { label: 'Services', href: '/#services', id: 'services' },
  { label: 'Events', href: '/#events', id: 'events' },
  { label: 'How it works', href: '/#how-it-works', id: 'how-it-works' },
  { label: 'Menu', href: '/menu', id: null },
] as const

const ghost = 'inline-flex h-9 items-center px-3 text-sm font-medium text-[#2A1B1F] hover:text-[#8E1F2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C]'
const solid = 'inline-flex h-9 items-center justify-center rounded-lg bg-[#9B1C2C] px-4 text-sm font-medium text-white hover:bg-[#7F1623] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] focus-visible:ring-offset-2'

// `current` is kept only so older pages that pass it still compile; the active link is detected automatically.
export function LandingHeader(_props: { current?: string }) {
  const pathname = usePathname()
  const onHome = pathname === '/'
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('home')

  // Highlight the link of the section currently on screen.
  useEffect(() => {
    if (!onHome) return
    const els = ['home', 'services', 'events', 'how-it-works'].map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el)
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id) }), { rootMargin: '-40% 0px -55% 0px' })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [onHome])

  const goTo = (e: React.MouseEvent, id: string | null) => {
    setOpen(false)
    if (!onHome || !id) return // other pages: let the link navigate normally
    e.preventDefault()
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
    if (id === 'home') window.scrollTo({ top: 0, behavior })
    else document.getElementById(id)?.scrollIntoView({ behavior, block: 'start' })
    history.replaceState(null, '', id === 'home' ? '/' : `/#${id}`)
    setActive(id)
  }

  const isActive = (l: (typeof links)[number]) => (l.id === null ? pathname === '/menu' : onHome && active === l.id)

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
        <Link href="/#home" onClick={(e) => goTo(e, 'home')} aria-label="CaterFlex home"><img src="/logo.png" alt="CaterFlex" className="size-12 object-contain brightness-0" /></Link>
        <nav className="hidden items-center gap-8 md:flex" aria-label="Main navigation">
          {links.map((l) => (
            <Link key={l.label} href={l.href} onClick={(e) => goTo(e, l.id)} aria-current={isActive(l) ? (l.id === null ? 'page' : 'location') : undefined} className={`text-xs font-semibold uppercase tracking-[0.16em] transition-colors hover:text-[#8E1F2C] ${isActive(l) ? 'text-[#8E1F2C]' : 'text-muted-foreground'}`}>{l.label}</Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex"><Link href="/login" className={ghost}>Log in</Link><Link href="/signup" className={solid}>Sign up</Link></div>
        <button type="button" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex size-9 items-center justify-center rounded-md border border-border text-lg md:hidden">{open ? '×' : '☰'}</button>
      </div>
      {open && (
        <nav className="absolute inset-x-0 top-full border-b border-border bg-card px-6 py-4 shadow-lg md:hidden" aria-label="Mobile navigation">
          {links.map((l) => <Link key={l.label} href={l.href} onClick={(e) => goTo(e, l.id)} className={`block py-3 text-sm font-semibold uppercase tracking-wide ${isActive(l) ? 'text-[#8E1F2C]' : 'text-muted-foreground'}`}>{l.label}</Link>)}
          <div className="flex gap-3 border-t border-border pt-3"><Link href="/login" className={ghost}>Log in</Link><Link href="/signup" className={solid}>Sign up</Link></div>
        </nav>
      )}
    </header>
  )
}