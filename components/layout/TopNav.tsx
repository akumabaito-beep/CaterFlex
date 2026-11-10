'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppState } from '@/lib/state';
import { getUnreadNotificationCount } from '@/app/actions/notification-actions';
import { formatUnreadBadgeCount, NOTIFICATIONS_UPDATED_EVENT } from '@/lib/notification-client';
import { signOutAccount } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Bell, LogOut, Menu, User } from 'lucide-react';

export function TopNav({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { currentRole, currentUser } = useAppState();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (currentRole !== 'owner') return;

    let active = true;
    const refresh = async () => {
      const result = await getUnreadNotificationCount();
      if (active && result.ok) setUnreadCount(result.count);
    };
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    refresh();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    };
  }, [currentRole]);

  const handleSignOut = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      const data = await response.json();
      await signOutAccount();
      router.push(response.ok && data.redirectUrl ? data.redirectUrl : '/login');
    } catch {
      await signOutAccount();
      router.push('/login');
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:justify-end lg:px-8">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-[#2B1D16] lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex items-center gap-3">
          {currentRole === 'owner' && (
            <button
              type="button"
              onClick={() => router.push('/owner/notifications')}
              aria-label={`Notifications, ${unreadCount} unread`}
              className="relative flex size-10 items-center justify-center rounded-lg text-[#2B1D16] transition hover:bg-[#F6E3D3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8431B]"
            >
              <Bell className="size-5" aria-hidden="true" />
              {formatUnreadBadgeCount(unreadCount) && (
                <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#C8431B] px-1 text-center text-[10px] font-bold leading-5 text-white">
                  {formatUnreadBadgeCount(unreadCount)}
                </span>
              )}
            </button>
          )}

          <div className="hidden items-center gap-2 rounded-lg bg-[#F6E3D3] px-3 py-1.5 sm:flex">
            <User className="size-4 text-[#C8431B]" />
            <span className="text-sm font-semibold capitalize text-[#2B1D16]">
              {currentUser?.name || currentRole}
            </span>
          </div>

          <Button
            onClick={handleSignOut}
            className="h-9 gap-2 rounded-lg bg-[#C8431B] px-4 text-sm font-medium text-white hover:bg-[#A93615]"
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
