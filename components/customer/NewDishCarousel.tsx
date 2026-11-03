'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChefHat, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PublicMenuItem } from '@/lib/public-menu'

const AUTOPLAY_MS = 5000

function usePerView(): number {
  const [perView, setPerView] = useState(3)
  useEffect(() => {
    const update = () => setPerView(window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return perView
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(q.matches)
    const on = () => setReduced(q.matches)
    q.addEventListener('change', on)
    return () => q.removeEventListener('change', on)
  }, [])
  return reduced
}

function Dish({ item }: { item: PublicMenuItem }) {
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg">
      <span className="absolute left-3 top-3 z-10 rounded bg-[#8E1F2C] px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white">New</span>
      {item.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.photoUrl} alt={item.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center bg-primary-soft text-[#8E1F2C]" aria-hidden="true">
          <ChefHat className="size-10" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-base font-bold leading-snug text-[#2A1B1F]">{item.name}</h3>
          <span className="shrink-0 text-sm font-semibold text-[#8E1F2C]">₱{item.price.toFixed(2)}</span>
        </div>
        {item.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</p>}
      </div>
    </article>
  )
}

/**
 * Slides to the left every 5 seconds, loops forever, and has left / right buttons.
 * Pauses while hovered or focused, and does not auto-play for people who prefer reduced motion.
 */
export function NewDishCarousel({ items }: { items: PublicMenuItem[] }) {
  const perView = usePerView()
  const reduced = usePrefersReducedMotion()
  const n = items.length
  const sliding = n > perView

  const [index, setIndex] = useState(0)
  const [animate, setAnimate] = useState(true)
  const [paused, setPaused] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Reset when the layout changes.
  useEffect(() => {
    setAnimate(false)
    setIndex(0)
  }, [perView, n])

  const next = useCallback(() => {
    setAnimate(!reduced)
    // Ignore extra clicks while sliding onto the cloned tail (it resets right after).
    setIndex((i) => (i >= n ? i : i + 1))
  }, [reduced, n])

  const prev = useCallback(() => {
    if (index === 0) {
      // jump to the cloned end without animating, then slide back one
      setAnimate(false)
      setIndex(n)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          setAnimate(!reduced)
          setIndex(n - 1)
        })
      )
    } else {
      setAnimate(!reduced)
      setIndex(index - 1)
    }
  }, [index, n, reduced])

  // Auto-advance. Restarts after every move so a manual click gets a full 5 seconds.
  useEffect(() => {
    if (!sliding || paused || reduced) return
    const t = setTimeout(next, AUTOPLAY_MS)
    return () => clearTimeout(t)
  }, [index, sliding, paused, reduced, next])

  const onTransitionEnd = (e: React.TransitionEvent<HTMLUListElement>) => {
    if (e.target !== e.currentTarget) return // ignore hover transitions on the cards
    if (index >= n) {
      setAnimate(false)
      setIndex(index - n)
    }
  }

  const slides = sliding ? [...items, ...items.slice(0, perView)] : items
  const active = ((index % n) + n) % n

  const arrow =
    'absolute top-1/2 z-20 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg border border-[#E8D2D2] bg-white text-[#8E1F2C] shadow-md transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C]'

  return (
    <div
      ref={rootRef}
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label="New on the menu"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
    >
      <div className="-mx-2.5 overflow-hidden px-0 py-2">
        <ul
          className="flex"
          style={{
            transform: `translateX(-${index * (100 / perView)}%)`,
            transition: animate && !reduced ? 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
          onTransitionEnd={onTransitionEnd}
          aria-live={paused ? 'polite' : 'off'}
        >
          {slides.map((item, i) => (
            <li
              key={`${item.id}-${i}`}
              className="flex-none px-2.5"
              style={{ width: `${100 / perView}%` }}
              aria-hidden={i >= n ? true : undefined}
            >
              <Dish item={item} />
            </li>
          ))}
        </ul>
      </div>

      {sliding && (
        <>
          <button type="button" onClick={prev} aria-label="Previous dishes" className={`${arrow} -left-3 sm:-left-5`}>
            <ChevronLeft className="size-6" aria-hidden="true" />
          </button>
          <button type="button" onClick={next} aria-label="Next dishes" className={`${arrow} -right-3 sm:-right-5`}>
            <ChevronRight className="size-6" aria-hidden="true" />
          </button>

          <div className="mt-4 flex justify-center gap-2" role="group" aria-label="Choose a slide">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.name}`}
                aria-current={i === active}
                onClick={() => {
                  setAnimate(!reduced)
                  setIndex(i)
                }}
                className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C] ${
                  i === active ? 'w-6 bg-[#8E1F2C]' : 'w-2 bg-[#E8D2D2] hover:bg-[#8E1F2C]/50'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
