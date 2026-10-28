'use client'

import Image from 'next/image'
import { ArrowRight, HeartHandshake, Sparkles } from 'lucide-react'
import { Reveal } from '@/components/landing/Reveal'
import { Button } from '@/components/ui/button'

const foodPhotos = [
  { src: '/landing/hero5.jpg', alt: 'Colorful catered food tray', className: 'left-[2%] top-[17%] size-20 sm:left-[3%] sm:size-28' },
  { src: '/landing/hero6.jpg', alt: 'Crispy pork dish with fresh sides', className: 'right-[4%] top-[8%] size-24 sm:right-[7%] sm:size-32' },
  { src: '/landing/hero3.jpg', alt: 'Fresh meal prep box', className: 'bottom-[7%] left-[15%] size-24 sm:bottom-[4%] sm:left-[18%] sm:size-32' },
]

export function OrderSection({ onOrder }: { onOrder: () => void }) {
  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] items-center overflow-hidden bg-white text-[#2A1B1F]">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[72%] overflow-hidden bg-[#FDE6E6] [clip-path:ellipse(88%_72%_at_25%_0%)]"><Image src="/bg123.jpg" alt="" fill sizes="100vw" className="object-cover" /><div className="absolute inset-0 bg-black/60" /></div>
      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-6 py-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8 lg:px-10">
        <Reveal className="relative z-20 max-w-xl">
          <div className="lg:-translate-y-[clamp(2rem,8svh,5rem)]">
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-white">Catering and meal-prep, made personal</p>
            <h1 className="max-w-lg font-heading text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-[3.25rem] lg:text-[clamp(2.75rem,7svh,4.25rem)]">Good food starts with a better plan.</h1>
          </div>
          <p className="mt-6 max-w-md text-base leading-7 text-[#9C6670] lg:-translate-y-0">CaterFlex helps you discover menus, plan memorable gatherings, and order meals that match your needs—all with a simple, organized experience.</p>
          <Button onClick={onOrder} className="mt-8 h-12 gap-2 rounded-lg leading-none bg-[#9B1C2C] px-7 text-white shadow-none hover:bg-[#7F1623] lg:-translate-y-lg:-translate-y-[clamp(0rem,1svh,0.5rem)]">Order Now <ArrowRight data-icon="inline-end" /></Button>
        </Reveal>

        <Reveal delay={140} variant="scale" className="relative mx-auto aspect-square w-full max-w-[520px] lg:max-w-[min(520px,calc(100svh-9rem))]">
          <div className="absolute inset-[9%] rounded-full border border-[#D79BA3]/70" />
          <div className="absolute inset-[17%] rounded-full border border-dashed border-[#D79BA3]/40" />
          <div className="absolute inset-[14%] overflow-hidden rounded-full border-[10px] border-white bg-white shadow-[0_18px_50px_rgba(92,38,46,0.15)]">
            <Image src="/landing/hero2.jpg" alt="A generous plate of colorful catered food" fill sizes="(min-width: 1024px) 430px, 80vw" className="object-cover" priority />
          </div>
          {foodPhotos.map((photo) => <div key={photo.src} className={`absolute overflow-hidden rounded-full border-4 border-white bg-white shadow-[0_12px_24px_rgba(92,38,46,0.16)] ${photo.className}`}><Image src={photo.src} alt={photo.alt} fill sizes="128px" className="object-cover" /></div>)}
          <Sparkles aria-hidden="true" className="absolute left-[20%] top-[4%] size-7 rotate-12 text-[#C9808C]/70" />
          <HeartHandshake aria-hidden="true" className="absolute bottom-[19%] right-[2%] size-8 -rotate-12 text-[#C9808C]/60" />
          <div aria-hidden="true" className="absolute right-[16%] top-[19%] size-5 rounded-full border-2 border-[#C9808C]/50 after:absolute after:-right-2 after:top-1/2 after:h-px after:w-3 after:rotate-45 after:bg-[#C9808C]/50" />
          <div aria-hidden="true" className="absolute bottom-[22%] left-[5%] h-8 w-5 rounded-b-full rounded-t-md border-2 border-[#C9808C]/45" />
        </Reveal>
      </div>
    </section>
  )
}