import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { PageHeader, Empty, StatusBadge, Badge } from '@/components/ui'
import { ACCOUNT_STATUSES, REGIONS, SEGMENTS, label } from '@/lib/labels'
import { listStaff, nameMap, SALES_ROLES } from '@/lib/data'

export const metadata: Metadata = { title: 'Accounts' }

type SP = { q?: string; status?: string; segment?: string; owner?: string; region?: string; archived?: string }

export default async function AccountsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, user, profile } = await requireUser('account:read')
  const staff = await listStaff(supabase, SALES_ROLES)
  const names = nameMap(staff)
  const archived = sp.archived === '1' && can(profile.role, 'account:archive')

  let regionIds: string[] | null = null
  if (sp.region && (REGIONS as readonly string[]).includes(sp.region)) {
    const { data } = await supabase.from('sites').select('account_id').eq('region', sp.region).is('archived_at', null).limit(10000)
    regionIds = [...new Set((data ?? []).map((s) => s.account_id))]
  }

  const q = sp.q?.trim().slice(0, 100)
  let query = q && !archived
    ? supabase.rpc('search_accounts', { q, max_rows: 200 }).select('id, code, name, segment, status, owner_id, is_accredited')
    : supabase.from('accounts').select('id, code, name, segment, status, owner_id, is_accredited').order('name').limit(500)
  query = archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  if (sp.status && (ACCOUNT_STATUSES as readonly string[]).includes(sp.status)) query = query.eq('status', sp.status)
  if (sp.segment && (SEGMENTS as readonly string[]).includes(sp.segment)) query = query.eq('segment', sp.segment)
  if (sp.owner === 'me') query = query.eq('owner_id', user.id)
  else if (sp.owner && /^[0-9a-f-]{36}$/.test(sp.owner)) query = query.eq('owner_id', sp.owner)
  if (regionIds) query = query.in('id', regionIds.length ? regionIds : ['00000000-0000-0000-0000-000000000000'])
  const { data, error } = await query
  const rows = (data ?? []) as { id: string; code: string; name: string; segment: string; status: string; owner_id: string | null; is_accredited: boolean }[]

  const exportQs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString()
  return (
    <>
      <PageHeader title="Accounts" subtitle={`${rows.length} ${archived ? 'archived ' : ''}account${rows.length === 1 ? '' : 's'}`}
        actions={<>
          <a href={`/api/export?entity=accounts&${exportQs}`} className="btn-secondary">Export CSV</a>
          {can(profile.role, 'export:sap') && <a href="/api/export?entity=sap_accounts" className="btn-secondary">SAP-ready export</a>}
          {can(profile.role, 'account:create') && <Link href="/accounts/new" className="btn-primary">New account</Link>}
        </>} />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6" role="search">
        <div className="lg:col-span-2">
          <label htmlFor="q" className="label">Search</label>
          <input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Name or CUS-code" className="input" />
        </div>
        <Filter name="status" label="Status" value={sp.status} options={ACCOUNT_STATUSES} />
        <Filter name="segment" label="Segment" value={sp.segment} options={SEGMENTS} />
        <Filter name="region" label="Region (site)" value={sp.region} options={REGIONS} />
        <div>
          <label htmlFor="owner" className="label">Owner</label>
          <select id="owner" name="owner" defaultValue={sp.owner ?? ''} className="input">
            <option value="">Anyone</option><option value="me">Me</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
          <button className="btn-primary" type="submit">Apply</button>
          <Link href="/accounts" className="btn-ghost">Clear</Link>
          {can(profile.role, 'account:archive') && (
            <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" name="archived" value="1" defaultChecked={archived} className="size-4" /> Show archived</label>
          )}
        </div>
      </form>
      {error && <p className="mb-4 text-sm text-red-700">{error.message}</p>}
      {rows.length === 0 ? <Empty>No accounts match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Account</th><th>Segment</th><th>Status</th><th>Owner</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="hover:bg-stone-50">
                  <td>
                    <Link href={`/accounts/${a.id}`} className="font-medium text-stone-900 hover:underline">{a.name}</Link>
                    <div className="text-xs text-stone-600">{a.code} {a.is_accredited && <Badge tone="green">Accredited</Badge>}</div>
                  </td>
                  <td>{label(a.segment)}</td>
                  <td><StatusBadge value={a.status} /></td>
                  <td>{a.owner_id ? names.get(a.owner_id) ?? '—' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Filter({ name, label: l, value, options }: { name: string; label: string; value?: string; options: readonly string[] }) {
  return (
    <div>
      <label htmlFor={name} className="label">{l}</label>
      <select id={name} name={name} defaultValue={value ?? ''} className="input">
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{label(o)}</option>)}
      </select>
    </div>
  )
}
