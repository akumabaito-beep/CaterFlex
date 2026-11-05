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

import {
  deliveryDates,
  planEndDate,
  totalDeliveries,
  deliveryDaysLabel,
  scheduleDates,
  rescheduleAfterPause,
  cancellationRefund,
  nextDeliveryAfter,
  parseDeliveryDays,
} from './meal-plan'

describe('subscription by length and days', () => {
  const weekdays = [1, 2, 3, 4, 5]
  it('counts weeks x days', () => {
    expect(totalDeliveries(2, weekdays)).toBe(10)
    expect(totalDeliveries(1, [1, 3, 5])).toBe(3)
  })
  it('skips unchosen days and starts on the first chosen day', () => {
    // 2026-11-07 is a Saturday -> first delivery Monday the 9th
    expect(deliveryDates('2026-11-07', 3, weekdays)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11'])
  })
  it('ends a 1 week Mon-Fri plan on the Friday', () => {
    expect(planEndDate('2026-11-09', 1, weekdays)).toBe('2026-11-13')
    expect(planEndDate('2026-11-09', 2, weekdays)).toBe('2026-11-20')
  })
  it('labels days', () => {
    expect(deliveryDaysLabel(weekdays)).toBe('Mon to Fri')
    expect(deliveryDaysLabel([1, 3, 5])).toBe('Mon, Wed, Fri')
  })
  it('parses day lists safely', () => {
    expect(parseDeliveryDays('5,1,1,9,x')).toEqual([1, 5])
  })
  it('skip moves to the next chosen day', () => {
    expect(nextDeliveryAfter('2026-11-13', weekdays)).toBe('2026-11-16')
  })
  it('lists the remaining deliveries', () => {
    expect(scheduleDates('2026-11-11', '2026-11-13', weekdays)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13'])
  })
  it('pause keeps every delivery and pushes the end date out', () => {
    const r = rescheduleAfterPause({ nextDate: '2026-11-11', termEnd: '2026-11-13', days: weekdays }, '2026-11-18')
    expect(r).toEqual({ nextDate: '2026-11-18', termEnd: '2026-11-20' })
  })
  it('refunds only deliveries beyond the 2-day cutoff', () => {
    const r = cancellationRefund({
      nextDate: '2026-11-09', termEnd: '2026-11-13', days: weekdays, today: '2026-11-09',
      pricePerServing: 100, servings: 2, deliveryFee: 50,
    })
    // 9th, 10th are inside the cutoff (before the 11th) -> committed; 11, 12, 13 refunded
    expect(r.committedDeliveries).toBe(2)
    expect(r.refundedDeliveries).toBe(3)
    expect(r.refund).toBe(750)
  })
})

import { parseDeliveryDays as _parseDays } from './meal-plan'
describe('parseDeliveryDays', () => {
  it('treats empty or missing values as "no chosen days" (not Sunday)', () => {
    expect(_parseDays(null)).toEqual([])
    expect(_parseDays('')).toEqual([])
    expect(_parseDays(undefined)).toEqual([])
    expect(_parseDays('1,3,5')).toEqual([1, 3, 5])
  })
})
