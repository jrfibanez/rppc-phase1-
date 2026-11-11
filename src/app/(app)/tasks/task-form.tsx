'use client'
import { ActionForm, Field, Select } from '@/components/form'
import { addTask } from './actions'

export function TaskForm({ staff, me, accountId, opportunityId, ticketId, activityId, defaultTitle, stacked }: {
  staff: { id: string; full_name: string }[]; me: string
  accountId?: string; opportunityId?: string; ticketId?: string; activityId?: string; defaultTitle?: string; stacked?: boolean
}) {
  return (
    <ActionForm action={addTask} submitLabel="Add task" resetOnSuccess className={stacked ? 'space-y-3' : 'grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end'}>
      {accountId && <input type="hidden" name="account_id" value={accountId} />}
      {opportunityId && <input type="hidden" name="opportunity_id" value={opportunityId} />}
      {ticketId && <input type="hidden" name="ticket_id" value={ticketId} />}
      {activityId && <input type="hidden" name="activity_id" value={activityId} />}
      <Field label="Follow-up" name="title"><input id="title" name="title" required minLength={2} defaultValue={defaultTitle} className="input" placeholder="e.g. Send revised quote" /></Field>
      <Field label="Due" name="due_at"><input id="due_at" name="due_at" type="datetime-local" className="input" /></Field>
      <Field label="Assign to" name="assigned_to"><Select name="assigned_to" defaultValue={me} options={staff.map((s) => ({ value: s.id, label: s.id === me ? `${s.full_name} (me)` : s.full_name }))} /></Field>
    </ActionForm>
  )
}
