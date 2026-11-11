import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { can, type Action, type Role } from './permissions'

export class Forbidden extends Error {
  constructor(m = 'You do not have permission to do that.') { super(m) }
}

export type Profile = { id: string; full_name: string; role: Role; is_active: boolean; must_change_password: boolean }

/** Session + profile for the current request (deduplicated per render). */
export const getSession = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, profile: null }
  const { data: profile } = await supabase
    .from('profiles').select('id, full_name, role, is_active, must_change_password').eq('id', user.id).maybeSingle()
  return { supabase, user, profile: (profile as Profile | null) ?? null }
})

export async function requireUser(action?: Action) {
  const { supabase, user, profile } = await getSession()
  if (!user) throw new Forbidden('Not signed in')
  if (!profile?.is_active) throw new Forbidden('Account disabled')
  if (profile.must_change_password) throw new Forbidden('Password change required')
  if (action && !can(profile.role, action)) throw new Forbidden()
  return { supabase, user, profile }
}
