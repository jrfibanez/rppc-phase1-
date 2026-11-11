import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ProfileLite = { id: string; full_name: string; role: string; is_active: boolean }

/** Active staff for owner/assignee pickers. */
export async function listStaff(supabase: SupabaseClient, roles?: string[]) {
  let q = supabase.from('profiles').select('id, full_name, role, is_active').eq('is_active', true).order('full_name')
  if (roles) q = q.in('role', roles)
  const { data } = await q
  return (data ?? []) as ProfileLite[]
}

export function nameMap(staff: { id: string; full_name: string }[]) {
  return new Map(staff.map((s) => [s.id, s.full_name]))
}

export const SALES_ROLES = ['owner', 'admin', 'sales_manager', 'sales_rep']
export const TICKET_ROLES = ['owner', 'admin', 'sales_manager', 'sales_rep', 'csr', 'ops_manager', 'deployment_officer', 'finance', 'billing']
