'use client'

import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { CheckCircle2, CircleAlert, Info } from 'lucide-react'
import { subscribeToNotices, type Notice } from '@/lib/notify'

const TONES = {
  error: { Icon: CircleAlert, badge: 'bg-[#F6E3D3] text-[#C8431B]' },
  success: { Icon: CheckCircle2, badge: 'bg-[#E3F1E8] text-[#2F7D4F]' },
  info: { Icon: Info, badge: 'bg-[#F6E3D3] text-[#6F4E37]' },
} as const

/** Mount once in the root layout. Shows messages sent with notify(), one at a time. */
export function MessageDialog() {
  const [queue, setQueue] = useState<Notice[]>([])

  useEffect(() => subscribeToNotices((notice) => setQueue((current) => [...current, notice])), [])

  const current = queue[0]
  const tone = TONES[current?.tone ?? 'info']

  return (
    <DialogPrimitive.Root
      open={Boolean(current)}
      onOpenChange={(open) => {
        if (!open) setQueue((items) => items.slice(1))
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[100] bg-[#2B1D16]/50 backdrop-blur-[2px] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#EBDDC9] bg-white p-6 text-[#2B1D16] shadow-xl outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none">
          {current && (
            <>
              <div className="flex items-start gap-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${tone.badge}`} aria-hidden="true">
                  <tone.Icon className="size-6" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <DialogPrimitive.Title className="font-heading text-lg font-bold leading-snug">{current.title}</DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-2 break-words text-[15px] leading-relaxed text-[#6F5F52]">{current.body}</DialogPrimitive.Description>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <DialogPrimitive.Close className="h-11 min-w-28 rounded-lg bg-[#C8431B] px-6 text-sm font-semibold text-white outline-none transition-colors hover:bg-[#A93615] focus-visible:ring-2 focus-visible:ring-[#C8431B] focus-visible:ring-offset-2">
                  Got it
                </DialogPrimitive.Close>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
