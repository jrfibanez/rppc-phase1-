import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can, hasCrmAccess } from '@/lib/auth/permissions'
import { PageHeader, Section, Empty, StatusBadge, Badge } from '@/components/ui'
import { fmtCountdown, fmtDateTime } from '@/lib/format'
import { label, OPP_STAGES } from '@/lib/labels'
import { listStaff, nameMap } from '@/lib/data'
import { TaskCheck } from './tasks/task-check'

export default async function Dashboard() {
  const { supabase, user, profile } = await requireUser()
  const first = profile.full_name.split(' ')[0]

  if (!hasCrmAccess(profile.role)) {
    return (
      <>
        <PageHeader title={`Hello, ${first}`} />
        <Empty>Your role ({label(profile.role)}) has no CRM screens in Phase 1. Your modules arrive in later phases.</Empty>
      </>
    )
  }

  const nowIso = new Date().toISOString()
  const soonIso = new Date(Date.now() + 4 * 3_600_000).toISOString()
  const team = can(profile.role, 'dashboard:team')
  const [tasks, myTickets, atRisk, opps, recent, overdueTeam, staff] = await Promise.all([
    supabase.from('tasks').select('id, title, due_at, status, account_id, accounts(name)').eq('assigned_to', user.id).eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false }).limit(10),
    supabase.from('tickets').select('id, number, subject, status, priority, resolution_due, sla_breached, accounts(name)')
      .eq('assigned_to', user.id).not('status', 'in', '(resolved,closed)').order('resolution_due').limit(10),
    supabase.from('tickets').select('id, number, subject, priority, status, resolution_due, first_response_due, first_responded_at, sla_breached, accounts(name)')
      .not('status', 'in', '(resolved,closed)').or(`sla_breached.eq.true,resolution_due.lt.${soonIso},and(first_responded_at.is.null,first_response_due.lt.${soonIso})`)
      .order('resolution_due').limit(15),
    can(profile.role, 'opportunity:read')
      ? supabase.from('opportunities').select('stage, est_pallets').eq('owner_id', user.id).is('archived_at', null)
      : Promise.resolve({ data: [] as { stage: string; est_pallets: number | null }[] }),
    supabase.from('activities').select('id, type, summary, occurred_at, created_by, account_id, accounts(name)').order('occurred_at', { ascending: false }).limit(8),
    team ? supabase.from('tasks').select('assigned_to').eq('status', 'open').lt('due_at', nowIso).limit(1000) : Promise.resolve({ data: [] as { assigned_to: string }[] }),
    listStaff(supabase),
  ])
  const names = nameMap(staff)

  const byStage = new Map<string, { n: number; pallets: number }>()
  for (const o of opps.data ?? []) {
    const s = byStage.get(o.stage) ?? { n: 0, pallets: 0 }
    s.n++; s.pallets += o.est_pallets ?? 0; byStage.set(o.stage, s)
  }
  const overdueByRep = new Map<string, number>()
  for (const t of overdueTeam.data ?? []) overdueByRep.set(t.assigned_to, (overdueByRep.get(t.assigned_to) ?? 0) + 1)

  const acct = (r: { accounts?: unknown }) => (r.accounts as { name: string } | null)?.name ?? ''

  return (
    <>
      <PageHeader title={`Hello, ${first}`} subtitle="Here's what needs you today."
        actions={<>
          {can(profile.role, 'activity:create') && <Link href="/activities" className="btn-primary">Log activity</Link>}
          {can(profile.role, 'ticket:create') && <Link href="/tickets/new" className="btn-secondary">New ticket</Link>}
        </>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="My open tasks" actions={<Link href="/tasks" className="link text-sm">All tasks</Link>}>
          {(tasks.data ?? []).length === 0 ? <Empty>No open tasks.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {tasks.data!.map((t) => {
                const overdue = t.due_at && t.due_at < nowIso
                return (
                  <li key={t.id} className="flex items-start gap-3 py-2">
                    <TaskCheck id={t.id} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className={`text-xs ${overdue ? 'font-semibold text-red-700' : 'text-stone-600'}`}>
                        {t.due_at ? `Due ${fmtDateTime(t.due_at)}${overdue ? ' (overdue)' : ''}` : 'No due date'}
                        {acct(t) && <> · <Link className="link" href={`/accounts/${t.account_id}`}>{acct(t)}</Link></>}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        <Section title="Tickets assigned to me" actions={<Link href="/tickets?assigned=me" className="link text-sm">Queue</Link>}>
          {(myTickets.data ?? []).length === 0 ? <Empty>No tickets assigned to you.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {myTickets.data!.map((t) => (
                <li key={t.id} className="py-2">
                  <Link href={`/tickets/${t.id}`} className="text-sm font-medium hover:underline">{t.number} · {t.subject}</Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                    <StatusBadge value={t.priority} /> <StatusBadge value={t.status} /> {acct(t)}
                    <span className={t.sla_breached || (t.resolution_due && t.resolution_due < nowIso) ? 'font-semibold text-red-700' : ''}>Resolve {fmtCountdown(t.resolution_due)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="SLA at risk or breached">
          {(atRisk.data ?? []).length === 0 ? <Empty>Nothing at risk in the next 4 hours.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {atRisk.data!.map((t) => {
                const breached = t.sla_breached || (t.resolution_due && t.resolution_due < nowIso) || (!t.first_responded_at && t.first_response_due && t.first_response_due < nowIso)
                return (
                  <li key={t.id} className={`py-2 ${breached ? 'border-l-4 border-red-600 pl-2' : 'border-l-4 border-amber-400 pl-2'}`}>
                    <Link href={`/tickets/${t.id}`} className="text-sm font-medium hover:underline">{t.number} · {t.subject}</Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-stone-600">
                      {breached ? <Badge tone="red">Breached</Badge> : <Badge tone="amber">At risk</Badge>}
                      <StatusBadge value={t.priority} /> {acct(t)}
                      <span>{!t.first_responded_at ? `First response ${fmtCountdown(t.first_response_due)}` : `Resolve ${fmtCountdown(t.resolution_due)}`}</span>
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {can(profile.role, 'opportunity:read') && (
          <Section title="My pipeline" actions={<Link href="/pipeline" className="link text-sm">Pipeline</Link>}>
            {byStage.size === 0 ? <Empty>No opportunities yet.</Empty> : (
              <table className="table">
                <thead><tr><th>Stage</th><th className="text-right">Deals</th><th className="text-right">Est. pallets</th></tr></thead>
                <tbody>
                  {OPP_STAGES.filter((s) => byStage.has(s)).map((s) => (
                    <tr key={s}><td>{label(s)}</td><td className="text-right">{byStage.get(s)!.n}</td><td className="text-right">{byStage.get(s)!.pallets.toLocaleString('en-PH')}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}

        {team && (
          <Section title="Overdue follow-ups by person">
            {overdueByRep.size === 0 ? <Empty>No overdue follow-ups.</Empty> : (
              <table className="table">
                <thead><tr><th>Person</th><th className="text-right">Overdue</th></tr></thead>
                <tbody>
                  {[...overdueByRep.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
                    <tr key={id}><td>{names.get(id) ?? 'Unknown'}</td><td className="text-right font-semibold text-red-700">{n}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        )}

        <Section title="Recent activity" actions={<Link href="/activities" className="link text-sm">All</Link>}>
          {(recent.data ?? []).length === 0 ? <Empty>No activity logged yet.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {recent.data!.map((a) => (
                <li key={a.id} className="py-2 text-sm">
                  <p><Badge>{label(a.type)}</Badge> <Link className="link" href={`/accounts/${a.account_id}`}>{acct(a)}</Link></p>
                  <p className="mt-0.5 line-clamp-2 text-stone-700">{a.summary}</p>
                  <p className="text-xs text-stone-600">{names.get(a.created_by) ?? ''} · {fmtDateTime(a.occurred_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
