export type NoticeTone = 'error' | 'success' | 'info'

export interface Notice {
  id: number
  tone: NoticeTone
  title: string
  body: string
}

type Listener = (notice: Notice) => void

const listeners = new Set<Listener>()
let nextId = 1

export function subscribeToNotices(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function sentence(text: string) {
  const trimmed = text.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : trimmed
}

// Turns the plain message strings used across the app ("Meal prep order failed: ...") into a title and a body.
function describe(message: string, tone?: NoticeTone): Pick<Notice, 'tone' | 'title' | 'body'> {
  const text = message.trim()
  const failedAfter = text.match(/^(.+?)\s+failed:\s*([\s\S]+)$/i)
  if (failedAfter) {
    return { tone: tone ?? 'error', title: `${sentence(failedAfter[1])} didn't go through`, body: sentence(failedAfter[2]) }
  }
  const failedTo = text.match(/^(?:failed|unable) to ([^:.]+)[:.]?\s*([\s\S]*)$/i)
  if (failedTo) {
    return { tone: tone ?? 'error', title: `Couldn't ${failedTo[1].trim()}`, body: sentence(failedTo[2]) || 'Please try again.' }
  }
  const inferred: NoticeTone = tone ?? (/\b(success|saved|created|updated|deleted|sent|done|confirmed)\b/i.test(text) ? 'success' : /\b(fail|error|cannot|can't|unable|invalid|not allowed|already)\b/i.test(text) ? 'error' : 'info')
  const title = inferred === 'error' ? 'Something needs your attention' : inferred === 'success' ? 'Done' : 'Notice'
  return { tone: inferred, title, body: sentence(text) }
}

/** Shows the CaterFlex message dialog. Use it instead of window.alert. */
export function notify(message: string, options: { tone?: NoticeTone; title?: string } = {}) {
  const described = describe(message, options.tone)
  const notice: Notice = { id: nextId++, ...described, title: options.title ?? described.title }
  if (listeners.size === 0) {
    // The dialog host is not mounted (for example during a server render): fall back to the browser alert.
    if (typeof window !== 'undefined') window.alert(`${notice.title}\n\n${notice.body}`)
    return
  }
  listeners.forEach((listener) => listener(notice))
}
