'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { OrderSection } from '@/components/landing/OrderSection'
import { Reveal } from '@/components/landing/Reveal'
import { EventTypes } from '@/components/landing/EventTypes'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingHeader } from '@/components/landing/LandingHeader'
import { ServicesShowcase } from '@/components/landing/ServiceShowcase'

const photos = [
  { src: '/landing/1-salad-rice-bites.webp', alt: 'Party trays of fruit salad, garlic rice and carrot canapés' },
  { src: '/landing/2-crispy-pork-mains.webp', alt: 'Crispy pork mains served with colorful sides' },
  { src: '/landing/3-meal-prep-boxes.webp', alt: 'Freshly prepared meal-prep boxes arranged for the week' },
  { src: '/landing/4-sisig-shrimp-pasta.webp', alt: 'Sisig and shrimp pasta dishes ready to serve' },
  { src: '/landing/5-tray-assortment.webp', alt: 'An assortment of catered trays for sharing' },
  { src: '/landing/6-rice-meal-boxes.webp', alt: 'Rice meal boxes packed for easy weekly meals' },
]


function PhotoCard({ photo, duplicate = false, index, spacing = 'horizontal' }: { photo: typeof photos[number]; duplicate?: boolean; index: number; spacing?: 'vertical' | 'horizontal' }) {
  return <div className={`shrink-0 ${spacing === 'vertical' ? 'pb-4' : 'pr-4'}`} aria-hidden={duplicate}>
    <div className="overflow-hidden rounded-2xl shadow-xl">
      <Image src={photo.src} alt={duplicate ? '' : photo.alt} width={640} height={448} sizes="(min-width: 1024px) 320px, 256px" className="h-44 w-64 object-cover opacity-80 lg:h-44 lg:w-72" />
    </div>
  </div>
}

function Marquee() {
  const secondRow = [...photos.slice(3), ...photos.slice(0, 3)]
  return <div className="pointer-events-none mt-10 flex flex-col gap-4 lg:mt-8" aria-hidden="true">
    <div className="marquee-row-viewport">
      <div className="marquee-left flex w-max">{[...photos, ...photos].map((photo, i) => <PhotoCard key={`left-${i}`} photo={photo} duplicate={i >= photos.length} index={i} spacing="horizontal" />)}</div>
    </div>
    <div className="marquee-row-viewport">
      <div className="marquee-right flex w-max">{[...secondRow, ...secondRow].map((photo, i) => <PhotoCard key={`right-${i}`} photo={photo} duplicate={i >= photos.length} index={i} spacing="horizontal" />)}</div>
    </div>
  </div>
}

export default function Page() {
  const router = useRouter()
  const enterAsCustomer = () => { router.push('/login') }

  return <main className="min-h-screen overflow-x-clip bg-background text-foreground">
    <LandingHeader />
    <div id="home" className="scroll-mt-16"><OrderSection onOrder={enterAsCustomer} /></div>
    <ServicesShowcase />
    <EventTypes />
    <HowItWorks />
    <section id="order" className="relative isolate flex min-h-[calc(100svh-4rem)] scroll-mt-16 flex-col justify-center overflow-hidden bg-[#8E1F2C] py-12 text-white lg:py-8">
      <div className="mx-auto max-w-7xl px-6 text-center lg:px-10">
        <Reveal><h2 className="mx-auto max-w-3xl font-heading text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">Order Your Food &amp; Enjoy The Taste.</h2></Reveal>
      </div>
      <Marquee />
    </section>
    <LandingFooter />
  </main>
}