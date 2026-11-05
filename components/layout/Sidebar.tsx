'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Calendar,
  ClipboardList,
  Clock,
  DollarSign,
  LayoutDashboard,
  Package,
  Settings,
  UtensilsCrossed,
  X,
} from 'lucide-react';

const sections = [
  {
    title: 'Overview',
    links: [{ href: '/owner/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Orders',
    links: [
      { href: '/owner/bookings', label: 'Bookings', icon: ClipboardList },
      { href: '/owner/calendar', label: 'Calendar', icon: Calendar },
      { href: '/owner/prep-schedule', label: 'Prep Schedule', icon: Clock },
    ],
  },
  {
    title: 'Kitchen',
    links: [
      { href: '/menu-management', label: 'Menu Management', icon: UtensilsCrossed },
      { href: '/owner/inventory', label: 'Inventory', icon: Package },
      { href: '/macroflex', label: 'MacroFlex', icon: Activity },
    ],
  },
  {
    title: 'Business',
    links: [
      { href: '/owner/payments', label: 'Payments', icon: DollarSign },
      { href: '/owner/settings', label: 'Operating Rules', icon: Settings },
    ],
  },
];

/**
 * Owner sidebar. Fixed on large screens, a slide-in drawer on small ones.
 * `open` / `onClose` only matter below the lg breakpoint.
 */
export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Owner navigation"
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col overflow-y-auto bg-[#8E1F2C] px-4 py-6 text-white transition-transform duration-200 lg:z-30 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/owner/dashboard" onClick={onClose} aria-label="CaterFlex dashboard">
            <img src="/logo.png" alt="CaterFlex" className="h-16 w-16 object-contain" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
                {section.title}
              </p>
              <ul className="space-y-1">
                {section.links.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                          active
                            ? 'bg-white text-[#8E1F2C] shadow-sm'
                            : 'text-white/85 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="size-5 shrink-0" aria-hidden="true" />
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <p className="mt-6 px-3 text-xs text-white/50">CaterFlex · Owner</p>
      </aside>
    </>
  );
}
