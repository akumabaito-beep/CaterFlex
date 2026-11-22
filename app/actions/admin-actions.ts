'use server'

import { getSupabaseServer } from '@/lib/auth-server'
import { createAdminClient } from '@/lib/supabase-admin'
import { logSystemError } from '@/lib/system-log'

const PAGE_SIZE = 25

type LogFilters = {
  type?: string
  from?: string
  to?: string
  search?: string
  page?: number
}

async function getAdminContext() {
  const session = await requireAdmin()
  const admin = createAdminClient()
  const email = session.user.email
  const { data } = email
    ? await admin.from('ADMIN').select('AdminID').eq('Email', email).maybeSingle()
    : { data: null }
  return { admin, adminId: data?.AdminID ?? null, email }
}

export async function requireAdmin() {
  const supabase = await getSupabaseServer()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user?.app_metadata?.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  return session
}

export async function getSystemLogs(filters: LogFilters = {}) {
  const { admin } = await getAdminContext()
  const page = Math.max(1, filters.page ?? 1)
  let query = admin
    .from('SYSTEM_LOG')
    .select('LogID, AdminID, LogType, Message, Timestamp', { count: 'exact' })
    .order('Timestamp', { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (filters.type) query = query.eq('LogType', filters.type)
  if (filters.from) query = query.gte('Timestamp', filters.from)
  if (filters.to) query = query.lte('Timestamp', `${filters.to}T23:59:59`)
  if (filters.search) query = query.ilike('Message', `%${filters.search}%`)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const adminIds = [...new Set((data ?? []).map((log) => log.AdminID).filter(Boolean))]
  const { data: admins } = adminIds.length
    ? await admin.from('ADMIN').select('AdminID, Username, Email').in('AdminID', adminIds)
    : { data: [] }
  const adminMap = new Map((admins ?? []).map((item) => [item.AdminID, item]))

  return {
    logs: (data ?? []).map((log) => ({
      ...log,
      admin: log.AdminID ? adminMap.get(log.AdminID) ?? null : null,
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

export async function getSystemHealth() {
  const { admin } = await getAdminContext()
  const { error } = await admin.from('SYSTEM_LOG').select('LogID', { count: 'exact', head: true })
  return {
    database: error ? 'disconnected' : 'connected',
  }
}

// Backups are managed by Supabase. The admin does not export or restore business data (FR-12.6).

export type SystemLog = Awaited<ReturnType<typeof getSystemLogs>>['logs'][number]
export type SystemHealth = Awaited<ReturnType<typeof getSystemHealth>>

