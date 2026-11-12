
'use client'

import Image from 'next/image'
import { ArrowRight, CalendarCheck, ChefHat, Repeat } from 'lucide-react'
import { Reveal } from '@/components/landing/Reveal'
import { Button } from '@/components/ui/button'

const highlights = [
  { icon: CalendarCheck, title: 'Events of any size', text: 'Pick a date, guest count and menu in one request.' },
  { icon: Repeat, title: 'Weekly meal plans', text: 'Set it once and get your meals on schedule.' },
  { icon: ChefHat, title: 'Checked against stock', text: 'We only offer dishes the kitchen can actually make.' },
]

export function OrderSection({ onOrder }: { onOrder: () => void }) {
  return (
    <section className="relative flex h-[calc(100svh-4rem)] min-h-[34rem] items-center overflow-hidden bg-[#FBF6EE] text-[#2B1D16]">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-8 px-6 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-10">
        <Reveal className="relative z-10 max-w-xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[#E8D8C4] bg-white px-3.5 py-1.5 text-sm font-medium text-[#6F5F52]">
            <span className="size-2 rounded-full bg-[#C8431B]" aria-hidden="true" />
            Catering and meal prep, made personal
          </p>

          <h1 className="mt-[clamp(0.75rem,2.5svh,1.5rem)] font-heading text-[clamp(2.25rem,7.5svh,4.75rem)] font-bold uppercase leading-[1.02] tracking-tight text-[#2B1D16]">
            Good food starts with a <span className="text-[#C8431B]">better plan.</span>
          </h1>

          <p className="mt-[clamp(0.75rem,2.5svh,1.5rem)] max-w-md text-base leading-7 text-[#6F5F52] sm:text-lg sm:leading-8">
            Discover the menu, plan a gathering and order meals that match your needs, all in one organized place.
          </p>

          <div className="mt-[clamp(1rem,3.5svh,2rem)] flex flex-wrap items-center gap-3">
            <Button onClick={onOrder} className="h-12 gap-2 rounded-lg bg-[#C8431B] px-7 leading-none text-white shadow-none hover:bg-[#A93615]">
              Order now
              <ArrowRight data-icon="inline-end" />
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center rounded-lg border border-[#2B1D16]/25 px-6 text-sm font-semibold text-[#2B1D16] transition-colors hover:bg-[#2B1D16] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"
            >
              See how it works
            </a>
          </div>

          <ul className="mt-[clamp(1.25rem,4svh,2.5rem)] hidden gap-4 border-t border-[#E8D8C4] pt-5 sm:grid-cols-3 sm:[@media(min-height:760px)]:grid">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon className="size-5 text-[#C8431B]" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-[#2B1D16]">{title}</p>
                <p className="mt-1 text-sm leading-5 text-[#6F5F52]">{text}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={140} variant="scale" className="relative mx-auto hidden w-full max-w-md sm:block lg:max-w-[min(30rem,calc((100svh-9.5rem)*0.8))]">
          {/* espresso block sits behind the photo so it never blends into the page */}
          <div className="absolute -bottom-4 -right-4 left-6 top-6 rounded-t-[999px] rounded-b-3xl bg-[#2B1D16]" aria-hidden="true" />
          <div className="relative aspect-[4/5] overflow-hidden rounded-t-[999px] rounded-b-3xl border-4 border-white bg-white shadow-xl">
            <Image
              src="/landing/hero2.jpg"
              alt="A generous plate of colorful catered food"
              fill
              sizes="(min-width: 1024px) 480px, 80vw"
              className="object-cover"
              priority
            />
          </div>

          <div className="absolute -left-4 bottom-10 size-28 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-lg sm:-left-8 sm:size-32">
            <Image src="/landing/hero3.jpg" alt="Fresh meal prep box" fill sizes="128px" className="object-cover" />
          </div>

          <div className="absolute -right-2 top-16 hidden items-center gap-2 rounded-full bg-[#C8431B] px-4 py-2 text-sm font-semibold text-white shadow-lg sm:flex">
            <Repeat className="size-4" aria-hidden="true" />
            Weekly meal plans
          </div>
        </Reveal>
      </div>
    </section>
  )
}
