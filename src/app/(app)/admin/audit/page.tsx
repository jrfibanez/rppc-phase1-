import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { PageHeader, Empty, Badge } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { listStaff, nameMap } from '@/lib/data'

export const metadata: Metadata = { title: 'Audit log' }
const TABLES = ['accounts', 'account_finance', 'contacts', 'sites', 'opportunities', 'activities', 'tasks', 'tickets', 'ticket_comments', 'attachments', 'profiles', 'sla_policies']
type SP = { table?: string; row?: string; actor?: string; from?: string; to?: string; page?: string }
const PAGE = 50

function diff(oldD: Record<string, unknown> | null, newD: Record<string, unknown> | null) {
  if (!oldD || !newD) return null
  return Object.keys(newD).filter((k) => k !== 'updated_at' && JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
    .map((k) => ({ k, from: oldD[k], to: newD[k] }))
}
const show = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)).slice(0, 200)

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase } = await requireUser('audit:read')
  const page = Math.max(0, Number(sp.page ?? 0) || 0)
  let q = supabase.from('audit_log').select('id, at, actor, table_name, row_id, action, old_data, new_data').order('at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE)
  if (sp.table === 'csv_import') q = q.like('table_name', 'csv_import:%')
  else if (sp.table && TABLES.includes(sp.table)) q = q.eq('table_name', sp.table)
  if (sp.row) q = q.eq('row_id', sp.row.trim())
  if (sp.actor && /^[0-9a-f-]{36}$/.test(sp.actor)) q = q.eq('actor', sp.actor)
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte('at', `${sp.from}T00:00:00+08:00`)
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte('at', `${sp.to}T23:59:59+08:00`)
  const [{ data, error }, staff] = await Promise.all([q, listStaff(supabase)])
  const names = nameMap(staff)
  const rows = (data ?? []).slice(0, PAGE)
  const more = (data ?? []).length > PAGE
  const qs = (p: number) => new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)), page: String(p) }).toString()
  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change to core records. Read-only for everyone." />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div><label htmlFor="table" className="label">Table</label><select id="table" name="table" defaultValue={sp.table ?? ''} className="input"><option value="">All</option>{TABLES.map((t) => <option key={t}>{t}</option>)}<option value="csv_import">CSV imports</option></select></div>
        <div><label htmlFor="row" className="label">Record ID</label><input id="row" name="row" defaultValue={sp.row} className="input" /></div>
        <div><label htmlFor="actor" className="label">Who</label><select id="actor" name="actor" defaultValue={sp.actor ?? ''} className="input"><option value="">Anyone</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
        <div><label htmlFor="from" className="label">From</label><input id="from" name="from" type="date" defaultValue={sp.from} className="input" /></div>
        <div><label htmlFor="to" className="label">To</label><input id="to" name="to" type="date" defaultValue={sp.to} className="input" /></div>
        <div className="flex items-end gap-2"><button className="btn-primary" type="submit">Filter</button><Link href="/admin/audit" className="btn-ghost">Clear</Link></div>
      </form>
      {error && <p className="text-sm text-red-700">{error.message}</p>}
      {rows.length === 0 ? <Empty>No entries.</Empty> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const d = r.action === 'UPDATE' ? diff(r.old_data, r.new_data) : null
            return (
              <li key={r.id} className="card p-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={r.action === 'INSERT' ? 'green' : r.action === 'UPDATE' ? 'blue' : r.action === 'IMPORT' ? 'violet' : 'red'}>{r.action}</Badge>
                  <strong>{r.table_name}</strong>
                  {r.row_id && <Link className="link font-mono text-xs" href={`/admin/audit?row=${r.row_id}`}>{r.row_id.slice(0, 8)}</Link>}
                  <span className="text-xs text-stone-600">{fmtDateTime(r.at)} · {r.actor ? names.get(r.actor) ?? r.actor.slice(0, 8) : 'system'}</span>
                </p>
                {d && d.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs">{d.map((c) => <li key={c.k} className="break-all"><span className="font-medium">{c.k}</span>: <span className="text-red-800 line-through">{show(c.from)}</span> → <span className="text-green-800">{show(c.to)}</span></li>)}</ul>
                )}
                {r.action !== 'UPDATE' && (
                  <details className="mt-1"><summary className="cursor-pointer text-xs text-stone-600">Data</summary>
                    <pre className="mt-1 max-h-60 overflow-auto rounded bg-stone-50 p-2 text-xs">{JSON.stringify(r.new_data ?? r.old_data, null, 2)}</pre></details>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-4 flex justify-between">
        {page > 0 ? <Link className="btn-secondary" href={`/admin/audit?${qs(page - 1)}`}>Newer</Link> : <span />}
        {more && <Link className="btn-secondary" href={`/admin/audit?${qs(page + 1)}`}>Older</Link>}
      </div>
    </>
  )
}
