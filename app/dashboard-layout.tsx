'use client';

import { ReactNode, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopNav } from '@/components/layout/TopNav';

interface DashboardLayoutProps {
  children: ReactNode;
  mainStyle?: React.CSSProperties;
  mainClassName?: string;
}

export function DashboardLayout({
  children,
  mainStyle,
  mainClassName = '',
}: DashboardLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#FFF7F6]">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col lg:ml-64">
        <TopNav onMenuClick={() => setMenuOpen(true)} />
        <main
          className={`flex-1 bg-surface text-surface-foreground ${mainClassName}`}
          style={mainStyle}
        >
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
