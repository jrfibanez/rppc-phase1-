import { NextResponse } from 'next/server'
import { requireUser, Forbidden } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'

// Read-only snapshot for offline forms. Runs as the user, so RLS limits it to what their role can read.
export async function GET() {
  try {
    const { supabase, profile } = await requireUser('account:read')
    const [a, c, s, o] = await Promise.all([
      supabase.from('accounts').select('id, code, name').is('archived_at', null).order('name').limit(10000),
      supabase.from('contacts').select('id, account_id, full_name').is('archived_at', null).limit(20000),
      supabase.from('sites').select('id, account_id, name').is('archived_at', null).limit(20000),
      can(profile.role, 'opportunity:read')
        ? supabase.from('opportunities').select('id, account_id, title').is('archived_at', null).not('stage', 'in', '(lost,active)').limit(10000)
        : Promise.resolve({ data: [] }),
    ])
    return NextResponse.json(
      { accounts: a.data ?? [], contacts: c.data ?? [], sites: s.data ?? [], opportunities: o.data ?? [] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (e) {
    return NextResponse.json({ error: e instanceof Forbidden ? e.message : 'error' }, { status: e instanceof Forbidden ? 403 : 500 })
  }
}
