import { describe, expect, it } from 'vitest'
import {
  autoMoveUnavailable,
  findBetterStart,
  nextDateAfterPlanEnd,
  suggestDates,
  tooManyUnavailable,
  weekForDate,
} from './delivery-reschedule'
import { generateDeliveryDates } from './meal-plan'

// 2026-12-07 is a Monday.
const full = new Set(['2026-12-09', '2026-12-14'])
const open = (date: string) => !full.has(date)

describe('suggestDates', () => {
  it('offers open dates near the original, chosen delivery days first', () => {
    const picks = suggestDates({
      original: '2026-12-09',
      planStart: '2026-12-07',
      taken: ['2026-12-07', '2026-12-09'],
      preferredDays: [1, 3],
      isAvailable: open,
    })
    expect(picks.length).toBe(3)
    expect(picks[0].onPreferredDay).toBe(true)
    expect(picks.map((p) => p.date)).not.toContain('2026-12-09')
    expect(picks.map((p) => p.date)).not.toContain('2026-12-07')
  })

  it('never goes before the plan start', () => {
    const picks = suggestDates({
      original: '2026-12-07',
      planStart: '2026-12-07',
      taken: [],
      preferredDays: [1],
      isAvailable: () => true,
    })
    expect(picks.every((p) => p.date >= '2026-12-07')).toBe(true)
  })
})

describe('autoMoveUnavailable', () => {
  it('moves each blocked delivery once and never doubles up a date', () => {
    const deliveries = [
      { index: 0, date: '2026-12-07' },
      { index: 1, date: '2026-12-09' },
      { index: 2, date: '2026-12-14' },
    ]
    const { moves, stuck } = autoMoveUnavailable({
      deliveries,
      planStart: '2026-12-07',
      preferredDays: [1, 3],
      isAvailable: open,
    })
    expect(stuck).toEqual([])
    expect(Object.keys(moves).sort()).toEqual(['1', '2'])
    const final = [deliveries[0].date, moves[1], moves[2]]
    expect(new Set(final).size).toBe(3)
    expect(final.every(open)).toBe(true)
  })

  it('reports deliveries that cannot be moved', () => {
    const { moves, stuck } = autoMoveUnavailable({
      deliveries: [{ index: 0, date: '2026-12-09' }],
      planStart: '2026-12-07',
      preferredDays: [3],
      isAvailable: () => false,
    })
    expect(moves).toEqual({})
    expect(stuck).toEqual([0])
  })
})

describe('nextDateAfterPlanEnd', () => {
  it('finds the next open chosen day after the last delivery', () => {
    expect(
      nextDateAfterPlanEnd({
        lastDate: '2026-12-30',
        taken: [],
        preferredDays: [1],
        isAvailable: () => true,
      })
    ).toBe('2027-01-04')
  })
})

describe('findBetterStart', () => {
  const generate = (start: string) => generateDeliveryDates(start, [1, 3], 2)

  it('returns a later start that has fewer blocked dates', () => {
    const blockedWeek = (date: string) => date < '2026-12-14' ? false : true
    const better = findBetterStart({
      currentStart: '2026-12-07',
      generate,
      isAvailable: (d) => !(d >= '2026-12-07' && d <= '2026-12-13') || blockedWeek(d),
    })
    expect(better).not.toBeNull()
    expect(better!.blocked).toBe(0)
  })

  it('returns null when nothing is blocked', () => {
    expect(
      findBetterStart({ currentStart: '2026-12-07', generate, isAvailable: () => true })
    ).toBeNull()
  })
})

describe('helpers', () => {
  it('assigns plan weeks from the start date', () => {
    expect(weekForDate('2026-12-07', '2026-12-07', 4)).toBe(1)
    expect(weekForDate('2026-12-07', '2026-12-14', 4)).toBe(2)
    expect(weekForDate('2026-12-07', '2027-02-01', 4)).toBe(4)
  })

  it('flags plans with many blocked dates', () => {
    expect(tooManyUnavailable(2, 8)).toBe(false)
    expect(tooManyUnavailable(3, 20)).toBe(false)
    expect(tooManyUnavailable(5, 20)).toBe(true)
  })
})
