'use client'

import { useEffect, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { Archive, CircleHelp, Trash2 } from 'lucide-react'
import { subscribeToConfirms, type ConfirmRequest } from '@/lib/confirm'

/** Mount once in the root layout. Shows questions sent with confirmAction(), one at a time. */
export function ConfirmDialog() {
  const [queue, setQueue] = useState<ConfirmRequest[]>([])

  useEffect(() => subscribeToConfirms((request) => setQueue((current) => [...current, request])), [])

  const current = queue[0]
  const danger = current?.tone === 'danger'
  const Icon = danger ? Trash2 : current?.tone === 'default' && /archive|restore/i.test(current.title) ? Archive : CircleHelp

  const finish = (request: ConfirmRequest, confirmed: boolean) => {
    request.resolve(confirmed)
    setQueue((items) => items.filter((item) => item.id !== request.id))
  }

  return (
    <DialogPrimitive.Root
      open={Boolean(current)}
      onOpenChange={(open) => {
        if (!open && current) finish(current, false)
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-[100] bg-[#2B1D16]/50 backdrop-blur-[2px] duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#EBDDC9] bg-white p-6 text-[#2B1D16] shadow-xl outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none">
          {current && (
            <>
              <div className="flex items-start gap-4">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-[#FBE4DC] text-[#B3321A]' : 'bg-[#F6E3D3] text-[#C8431B]'}`}
                  aria-hidden="true"
                >
                  <Icon className="size-6" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <DialogPrimitive.Title className="font-heading text-lg font-bold leading-snug">{current.title}</DialogPrimitive.Title>
                  {current.body && (
                    <DialogPrimitive.Description className="mt-2 break-words text-[15px] leading-relaxed text-[#6F5F52]">{current.body}</DialogPrimitive.Description>
                  )}
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogPrimitive.Close className="h-11 min-w-28 rounded-lg border border-[#E8D8C4] bg-white px-6 text-sm font-semibold text-[#2B1D16] outline-none transition-colors hover:bg-[#f1f1f2] focus-visible:ring-2 focus-visible:ring-[#C8431B] focus-visible:ring-offset-2">
                  {current.cancelLabel ?? 'Cancel'}
                </DialogPrimitive.Close>
                <button
                  type="button"
                  onClick={() => finish(current, true)}
                  className={`h-11 min-w-28 rounded-lg px-6 text-sm font-semibold text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${danger ? 'bg-[#B3321A] hover:bg-[#962814] focus-visible:ring-[#B3321A]' : 'bg-[#C8431B] hover:bg-[#A93615] focus-visible:ring-[#C8431B]'}`}
                >
                  {current.confirmLabel ?? 'Confirm'}
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
