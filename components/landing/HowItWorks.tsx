import { Reveal } from '@/components/landing/Reveal'

// Keep this wording true to what the system does.
const steps = [
  { title: 'Create your account', text: 'Sign up and log in so your bookings and orders are saved under your name.' },
  { title: 'Browse the menu', text: 'See every available dish with its price, description and allergen information.' },
  { title: 'Send a request', text: 'Book an event with your date, time, venue and guest count, or set up a recurring weekly meal-prep order. Availability is checked against current stock.' },
  { title: 'We review and confirm', text: 'The caterer reviews your request and confirms it. You can follow the status of every booking and order from your account.' },
  { title: 'We prepare and fulfill', text: 'Your meals are prepared and fulfilled on the confirmed date. Weekly orders can be paused, resumed or cancelled.' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="flex min-h-[calc(100svh-4rem)] scroll-mt-16 items-center bg-background px-6 py-12 lg:py-8">
      <div className="mx-auto w-full max-w-7xl lg:px-10">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#8E1F2C]">How it works</p>
          <h2 className="mt-3 font-heading text-4xl font-bold leading-[1.08] tracking-tight text-[#2A1B1F] sm:text-5xl">From first idea to final plate.</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">Five simple steps, whether you&apos;re planning a celebration or a week of meals.</p>
        </Reveal>
        <ol className="mt-10 lg:grid lg:grid-cols-5 lg:gap-5">
          {steps.map((step, i) => (
            <li key={step.title} className="relative pb-8 last:pb-0 lg:pb-0">
              {/* connector: vertical on small screens, horizontal on desktop */}
              {i < steps.length - 1 && <span aria-hidden="true" className="absolute left-5 top-12 h-[calc(100%-2.5rem)] w-px bg-[#F3D6D6] sm:left-6 sm:top-14 lg:left-12 lg:top-6 lg:h-px lg:w-[calc(100%-2rem)]" />}
              <Reveal delay={i * 80} className="lg:h-full">
                <div className="flex gap-5 sm:gap-6 lg:h-full lg:flex-col lg:gap-5">
                  <span className="relative flex size-10 shrink-0 items-center justify-center rounded-none bg-[#8E1F2C] font-heading text-lg font-bold text-white sm:size-12">{i + 1}</span>
                  <div className="flex-1 rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h3 className="font-heading text-lg font-bold text-[#2A1B1F]">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
                  </div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}