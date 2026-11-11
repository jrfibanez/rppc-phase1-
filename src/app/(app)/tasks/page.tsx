import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { PageHeader, Section, Empty } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { listStaff, nameMap } from '@/lib/data'
import { TaskCheck } from './task-check'
import { TaskForm } from './task-form'

export const metadata: Metadata = { title: 'Tasks' }

type Row = { id: string; title: string; due_at: string | null; status: string; assigned_to: string; created_by: string; account_id: string | null; ticket_id: string | null; completed_at: string | null; accounts: { name: string } | null; tickets: { number: string } | null }

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { supabase, user, profile } = await requireUser('task:write')
  const { who } = await searchParams
  const team = can(profile.role, 'dashboard:team') && who === 'all'
  let q = supabase.from('tasks').select('id, title, due_at, status, assigned_to, created_by, account_id, ticket_id, completed_at, accounts(name), tickets(number)')
    .order('due_at', { ascending: true, nullsFirst: false }).limit(500)
  if (!team) q = q.or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
  const [{ data }, done, staff] = await Promise.all([
    q.eq('status', 'open'),
    supabase.from('tasks').select('id, title, completed_at, assigned_to').eq('status', 'done').eq('assigned_to', user.id).order('completed_at', { ascending: false }).limit(10),
    listStaff(supabase),
  ])
  const rows = (data ?? []) as unknown as Row[]
  const names = nameMap(staff)
  const now = new Date()
  const endToday = new Date(new Date(now.getTime() + 8 * 3_600_000).toISOString().slice(0, 10) + 'T23:59:59+08:00')
  const groups = {
    Overdue: rows.filter((r) => r.due_at && new Date(r.due_at) < now),
    Today: rows.filter((r) => r.due_at && new Date(r.due_at) >= now && new Date(r.due_at) <= endToday),
    Upcoming: rows.filter((r) => r.due_at && new Date(r.due_at) > endToday),
    'No due date': rows.filter((r) => !r.due_at),
  }
  return (
    <>
      <PageHeader title="Tasks" subtitle="Follow-ups due today, overdue, and upcoming."
        actions={can(profile.role, 'dashboard:team') && (
          <div className="flex gap-1">
            <Link href="/tasks" className={!team ? 'btn-primary' : 'btn-secondary'}>Mine</Link>
            <Link href="/tasks?who=all" className={team ? 'btn-primary' : 'btn-secondary'}>Everyone</Link>
          </div>
        )} />
      <div className="space-y-4">
        <Section title="Add a follow-up"><TaskForm staff={staff} me={user.id} /></Section>
        {Object.entries(groups).map(([g, list]) => (
          <Section key={g} title={`${g} (${list.length})`}>
            {list.length === 0 ? <Empty>Nothing here.</Empty> : (
              <ul className="divide-y divide-stone-100">
                {list.map((t) => (
                  <li key={t.id} className="relative flex items-start gap-3 py-2">
                    <TaskCheck id={t.id} />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">{t.title}</p>
                      <p className={`text-xs ${g === 'Overdue' ? 'font-semibold text-red-700' : 'text-stone-600'}`}>
                        {t.due_at ? fmtDateTime(t.due_at) : 'No due date'}
                        {t.accounts && <> · <Link className="link" href={`/accounts/${t.account_id}`}>{t.accounts.name}</Link></>}
                        {t.tickets && <> · <Link className="link" href={`/tickets/${t.ticket_id}`}>{t.tickets.number}</Link></>}
                        {(team || t.assigned_to !== user.id) && <> · {names.get(t.assigned_to) ?? '—'}</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ))}
        <Section title="Recently completed">
          {(done.data ?? []).length === 0 ? <Empty>Nothing completed yet.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {done.data!.map((t) => (
                <li key={t.id} className="relative flex items-start gap-3 py-2 text-sm">
                  <TaskCheck id={t.id} done />
                  <div><p className="text-stone-600 line-through">{t.title}</p><p className="text-xs text-stone-600">Done {fmtDateTime(t.completed_at)}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
