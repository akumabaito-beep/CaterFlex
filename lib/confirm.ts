export type ConfirmTone = 'danger' | 'default'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number
  resolve: (confirmed: boolean) => void
}

type Listener = (request: ConfirmRequest) => void

const listeners = new Set<Listener>()
let nextId = 1

export function subscribeToConfirms(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Shows the CaterFlex confirmation dialog. Use it instead of window.confirm. Resolves true on confirm, false on cancel or dismiss. */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      // The dialog host is not mounted: fall back to the browser prompt.
      resolve(typeof window !== 'undefined' ? window.confirm(options.body ? `${options.title}\n\n${options.body}` : options.title) : false)
      return
    }
    const request: ConfirmRequest = { id: nextId++, ...options, resolve }
    listeners.forEach((listener) => listener(request))
  })
}
