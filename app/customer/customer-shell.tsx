'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { ContactPrompt } from '@/components/auth/ContactPrompt';
import { useState } from 'react';
import { signOutAccount } from '@/lib/auth';

// Same look as the landing page header: white bar, uppercase tracked links, dark-red button.
const links = [
  { href: '/customer/home', label: 'Home', match: ['/customer/home'] },
  {
    href: '/customer/inquiry',
    label: 'Start an order',
    // the whole ordering flow keeps this link highlighted
    match: ['/customer/inquiry', '/customer/meal-prep-preview', '/customer/browse'],
  },
  { href: '/customer/status', label: 'My requests', match: ['/customer/status'] },
  { href: '/customer/active-orders', label: 'Meal plans', match: ['/customer/active-orders'] },
];

const solid =
  'inline-flex h-9 items-center justify-center rounded-lg bg-[#C8431B] px-4 text-sm font-medium text-white hover:bg-[#A93615] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B] focus-visible:ring-offset-2';

export function CustomerShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSignOut = async () => {
    setOpen(false);
    await signOutAccount();
    router.push('/login');
  };

  const isActive = (match: string[]) => match.some((m) => pathname === m || pathname.startsWith(`${m}/`));

  return (
    <div className="min-h-screen bg-[#EFE0CD] text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/80 bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link href="/customer/home" onClick={() => setOpen(false)} aria-label="CaterFlex home">
            <img src="/logo.png" alt="CaterFlex" className="size-12 object-contain brightness-0" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Customer navigation">
            {links.map((link) => {
              const active = isActive(link.match);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`text-xs font-semibold uppercase tracking-[0.16em] transition-colors hover:text-[#C8431B] ${
                    active ? 'text-[#C8431B]' : 'text-muted-foreground'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button type="button" onClick={handleSignOut} className={solid}>
              Sign out
            </button>
          </div>

          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-[#2B1D16] md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {open && (
          <nav
            className="absolute inset-x-0 top-full border-b border-border bg-card px-6 py-4 shadow-lg md:hidden"
            aria-label="Customer navigation"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                aria-current={isActive(link.match) ? 'page' : undefined}
                className={`block py-3 text-sm font-semibold uppercase tracking-wide ${
                  isActive(link.match) ? 'text-[#C8431B]' : 'text-muted-foreground'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex gap-3 border-t border-border pt-3">
              <button type="button" onClick={handleSignOut} className={solid}>
                Sign out
              </button>
            </div>
          </nav>
        )}
      </header>
      <ContactPrompt />

      <main
        className="min-h-[calc(100vh-65px)] bg-[#EFE0CD] bg-top bg-repeat-y bg-[length:100%_auto] px-5 py-8 lg:px-8 lg:py-12"
        style={{ backgroundImage: "url('/customer-bg.png')" }}
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}