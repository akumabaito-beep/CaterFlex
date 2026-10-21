// ── Edit these before launch ────────────────────────────────────────────
const ADDRESS = ['Zone 6, Panganiban Drive, Concepcion Pequeña', 'Naga City, Philippines'] // TODO: real address (shown as plain text, not clickable)
const ABOUT_HREF = '' // TODO: point to your About page or a section id
const CONTACT_HREF = '' // TODO: point to your Contact page, mailto: or section id
// ────────────────────────────────────────────────────────────────────────

const explore = [
  { label: 'Services', href: '/#services' },
  { label: 'Events', href: '/#events' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Menu', href: '/menu' },
]
const company = [
  { label: 'About us', href: ABOUT_HREF },
  { label: 'Contact us', href: CONTACT_HREF },
]

const linkCls =
  'text-foreground/80 underline-offset-4 hover:text-[#8E1F2C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8E1F2C]'

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-white px-6 text-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr] lg:px-10">
        <div className="max-w-sm">
          <a href="/" aria-label="CaterFlex home" className="inline-block">
            <img src="/logo.png" alt="CaterFlex" className="size-14 object-contain brightness-0" />
          </a>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Event catering and weekly meal-prep, planned around your table.
          </p>
          <div className="mt-5 flex items-center gap-4 text-[#8E1F2C]">
            <svg role="img" aria-label="Instagram" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
            </svg>
            <svg role="img" aria-label="Facebook" viewBox="0 0 24 24" className="size-7" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9V12h2.54V9.8c0-2.51 1.49-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99C18.34 21.13 22 16.99 22 12c0-5.52-4.48-10-10-10z" />
            </svg>
          </div>
        </div>

        <nav aria-label="Explore">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Explore</p>
          <ul className="mt-4 space-y-3 text-sm">
            {explore.map((l) => (
              <li key={l.label}><a href={l.href} className={linkCls}>{l.label}</a></li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Company">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Company</p>
          <ul className="mt-4 space-y-3 text-sm">
            {company.map((l) => (
              <li key={l.label}><a href={l.href} className={linkCls}>{l.label}</a></li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">Address</p>
          <address className="mt-4 space-y-1 text-sm not-italic text-foreground/80">
            {ADDRESS.map((line) => (<p key={line}>{line}</p>))}
          </address>
        </div>
      </div>

      <div className="mx-auto max-w-7xl border-t border-border py-6 text-xs text-muted-foreground lg:px-10">
        © {new Date().getFullYear()} CaterFlex. All rights reserved.
      </div>
    </footer>
  )
}