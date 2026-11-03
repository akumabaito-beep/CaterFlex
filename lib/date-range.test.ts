import { describe, it, expect } from 'vitest'
import { resolveRange, buildSeries, bucketFor, addDays, toManilaDate } from './date-range'

const TODAY = '2026-10-31'

describe('resolveRange', () => {
  it('resolves rolling presets inclusive of today', () => {
    expect(resolveRange({ preset: '7d' }, TODAY)).toMatchObject({ from: '2026-10-25', to: TODAY, bucket: 'day' })
    expect(resolveRange({ preset: '30d' }, TODAY)).toMatchObject({ from: '2026-10-02', to: TODAY })
  })
  it('resolves calendar presets', () => {
    expect(resolveRange({ preset: 'month' }, TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' })
    expect(resolveRange({ preset: 'last_month' }, TODAY)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' })
    expect(resolveRange({ preset: 'last_month' }, '2026-01-15')).toMatchObject({ from: '2025-12-01', to: '2025-12-31' })
    expect(resolveRange({ preset: 'year' }, TODAY)).toMatchObject({ from: '2026-01-01', to: '2026-12-31', bucket: 'week' })
  })
  it('uses earliest data for all time', () => {
    expect(resolveRange({ preset: 'all' }, TODAY, '2026-03-10')).toMatchObject({ from: '2026-03-10', bucket: 'week' })
    expect(resolveRange({ preset: 'all' }, TODAY, '2023-01-01')).toMatchObject({ bucket: 'month' })
  })
  it('validates custom ranges', () => {
    expect('error' in resolveRange({ preset: 'custom', from: '2026-10-10', to: '2026-10-01' }, TODAY)).toBe(true)
    expect('error' in resolveRange({ preset: 'custom', from: 'nope', to: '2026-10-01' }, TODAY)).toBe(true)
    expect('error' in resolveRange({ preset: 'custom', from: '2010-01-01', to: TODAY }, TODAY)).toBe(true)
    expect(resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-07' }, TODAY)).toMatchObject({ from: '2026-10-01', to: '2026-10-07' })
  })
})

describe('series', () => {
  it('fills missing days with zero', () => {
    const s = buildSeries(new Map([['2026-10-02', 500]]), '2026-10-01', '2026-10-03', 'day')
    expect(s).toEqual([
      { date: '2026-10-01', revenue: 0 },
      { date: '2026-10-02', revenue: 500 },
      { date: '2026-10-03', revenue: 0 },
    ])
  })
  it('groups by week (Monday start) and month', () => {
    const m = new Map([['2026-10-05', 100], ['2026-10-11', 50], ['2026-10-12', 25]])
    const w = buildSeries(m, '2026-10-05', '2026-10-18', 'week')
    expect(w).toEqual([{ date: '2026-10-05', revenue: 150 }, { date: '2026-10-12', revenue: 25 }])
    expect(buildSeries(m, '2026-10-01', '2026-11-30', 'month')).toEqual([
      { date: '2026-10-01', revenue: 175 },
      { date: '2026-11-01', revenue: 0 },
    ])
  })
  it('helpers', () => {
    expect(bucketFor('2026-01-01', '2026-03-31')).toBe('day')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(toManilaDate('2026-10-30T17:00:00Z')).toBe('2026-10-31') // 01:00 Manila next day
  })
})
