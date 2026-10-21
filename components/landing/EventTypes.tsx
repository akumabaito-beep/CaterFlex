import Link from 'next/link'
import { Baby, Briefcase, Cake, GraduationCap, Heart, Gift, PartyPopper, Users } from 'lucide-react'
import { Reveal } from '@/components/landing/Reveal'

// Edit this list to match the occasions you really cater.
const events = [
  { title: 'Weddings', text: 'Receptions, engagements and bridal showers.', icon: Heart },
  { title: 'Corporate events', text: 'Meetings, seminars, launches and office lunches.', icon: Briefcase },
  { title: 'Birthdays', text: 'Kids parties, milestone birthdays and surprise dinners.', icon: Cake },
  { title: 'Debuts', text: 'Eighteenth birthday celebrations.', icon: PartyPopper },
  { title: 'Baptisms & christenings', text: 'Family gatherings after the ceremony.', icon: Baby },
  { title: 'Graduations', text: 'Celebration meals for graduates and their families.', icon: GraduationCap },
  { title: 'Family reunions', text: 'Big tables for the whole clan.', icon: Users },
  { title: 'Holiday parties', text: 'Christmas, New Year and other seasonal get-togethers.', icon: Gift },
]

export function EventTypes() {
  return (
    <section id="events" className="flex min-h-[calc(100svh-4rem)] scroll-mt-16 items-center bg-card px-6 py-12 lg:py-8">
      <div className="mx-auto w-full max-w-7xl lg:px-10">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#8E1F2C]">Every occasion</p>
          <h2 className="mt-3 font-heading text-4xl font-bold leading-[1.08] tracking-tight text-[#2A1B1F] sm:text-5xl">Events we cater.</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">From intimate gatherings to big celebrations, we plan the food around your event.</p>
        </Reveal>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {events.map(({ title, text, icon: Icon }, i) => (
            <li key={title}>
              <Reveal delay={(i % 4) * 90} variant="scale" className="h-full">
                <article className="flex h-full flex-col rounded-xl border border-border bg-background p-5 transition-transform hover:-translate-y-1 hover:shadow-lg">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-primary-soft text-[#8E1F2C]"><Icon className="size-5" aria-hidden="true" /></span>
                  <h3 className="mt-4 font-heading text-base font-bold text-[#2A1B1F]">{title}</h3>
                  <p className="mt-1.5 text-sm leading-5 text-muted-foreground">{text}</p>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>

        <Reveal delay={150}>
          <div className="mt-6 flex flex-col gap-3 border border-dashed border-[#8E1F2C]/40 bg-primary-soft p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-[#2A1B1F] sm:text-base"><span className="font-semibold">Don&apos;t see your occasion?</span> Tell us what you&apos;re celebrating in your booking request.</p>
            <Link href="/login" className="inline-flex h-10 w-fit items-center justify-center rounded-lg bg-[#9B1C2C] px-6 text-sm font-medium text-white hover:bg-[#7F1623] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9B1C2C] focus-visible:ring-offset-2">Book an event</Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}