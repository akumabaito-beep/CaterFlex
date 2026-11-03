import { describe, it, expect } from 'vitest'
import {
  termEndDate,
  remainingDeliveries,
  planState,
  planTitle,
  cycleTotal,
  nextAlignedDate,
  isTermCycles,
  isMealType,
} from './meal-plan'

describe('meal plan schedule', () => {
  it('ends a weekly 4-delivery term 3 weeks after the start', () => {
    expect(termEndDate('2026-11-05', 'weekly', 4)).toBe('2026-11-26')
  })
  it('ends a bi-weekly 4-delivery term 6 weeks after the start', () => {
    expect(termEndDate('2026-11-05', 'biweekly', 4)).toBe('2026-12-17')
  })
  it('lists remaining deliveries inclusively', () => {
    expect(remainingDeliveries('2026-11-12', '2026-11-26', 'weekly')).toEqual(['2026-11-12', '2026-11-19', '2026-11-26'])
    expect(remainingDeliveries('2026-12-01', '2026-11-26', 'weekly')).toEqual([])
  })
  it('aligns to the schedule', () => {
    expect(nextAlignedDate('2026-11-05', '2026-11-10', 'weekly')).toBe('2026-11-12')
    expect(nextAlignedDate('2026-11-05', '2026-11-05', 'weekly')).toBe('2026-11-05')
  })
})

describe('plan state', () => {
  it('marks a plan ended once its last delivery is past', () => {
    expect(planState('active', '2026-11-26', '2026-11-27')).toBe('ended')
    expect(planState('active', '2026-11-26', '2026-11-26')).toBe('active')
    expect(planState('paused', '2026-12-31', '2026-11-27')).toBe('paused')
    expect(planState('cancelled', '2026-01-01', '2026-11-27')).toBe('cancelled')
    expect(planState('pending', null, '2026-11-27')).toBe('pending')
  })
})

describe('helpers', () => {
  it('titles', () => {
    expect(planTitle('dinner')).toBe('Dinner meal plan')
    expect(planTitle(null)).toBe('Meal plan')
  })
  it('totals', () => {
    expect(cycleTotal(250, 5, 75)).toBe(1325)
  })
  it('validators', () => {
    expect(isTermCycles(8)).toBe(true)
    expect(isTermCycles(5)).toBe(false)
    expect(isMealType('lunch')).toBe(true)
    expect(isMealType('snack')).toBe(false)
  })
})
