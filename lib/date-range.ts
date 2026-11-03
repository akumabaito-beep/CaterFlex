// Date-range helpers for the owner dashboard. All dates are 'YYYY-MM-DD' strings in Asia/Manila.

export type RangePreset =
  | '7d'
  | '30d'
  | '90d'
  | 'month'
  | 'last_month'
  | 'year'
  | 'all'
  | 'custom'

export type RangeInput = { preset: RangePreset; from?: string; to?: string }
export type Bucket = 'day' | 'week' | 'month'
export type ResolvedRange = { from: string; to: string; label: string; bucket: Bucket }

export const PRESET_LABELS: Record<RangePreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  month: 'This month',
  last_month: 'Last month',
  year: 'This year',
  all: 'All time',
  custom: 'Custom',
}

export const MAX_RANGE_DAYS = 366 * 3

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now)
}

export function toManilaDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : manilaToday(d)
}

function parse(d: string): Date {
  return new Date(`${d}T00:00:00Z`)
}
function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
export function addDays(d: string, n: number): string {
  const x = parse(d)
  x.setUTCDate(x.getUTCDate() + n)
  return fmt(x)
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)
}
function startOfMonth(d: string): string {
  return `${d.slice(0, 7)}-01`
}
function endOfMonth(d: string): string {
  const x = parse(startOfMonth(d))
  x.setUTCMonth(x.getUTCMonth() + 1)
  x.setUTCDate(0)
  return fmt(x)
}
function startOfWeek(d: string): string {
  const day = parse(d).getUTCDay() // 0 = Sunday
  return addDays(d, -((day + 6) % 7)) // Monday
}

export function bucketFor(from: string, to: string): Bucket {
  const span = daysBetween(from, to) + 1
  if (span <= 92) return 'day'
  if (span <= 366) return 'week'
  return 'month'
}

function fmtLabelDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Resolve a preset or custom input into concrete dates.
 * `earliest` is the oldest date with data, used for "All time".
 * Returns an error string for invalid custom ranges.
 */
export function resolveRange(
  input: RangeInput,
  today: string,
  earliest?: string | null
): ResolvedRange | { error: string } {
  let from: string
  let to = today
  switch (input.preset) {
    case '7d':
      from = addDays(today, -6)
      break
    case '30d':
      from = addDays(today, -29)
      break
    case '90d':
      from = addDays(today, -89)
      break
    case 'month':
      from = startOfMonth(today)
      to = endOfMonth(today)
      break
    case 'last_month': {
      const lastEnd = addDays(startOfMonth(today), -1)
      from = startOfMonth(lastEnd)
      to = lastEnd
      break
    }
    case 'year':
      from = `${today.slice(0, 4)}-01-01`
      to = `${today.slice(0, 4)}-12-31`
      break
    case 'all':
      from = earliest && earliest <= today ? earliest : addDays(today, -29)
      break
    case 'custom': {
      if (!input.from || !input.to || !ISO.test(input.from) || !ISO.test(input.to)) {
        return { error: 'Choose a start and end date.' }
      }
      if (Number.isNaN(parse(input.from).getTime()) || Number.isNaN(parse(input.to).getTime())) {
        return { error: 'Invalid date.' }
      }
      if (input.from > input.to) return { error: 'The start date must be on or before the end date.' }
      if (daysBetween(input.from, input.to) + 1 > MAX_RANGE_DAYS) {
        return { error: 'Please choose a range of 3 years or less.' }
      }
      from = input.from
      to = input.to
      break
    }
    default:
      return { error: 'Unknown date range.' }
  }
  const label =
    input.preset === 'custom' || input.preset === 'all' || input.preset === 'month' ||
    input.preset === 'last_month' || input.preset === 'year'
      ? `${fmtLabelDate(from)} – ${fmtLabelDate(to)}`
      : PRESET_LABELS[input.preset]
  return { from, to, label, bucket: bucketFor(from, to) }
}

function bucketStart(d: string, bucket: Bucket): string {
  if (bucket === 'day') return d
  if (bucket === 'week') return startOfWeek(d)
  return startOfMonth(d)
}

/** Sum amounts by day, then group into buckets. Missing buckets are filled with 0. */
export function buildSeries(
  amountsByDay: Map<string, number>,
  from: string,
  to: string,
  bucket: Bucket
): { date: string; revenue: number }[] {
  const totals = new Map<string, number>()
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const key = bucketStart(d, bucket)
    totals.set(key, (totals.get(key) ?? 0) + (amountsByDay.get(d) ?? 0))
  }
  return [...totals.entries()].map(([date, revenue]) => ({ date, revenue }))
}

export function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}
