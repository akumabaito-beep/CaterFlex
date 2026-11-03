'use server'

import { requireRole } from '@/app/actions/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import {
  buildSeries,
  inRange,
  manilaToday,
  resolveRange,
  toManilaDate,
  type RangeInput,
} from '@/lib/date-range'

type DashboardAlert = {
  id: string
  message: string
  severity: 'error' | 'warning' | 'info'
  timestamp: string
}

type DashboardActivity = {
  id: string
  customerName: string
  status: string
  createdAt: string
}

type RevenuePoint = {
  date: string
  revenue: number
}

export async function getOwnerDashboardData(rangeInput: RangeInput = { preset: '30d' }) {
  const owner = await requireRole('owner')

  if (!owner) {
    return {
      ok: false as const,
      error: 'Owner access required.',
    }
  }

  const admin = createAdminClient()

  try {
    // --------------------------------------------------
    // BOOKINGS
    // --------------------------------------------------
    const { data: bookingRows, error: bookingError } = await admin
      .from('BOOKING')
      .select(
        'BookingID, CustomerID, OperatorID, EventDate, EventTime, Venue, GuestCount, Status, CreatedAt'
      )
      .eq('OperatorID', 2)
      .order('EventDate', { ascending: false })

    if (bookingError) {
      throw bookingError
    }

    const allBookings = bookingRows ?? []

    // --------------------------------------------------
    // CUSTOMERS
    // --------------------------------------------------
    const customerIds = [
      ...new Set(
        allBookings.map((booking) => Number(booking.CustomerID))
      ),
    ]

    let customerRows: Array<{
      CustomerID: number
      Name: string
      Email: string
    }> = []

    if (customerIds.length > 0) {
      const { data, error: customerError } = await admin
        .from('CUSTOMER')
        .select('CustomerID, Name, Email')
        .in('CustomerID', customerIds)

      if (customerError) {
        throw customerError
      }

      customerRows = data ?? []
    }

    const customerMap = new Map(
      customerRows.map((customer) => [
        Number(customer.CustomerID),
        customer,
      ])
    )

    // --------------------------------------------------
    // INGREDIENTS / LOW STOCK
    // --------------------------------------------------
    const { data: ingredientRows, error: ingredientError } =
      await admin
        .from('INGREDIENT')
        .select(
          'IngredientID, IngredientName, CurrentStock, MaxStorageCapacity'
        )

    if (ingredientError) {
      throw ingredientError
    }

    const ingredients = ingredientRows ?? []

    const lowStockIngredients = ingredients.filter((ingredient) => {
      const currentStock = Number(ingredient.CurrentStock ?? 0)
      const maxCapacity = Number(
        ingredient.MaxStorageCapacity ?? 0
      )

      if (maxCapacity <= 0) {
        return false
      }

      return (currentStock / maxCapacity) * 100 < 30
    })

    // --------------------------------------------------
    // INVOICES
    // --------------------------------------------------
    const { data: invoiceRows, error: invoiceError } =
      await admin
        .from('INVOICE')
        .select(
          'InvoiceID, BookingID, TotalAmount, DateGenerated'
        )

    if (invoiceError) {
      throw invoiceError
    }

    const invoices = invoiceRows ?? []

    // --------------------------------------------------
    // PAYMENTS
    // --------------------------------------------------
    const { data: paymentRows, error: paymentError } =
      await admin
        .from('PAYMENT')
        .select(
          'PaymentID, InvoiceID, Amount, PaymentType, Status, DatePaid'
        )
        .order('DatePaid', { ascending: false })

    if (paymentError) {
      throw paymentError
    }

    const payments = paymentRows ?? []

    // --------------------------------------------------
    // DATE RANGE (Asia/Manila)
    // --------------------------------------------------
    const paidPayments = payments.filter(
      (payment) => String(payment.Status).toLowerCase() === 'paid'
    )
    const dataDates = [
      ...allBookings.map((b) => String(b.EventDate ?? '').slice(0, 10)),
      ...paidPayments.map((p) => toManilaDate(String(p.DatePaid))),
    ].filter(Boolean)
    const earliest = dataDates.length > 0 ? dataDates.reduce((a, b) => (a < b ? a : b)) : null

    const resolved = resolveRange(rangeInput, manilaToday(), earliest)
    if ('error' in resolved) {
      return { ok: false as const, error: resolved.error }
    }

    // Bookings and revenue follow the selected range.
    // Outstanding balance, low stock and recent activity stay current.
    const bookings = allBookings.filter((booking) =>
      inRange(String(booking.EventDate ?? '').slice(0, 10), resolved.from, resolved.to)
    )

    // --------------------------------------------------
    // PAYMENT TOTALS PER INVOICE
    // --------------------------------------------------
    const paymentsByInvoice = new Map<number, number>()

    for (const payment of payments) {
      if (String(payment.Status).toLowerCase() !== 'paid') {
        continue
      }

      const invoiceId = Number(payment.InvoiceID)
      const amount = Number(payment.Amount ?? 0)

      paymentsByInvoice.set(
        invoiceId,
        (paymentsByInvoice.get(invoiceId) ?? 0) + amount
      )
    }

    // --------------------------------------------------
    // OUTSTANDING BALANCE
    // --------------------------------------------------
    const outstandingBalance = invoices.reduce(
      (sum, invoice) => {
        const totalAmount = Number(invoice.TotalAmount ?? 0)

        const paidAmount =
          paymentsByInvoice.get(Number(invoice.InvoiceID)) ?? 0

        return sum + Math.max(totalAmount - paidAmount, 0)
      },
      0
    )

    // --------------------------------------------------
    // TOTAL REVENUE
    // --------------------------------------------------
    const totalRevenue = paidPayments.reduce((sum, payment) => {
      const paidOn = toManilaDate(String(payment.DatePaid))
      return inRange(paidOn, resolved.from, resolved.to)
        ? sum + Number(payment.Amount ?? 0)
        : sum
    }, 0)

    // --------------------------------------------------
    // BOOKING COUNTS
    // --------------------------------------------------
    const pendingBookings = bookings.filter(
      (booking) =>
        String(booking.Status).toLowerCase() === 'pending'
    ).length

    const confirmedBookings = bookings.filter(
      (booking) =>
        String(booking.Status).toLowerCase() === 'confirmed'
    ).length

    const completedBookings = bookings.filter(
      (booking) =>
        String(booking.Status).toLowerCase() === 'completed'
    ).length

    const completionRate =
      bookings.length > 0
        ? Math.round(
            (completedBookings / bookings.length) * 100
          )
        : 0

    // --------------------------------------------------
    // RECENT ACTIVITY
    // --------------------------------------------------

    const recentActivity: DashboardActivity[] = [...allBookings]
    .sort((a, b) => {
    const dateA = new Date(
        String(a.CreatedAt)
    ).getTime()

    const dateB = new Date(
        String(b.CreatedAt)
    ).getTime()

    return dateB - dateA
    })
    .slice(0, 5)
    .map((booking) => ({
    id: String(booking.BookingID),
    customerName:
        customerMap.get(Number(booking.CustomerID))?.Name ??
        'Unknown customer',
    status: String(booking.Status).toLowerCase(),
    createdAt: String(booking.CreatedAt),
    }))

    // --------------------------------------------------
    // LIVE ALERTS
    // --------------------------------------------------
    const alerts: DashboardAlert[] = lowStockIngredients
      .slice(0, 5)
      .map((ingredient) => ({
        id: `low-stock-${ingredient.IngredientID}`,
        message: `${ingredient.IngredientName} is below 30% of its maximum stock capacity.`,
        severity: 'warning' as const,
        timestamp: new Date().toISOString(),
      }))

    // --------------------------------------------------
    // REVENUE BY DAY

// --------------------------------------------------

const revenueMap = new Map<string, number>()

for (const payment of paidPayments) {
  const date = toManilaDate(String(payment.DatePaid))

  revenueMap.set(
    date,
    (revenueMap.get(date) ?? 0) + Number(payment.Amount ?? 0)
  )
}

const revenueData: RevenuePoint[] = buildSeries(
  revenueMap,
  resolved.from,
  resolved.to,
  resolved.bucket
)

return {
  ok: true as const,
  data: {
    pendingBookings,
    confirmedBookings,
    lowStockItems: lowStockIngredients.length,
    outstandingBalance,
    totalBookings: bookings.length,
    completionRate,
    totalRevenue,
    recentActivity,
    alerts,
    revenueData,
    range: resolved,
  },
}
  } catch (error) {
    console.error('Owner dashboard loading error:', error)

    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load dashboard data.',
    }
  }
}