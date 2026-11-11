import { NextResponse } from 'next/server'
import { requireUser, Forbidden } from '@/lib/auth/require-role'
import { can, type Action } from '@/lib/auth/permissions'
import { toCsv } from '@/lib/csv'
import { label } from '@/lib/labels'

// Exports run as the signed-in user, so RLS limits rows to what their role can read.
const SPECS: Record<string, { action: Action; table: string; select: string; columns: string[]; order: string }> = {
  accounts: { action: 'account:read', table: 'accounts', order: 'name',
    select: 'code, name, legal_name, segment, status, lead_source, is_accredited, accredited_at, billing_cutoff_day, lock_in_months, created_at, owner:profiles!accounts_owner_id_fkey(full_name)',
    columns: ['code', 'name', 'legal_name', 'segment', 'status', 'lead_source', 'owner', 'is_accredited', 'accredited_at', 'billing_cutoff_day', 'lock_in_months', 'created_at'] },
  contacts: { action: 'account:read', table: 'contacts', order: 'full_name',
    select: 'full_name, job_title, department, email, mobile, is_primary, accounts(code, name)',
    columns: ['account_code', 'account_name', 'full_name', 'job_title', 'department', 'email', 'mobile', 'is_primary'] },
  sites: { action: 'account:read', table: 'sites', order: 'name',
    select: 'name, region, province, city, address, receiving_hours, trucking_zone, lat, lng, accounts(code, name)',
    columns: ['account_code', 'account_name', 'name', 'region', 'province', 'city', 'address', 'receiving_hours', 'trucking_zone', 'lat', 'lng'] },
  opportunities: { action: 'opportunity:read', table: 'opportunities', order: 'created_at',
    select: 'title, stage, est_pallets, pallet_spec, target_region, expected_start, lost_reason, stage_changed_at, created_at, accounts(code, name), owner:profiles!opportunities_owner_id_fkey(full_name)',
    columns: ['account_code', 'account_name', 'title', 'stage', 'owner', 'est_pallets', 'pallet_spec', 'target_region', 'expected_start', 'lost_reason', 'stage_changed_at', 'created_at'] },
  tickets: { action: 'ticket:read', table: 'tickets', order: 'created_at',
    select: 'number, subject, category, priority, status, channel, source_ref, created_at, first_response_due, first_responded_at, resolution_due, resolved_at, sla_breached, resolution_note, accounts(code, name)',
    columns: ['number', 'account_code', 'account_name', 'subject', 'category', 'priority', 'status', 'channel', 'source_ref', 'created_at', 'first_response_due', 'first_responded_at', 'resolution_due', 'resolved_at', 'sla_breached', 'resolution_note'] },
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const entity = url.searchParams.get('entity') ?? ''
    const stamp = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)

    if (entity === 'sap_accounts') {
      const { supabase } = await requireUser('export:sap')
      const { data, error } = await supabase.from('accounts')
        .select('code, name, legal_name, billing_cutoff_day, is_accredited, account_finance(tin, billing_address, billing_email)')
        .is('archived_at', null).order('name').limit(20000)
      if (error) throw new Error(error.message)
      const rows = (data ?? []).map((a) => {
        const f = (Array.isArray(a.account_finance) ? a.account_finance[0] : a.account_finance) as { tin?: string; billing_address?: string; billing_email?: string } | null
        return { code: a.code, name: a.name, legal_name: a.legal_name, tin: f?.tin, billing_address: f?.billing_address, billing_email: f?.billing_email, billing_cutoff_day: a.billing_cutoff_day, is_accredited: a.is_accredited }
      })
      return csv(toCsv(rows, ['code', 'name', 'legal_name', 'tin', 'billing_address', 'billing_email', 'billing_cutoff_day', 'is_accredited']), `rppc-sap-accounts-${stamp}.csv`)
    }

    const spec = SPECS[entity]
    if (!spec) return NextResponse.json({ error: 'unknown export' }, { status: 400 })
    const { supabase, profile } = await requireUser(spec.action)
    if (!can(profile.role, spec.action)) throw new Forbidden()
    let q = supabase.from(spec.table).select(spec.select).order(spec.order).limit(50000)
    if (spec.table !== 'tickets') q = q.is('archived_at', null)
    if (entity === 'accounts') {
      const st = url.searchParams.get('status'), seg = url.searchParams.get('segment')
      if (st) q = q.eq('status', st)
      if (seg) q = q.eq('segment', seg)
      if (url.searchParams.get('owner') === 'me') q = q.eq('owner_id', profile.id)
    }
    const { data, error } = await q
    if (error) throw new Error(error.message)
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => {
      const a = r.accounts as { code: string; name: string } | null
      const o = r.owner as { full_name: string } | null
      const out: Record<string, unknown> = { ...r, account_code: a?.code, account_name: a?.name, owner: o?.full_name }
      for (const k of ['segment', 'status', 'stage', 'category', 'priority', 'channel', 'lead_source']) if (typeof out[k] === 'string') out[k] = label(out[k] as string)
      return out
    })
    return csv(toCsv(rows, spec.columns), `rppc-${entity}-${stamp}.csv`)
  } catch (e) {
    if (e instanceof Forbidden) return NextResponse.json({ error: e.message }, { status: 403 })
    console.error('export failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'export failed' }, { status: 500 })
  }
}

function csv(body: string, filename: string) {
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'private, no-store' },
  })
}
