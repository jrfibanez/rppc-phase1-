import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { PageHeader, Empty, StatusBadge, Badge } from '@/components/ui'
import { fmtCountdown, fmtDateTime } from '@/lib/format'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, label } from '@/lib/labels'
import { listStaff, nameMap } from '@/lib/data'

export const metadata: Metadata = { title: 'Tickets' }
type SP = { status?: string; priority?: string; category?: string; assigned?: string; breached?: string }

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { supabase, user, profile } = await requireUser('ticket:read')
  let q = supabase.from('tickets').select('id, number, subject, status, priority, category, assigned_to, created_at, first_response_due, resolution_due, first_responded_at, sla_breached, accounts(name)')
    .order('resolution_due', { ascending: true }).limit(500)
  if (sp.status === 'all') { /* all */ }
  else if (sp.status && (TICKET_STATUSES as readonly string[]).includes(sp.status)) q = q.eq('status', sp.status)
  else q = q.not('status', 'in', '(resolved,closed)')
  if (sp.priority && (TICKET_PRIORITIES as readonly string[]).includes(sp.priority)) q = q.eq('priority', sp.priority)
  if (sp.category && (TICKET_CATEGORIES as readonly string[]).includes(sp.category)) q = q.eq('category', sp.category)
  if (sp.assigned === 'me') q = q.eq('assigned_to', user.id)
  else if (sp.assigned === 'none') q = q.is('assigned_to', null)
  if (sp.breached === '1') q = q.eq('sla_breached', true)
  const [{ data }, staff] = await Promise.all([q, listStaff(supabase)])
  const names = nameMap(staff)
  const now = Date.now()
  const rows = data ?? []
  return (
    <>
      <PageHeader title="Tickets" subtitle={`${rows.length} shown · sorted by resolution deadline`}
        actions={<>
          <a href="/api/export?entity=tickets" className="btn-secondary">Export CSV</a>
          {can(profile.role, 'ticket:create') && <Link href="/tickets/new" className="btn-primary">New ticket</Link>}
        </>} />
      <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Sel name="status" label="Status" value={sp.status} options={[['', 'Open'], ['all', 'All'], ...TICKET_STATUSES.map((s) => [s, label(s)] as [string, string])]} />
        <Sel name="priority" label="Priority" value={sp.priority} options={[['', 'All'], ...TICKET_PRIORITIES.map((s) => [s, label(s)] as [string, string])]} />
        <Sel name="category" label="Category" value={sp.category} options={[['', 'All'], ...TICKET_CATEGORIES.map((s) => [s, label(s)] as [string, string])]} />
        <Sel name="assigned" label="Assigned" value={sp.assigned} options={[['', 'Anyone'], ['me', 'Me'], ['none', 'Unassigned']]} />
        <Sel name="breached" label="SLA" value={sp.breached} options={[['', 'All'], ['1', 'Breached only']]} />
        <div className="flex items-end gap-2"><button className="btn-primary" type="submit">Apply</button><Link className="btn-ghost" href="/tickets">Clear</Link></div>
      </form>
      {rows.length === 0 ? <Empty>No tickets match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Ticket</th><th>Priority</th><th>Status</th><th>SLA</th><th>Assignee</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const open = !['resolved', 'closed'].includes(t.status)
                const frOverdue = open && !t.first_responded_at && t.first_response_due && new Date(t.first_response_due).getTime() < now
                const resOverdue = open && t.resolution_due && new Date(t.resolution_due).getTime() < now
                const breached = t.sla_breached || frOverdue || resOverdue
                return (
                  <tr key={t.id} className={breached ? 'bg-red-50' : ''}>
                    <td className={breached ? 'border-l-4 border-l-red-600' : ''}>
                      <Link href={`/tickets/${t.id}`} className="font-medium hover:underline">{t.number}</Link>
                      <p className="text-stone-800">{t.subject}</p>
                      <p className="text-xs text-stone-600">{(t.accounts as unknown as { name: string } | null)?.name} · {label(t.category)} · {fmtDateTime(t.created_at)}</p>
                    </td>
                    <td><StatusBadge value={t.priority} /></td>
                    <td><StatusBadge value={t.status} /></td>
                    <td className="text-xs whitespace-nowrap">
                      {breached && <Badge tone="red">Breached</Badge>}
                      {open ? (<>
                        {!t.first_responded_at && <p className={frOverdue ? 'font-semibold text-red-700' : ''}>1st reply {fmtCountdown(t.first_response_due, now)}</p>}
                        <p className={resOverdue ? 'font-semibold text-red-700' : ''}>Resolve {fmtCountdown(t.resolution_due, now)}</p>
                      </>) : <p>Done</p>}
                    </td>
                    <td>{t.assigned_to ? names.get(t.assigned_to) ?? '—' : <span className="text-stone-600">Unassigned</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function Sel({ name, label: l, value, options }: { name: string; label: string; value?: string; options: [string, string][] }) {
  return (
    <div><label htmlFor={name} className="label">{l}</label>
      <select id={name} name={name} defaultValue={value ?? ''} className="input">{options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
  )
}
