import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';

const photoColumns = [
  ['/landing/1-salad-rice-bites.webp', '/landing/4-sisig-shrimp-pasta.webp', '/landing/3-meal-prep-boxes.webp'],
  ['/landing/5-tray-assortment.webp', '/landing/2-crispy-pork-mains.webp', '/landing/6-rice-meal-boxes.webp'],
  ['/landing/6-rice-meal-boxes.webp', '/landing/3-meal-prep-boxes.webp', '/landing/1-salad-rice-bites.webp'],
];

/** Shared split layout for the login and signup pages: form on the left, food photos on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-svh bg-white text-foreground lg:grid-cols-[1.1fr_1fr]">
      <div className="flex min-h-svh flex-col px-6 py-6 sm:px-10 lg:px-14">
        <header>
          <Link href="/" aria-label="Back to CaterFlex home" className="inline-block">
            <img src="/logo.png" alt="CaterFlex" className="size-14 object-contain brightness-0" />
          </Link>
        </header>
        {children}
      </div>

      <aside aria-hidden="true" className="relative hidden overflow-hidden bg-[#8E1F2C] lg:block">
        <div className="absolute left-1/2 top-1/2 flex w-[135%] -translate-x-1/2 -translate-y-1/2 -rotate-12 gap-5">
          {photoColumns.map((col, c) => (
            <div key={c} className="flex flex-1 flex-col gap-5" style={{ marginTop: c % 2 ? '4rem' : '-3rem' }}>
              {col.map((src) => (
                <div key={src} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#6F1722]">
                  <Image src={src} alt="" fill sizes="20vw" className="object-cover opacity-90" />
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-[#8E1F2C]/90 via-transparent to-[#8E1F2C]/40" />
        <p className="absolute inset-x-10 bottom-10 font-heading text-3xl font-bold uppercase leading-tight text-white xl:text-4xl">Order your food &amp; enjoy the taste.</p>
      </aside>
    </main>
  );
}