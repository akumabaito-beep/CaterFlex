'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, CalendarDays, Check, ChefHat, Repeat, Sparkles, X } from 'lucide-react'
import { Reveal } from '@/components/landing/Reveal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'


// Edit the wording here. Keep it true to what the system really does.
const services = [
  {
    title: 'Event catering',
    text: 'Book events with date, guest count and menu in one request.',
    tag: 'Bookings',
    icon: CalendarDays,
    detail: 'Plan a gathering from start to finish. Send one request with your date, time, venue and guest count, choose dishes from the menu, and follow the booking status as it is reviewed.',
    points: ['Choose your date, time and venue', 'Set your guest count within the operating limits', 'Pick dishes with dietary and allergen details', 'Follow your booking status after you submit'],
  },
  {
    title: 'Weekly meal-prep',
    text: 'Recurring orders with availability checked against stock.',
    tag: 'Recurring',
    icon: Repeat,
    detail: 'Set up recurring meal-prep orders for the week. Availability is checked against current stock, so you only order what can actually be prepared.',
    points: ['Choose how often you want meals prepared', 'Availability is checked against stock', 'Pause, resume or cancel an active order', 'See your upcoming fulfillment dates'],
  },
  {
    title: 'MacroFlex ingredient check',
    text: 'Dishes recommended based on the ingredients in stock.',
    tag: 'Inventory',
    icon: Activity,
    detail: 'MacroFlex compares your ingredient stock against what each dish needs per serving. It flags dishes that cannot be fully prepared, warns about over-purchased ingredients, and suggests dishes that can be made from leftover scraps.',
    points: ['Stock checked against per-serving ingredient needs', 'Shortages and over-purchased ingredients flagged', 'Scrap-based dish suggestions from leftovers'],
  },
]

const EASE_OUT = 'cubic-bezier(.2,.8,.2,1)'

export function ServicesShowcase({ onBrowse: onBrowseProp }: { onBrowse?: () => void }) {
  const router = useRouter()
  const onBrowse = onBrowseProp ?? (() => router.push('/menu'))
  const [open, setOpen] = useState<number | null>(null)
  const [shown, setShown] = useState(0)
  const [closing, setClosing] = useState(false)
  const cardRefs = useRef<(HTMLElement | null)[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)

  const visible = open !== null || closing
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const isMobile = () => window.innerWidth < 1024

  const openCard = (i: number) => { setClosing(false); setShown(i); setOpen(i) }

  const close = () => {
    const panel = panelRef.current
    const card = open === null ? null : cardRefs.current[open]
    if (!panel || !card || reduced()) { setOpen(null); return }
    const from = card.getBoundingClientRect()
    const to = panel.getBoundingClientRect()
    setClosing(true)
    bodyRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
    const keyframes = isMobile()
      ? [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px)' }]
      : [{ transform: 'none', opacity: 1 }, { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.7 }]
    const a = panel.animate(keyframes, { duration: 380, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' })
    anim.current = a
    a.onfinish = () => { setClosing(false); setOpen(null); cardRefs.current[shown]?.querySelector<HTMLElement>('[data-card-trigger]')?.focus({ preventScroll: true }) }
  }

  // Expand animation: the panel grows out of the clicked card's position and size.
  useLayoutEffect(() => {
    if (open === null) return
    const panel = panelRef.current
    const card = cardRefs.current[open]
    if (!panel || !card) return
    anim.current?.cancel()
    panel.focus({ preventScroll: true })
    if (reduced()) return
    if (isMobile()) {
      anim.current = panel.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: EASE_OUT })
      panel.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const from = card.getBoundingClientRect()
    const to = panel.getBoundingClientRect()
    panel.style.transformOrigin = 'top left'
    anim.current = panel.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, opacity: 0.9 },
      { transform: 'none', opacity: 1 },
    ], { duration: 480, easing: EASE_OUT })
    bodyRef.current?.getAnimations().forEach((x) => x.cancel())
    bodyRef.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.45 }, { opacity: 1 }], { duration: 480 })
  }, [open])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const s = services[shown]
  const Icon = s.icon

  return (
    <section id="services" className="flex min-h-[calc(100svh-4rem)] scroll-mt-16 items-center bg-background px-6 py-12 lg:py-8">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="grid">
          <Reveal className="col-start-1 row-start-1 self-center">
            <div inert={visible} aria-hidden={visible} className={cn('transition-opacity duration-300', visible && 'pointer-events-none opacity-0')}>
              <p className="flex items-center gap-2 text-xs font-semibold text-[#9B1C2C]"><ChefHat className="size-4" aria-hidden="true" /> What we do</p>
              <h2 className="mt-4 font-heading text-4xl font-bold leading-[1.08] tracking-tight text-[#2A1B1F] sm:text-5xl">Easy planning for every table.</h2>
              <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">Book events, order weekly meals and get ingredient-aware dish suggestions, all in one organized place.</p>
            </div>
          </Reveal>

          <div
            ref={panelRef}
            tabIndex={-1}
            role="region"
            aria-label={`${s.title} details`}
            aria-hidden={!visible}
            className={cn('col-start-1 row-start-1 self-center rounded-xl border border-border bg-card p-6 shadow-xl outline-none sm:p-8', !visible && 'hidden')}
          >
            <div ref={bodyRef}>
              <div className="flex items-start justify-between">
                <span className="flex size-14 items-center justify-center rounded-xl bg-primary-soft text-[#9B1C2C]"><Icon className="size-7" aria-hidden="true" /></span>
                <button type="button" onClick={close} aria-label="Close details" className="rounded-md p-2 text-muted-foreground hover:bg-primary-soft hover:text-[#9B1C2C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C]"><X className="size-5" aria-hidden="true" /></button>
              </div>
              <span className="mt-5 inline-block rounded bg-primary-soft px-2 py-1 text-[11px] font-semibold text-[#9B1C2C]">{s.tag}</span>
              <h3 className="mt-3 font-heading text-3xl font-bold leading-tight text-[#2A1B1F]">{s.title}</h3>
              <p className="mt-4 text-base leading-7 text-muted-foreground">{s.detail}</p>
              <ul className="mt-5 space-y-3">
                {s.points.map((p) => <li key={p} className="flex items-start gap-3 text-sm leading-6 text-[#2A1B1F]"><Check className="mt-0.5 size-4 shrink-0 text-[#9B1C2C]" aria-hidden="true" />{p}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="grid auto-rows-fr gap-5 sm:grid-cols-2">
          {services.map(({ title, text, tag, icon: CardIcon }, i) => {
            const isOpen = open === i
            return (
              <Reveal key={title} delay={i * 120} variant="scale" className="h-full">
                <article
                  ref={(el) => { cardRefs.current[i] = el }}
                  className={cn('relative flex h-full flex-col rounded-xl border p-5 transition-[background-color,box-shadow,transform] duration-300', isOpen ? 'border-dashed border-neutral-400 bg-neutral-200' : 'border-border bg-card shadow-sm hover:-translate-y-1 hover:shadow-lg')}
                >
                  <button
                    type="button"
                    data-card-trigger
                    aria-expanded={isOpen}
                    aria-label={isOpen ? `Bring back ${title}` : `Show details for ${title}`}
                    onClick={() => (isOpen ? close() : openCard(i))}
                    className="absolute inset-0 z-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C]"
                  />
                  <div className={cn('flex flex-1 flex-col', isOpen && 'invisible')}>
                    <div className="flex items-start justify-between">
                      <span className="flex size-11 items-center justify-center rounded-lg bg-primary-soft text-[#9B1C2C]"><CardIcon className="size-6" aria-hidden="true" /></span>
                      <span className="rounded bg-primary-soft px-2 py-1 text-[11px] font-semibold text-[#9B1C2C]">{tag}</span>
                    </div>
                    <h3 className="mt-6 font-heading text-lg font-bold text-[#2A1B1F]">{title}</h3>
                    <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{text}</p>
                  </div>
                </article>
              </Reveal>
            )
          })}

          <Reveal delay={360} variant="scale" className="h-full">
            <article className="flex h-full flex-col rounded-xl bg-[#8E1F2C] p-5 text-white shadow-sm transition-transform hover:-translate-y-1 hover:shadow-lg">
              <div className="flex items-start justify-between">
                <span className="flex size-11 items-center justify-center rounded-lg bg-white/15"><Sparkles className="size-6" aria-hidden="true" /></span>
                <span className="rounded bg-white/20 px-2 py-1 text-[11px] font-semibold">Ready when you are</span>
              </div>
              <h3 className="mt-6 font-heading text-lg font-bold">Start your first order</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-white/90">Browse the menu and plan an event or a week of meals.</p>
              <hr className="my-5 border-white/30" />
              <Button onClick={onBrowse} className="h-10 w-full gap-2 rounded-lg leading-none bg-[#1A0E10] text-xs font-semibold text-white shadow-none hover:bg-black">Browse menu <ArrowRight className="size-3.5" aria-hidden="true" /></Button>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  )
}