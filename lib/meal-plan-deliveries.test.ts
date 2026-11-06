import { describe, expect, it } from 'vitest'
import { paymentsToCancel, planSync, weekOfDelivery } from './meal-plan-deliveries'

const row = (id: number, d: string) => ({ DeliveryID: id, DeliveryDate: d, SubscriptionWeek: 1 })

describe('planSync', () => {
  it('moves rows to new dates after a pause', () => {
    const p = planSync([row(1, '2026-11-09'), row(2, '2026-11-11')], ['2026-11-16', '2026-11-18'])
    expect(p.moves).toEqual([{ id: 1, date: '2026-11-16' }, { id: 2, date: '2026-11-18' }])
    expect(p.inserts).toEqual([])
    expect(p.dropIds).toEqual([])
  })
  it('adds a row at the end after a skip (one skipped, end moves out)', () => {
    const p = planSync([row(2, '2026-11-11'), row(3, '2026-11-13')], ['2026-11-11', '2026-11-13', '2026-11-16'])
    expect(p.moves).toEqual([])
    expect(p.inserts).toEqual(['2026-11-16'])
  })
  it('drops surplus rows', () => {
    expect(planSync([row(1, '2026-11-09'), row(2, '2026-11-11')], ['2026-11-09']).dropIds).toEqual([2])
  })
})

describe('helpers', () => {
  it('continues the subscription week count', () => {
    expect(weekOfDelivery(0, 3)).toBe(1)
    expect(weekOfDelivery(3, 3)).toBe(2)
  })
  it('cancels only unpaid payments not yet due inside the cutoff', () => {
    const ids = paymentsToCancel(
      [
        { PaymentID: 1, DueDate: '2026-11-07', PaymentStatus: 'pending' },
        { PaymentID: 2, DueDate: '2026-11-14', PaymentStatus: 'pending' },
        { PaymentID: 3, DueDate: '2026-11-21', PaymentStatus: 'paid' },
      ],
      '2026-11-06'
    )
    expect(ids).toEqual([2])
  })
})
