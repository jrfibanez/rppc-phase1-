import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { ActionForm, Field, Select } from '@/components/form'
import { PageHeader, Section, StatusBadge, Badge, Empty } from '@/components/ui'
import { FileList } from '@/components/file-list'
import { fmtCountdown, fmtDateTime } from '@/lib/format'
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES, label } from '@/lib/labels'
import { listStaff, nameMap, TICKET_ROLES } from '@/lib/data'
import { updateTicket } from '../actions'
import { CommentForm } from './comment-form'
import { TaskForm } from '../../tasks/task-form'

export const metadata: Metadata = { title: 'Ticket' }

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params
  const { created } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { supabase, user, profile } = await requireUser('ticket:read')
  const { data: t } = await supabase.from('tickets').select('*, accounts(id, name), sites(name), contacts(full_name, mobile)').eq('id', id).maybeSingle()
  if (!t) notFound()
  const [comments, staff, tasks] = await Promise.all([
    supabase.from('ticket_comments').select('id, body, is_internal, created_by, created_at').eq('ticket_id', id).order('created_at'),
    listStaff(supabase),
    supabase.from('tasks').select('id, title, status, due_at, assigned_to').eq('ticket_id', id).order('created_at'),
  ])
  const names = nameMap(staff)
  const acct = t.accounts as { id: string; name: string }
  const site = t.sites as { name: string } | null
  const contact = t.contacts as { full_name: string; mobile: string | null } | null
  const now = Date.now()
  const open = !['resolved', 'closed'].includes(t.status)
  const frLate = open && !t.first_responded_at && new Date(t.first_response_due).getTime() < now
  const resLate = open && new Date(t.resolution_due).getTime() < now
  const r = profile.role
  const canUpdate = ['owner', 'admin', 'sales_manager', 'csr', 'ops_manager', 'deployment_officer'].includes(r)
    || (r === 'sales_rep' && t.assigned_to === user.id) || (['finance', 'billing'].includes(r) && t.category === 'billing')

  return (
    <>
      <PageHeader title={`${t.number} · ${t.subject}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link className="link" href={`/accounts/${acct.id}?tab=tickets`}>{acct.name}</Link> <StatusBadge value={t.priority} /> <StatusBadge value={t.status} /> {(t.sla_breached || frLate || resLate) && <Badge tone="red">SLA breached</Badge>}</span>} />
      {created && <p role="status" className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Ticket created. Attach screenshots below.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Concern">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-stone-600">Category</dt><dd>{label(t.category)}</dd></div>
              <div><dt className="text-xs text-stone-600">Received via</dt><dd>{label(t.channel)}{t.source_ref && <> · {/^https?:\/\//.test(t.source_ref) ? <a className="link break-all" href={t.source_ref} target="_blank" rel="noopener noreferrer">Open thread</a> : t.source_ref}</>}</dd></div>
              <div><dt className="text-xs text-stone-600">Site</dt><dd>{site?.name ?? '—'}</dd></div>
              <div><dt className="text-xs text-stone-600">Contact</dt><dd>{contact ? `${contact.full_name}${contact.mobile ? ` · ${contact.mobile}` : ''}` : '—'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-stone-600">Details</dt><dd className="whitespace-pre-wrap">{t.description || '—'}</dd></div>
              {t.resolution_note && <div className="sm:col-span-2"><dt className="text-xs text-stone-600">Resolution</dt><dd className="whitespace-pre-wrap">{t.resolution_note}</dd></div>}
            </dl>
          </Section>
          <Section title="Conversation & notes">
            {!comments.data?.length ? <Empty>No replies or notes yet.</Empty> : (
              <ol className="mb-4 space-y-3">
                {comments.data.map((c) => (
                  <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.is_internal ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white'}`}>
                    <p className="mb-1 text-xs text-stone-600"><strong className="text-stone-800">{names.get(c.created_by) ?? '—'}</strong> · {fmtDateTime(c.created_at)} · {c.is_internal ? 'Internal note' : 'Client reply logged'}</p>
                    <p className="whitespace-pre-wrap">{c.body}</p>
                  </li>
                ))}
              </ol>
            )}
            <CommentForm ticketId={id} />
          </Section>
          <Section title="Screenshots & files">
            <FileList supabase={supabase} entityType="ticket" entityId={id} canUpload={can(r, 'attachment:upload')} />
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="SLA">
            <dl className="space-y-2 text-sm">
              <div><dt className="text-xs text-stone-600">First response due</dt><dd className={frLate ? 'font-semibold text-red-700' : ''}>{fmtDateTime(t.first_response_due)}{!t.first_responded_at && open && ` (${fmtCountdown(t.first_response_due, now)})`}</dd></div>
              <div><dt className="text-xs text-stone-600">First responded</dt><dd>{fmtDateTime(t.first_responded_at)}</dd></div>
              <div><dt className="text-xs text-stone-600">Resolution due</dt><dd className={resLate ? 'font-semibold text-red-700' : ''}>{fmtDateTime(t.resolution_due)}{open && ` (${fmtCountdown(t.resolution_due, now)})`}</dd></div>
              <div><dt className="text-xs text-stone-600">Resolved</dt><dd>{fmtDateTime(t.resolved_at)}</dd></div>
              <div><dt className="text-xs text-stone-600">Opened</dt><dd>{fmtDateTime(t.created_at)} by {names.get(t.created_by) ?? '—'}</dd></div>
            </dl>
          </Section>
          {canUpdate && (
            <Section title="Work this ticket">
              <ActionForm action={updateTicket.bind(null, id)} submitLabel="Update ticket">
                <Field label="Status" name="status"><Select name="status" options={TICKET_STATUSES} labeled defaultValue={t.status} /></Field>
                <Field label="Assigned to" name="assigned_to"><Select name="assigned_to" blank="Unassigned" defaultValue={t.assigned_to} options={staff.filter((s) => TICKET_ROLES.includes(s.role)).map((s) => ({ value: s.id, label: s.full_name }))} /></Field>
                <Field label="Priority" name="priority" hint="Changing priority recalculates SLA deadlines."><Select name="priority" options={TICKET_PRIORITIES} labeled defaultValue={t.priority} /></Field>
                <Field label="Category" name="category"><Select name="category" options={TICKET_CATEGORIES} labeled defaultValue={t.category} /></Field>
                <Field label="Resolution note (required to resolve)" name="resolution_note"><textarea id="resolution_note" name="resolution_note" rows={3} defaultValue={t.resolution_note ?? ''} className="input" /></Field>
              </ActionForm>
            </Section>
          )}
          <Section title="Follow-up tasks">
            {(tasks.data ?? []).length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">{tasks.data!.map((k) => (
                <li key={k.id}><StatusBadge value={k.status} /> {k.title} <span className="text-xs text-stone-600">· {names.get(k.assigned_to)} {k.due_at && `· ${fmtDateTime(k.due_at)}`}</span></li>
              ))}</ul>
            )}
            {can(r, 'task:write') && <TaskForm staff={staff} me={user.id} ticketId={id} accountId={acct.id} stacked />}
          </Section>
        </div>
      </div>
    </>
  )
}
