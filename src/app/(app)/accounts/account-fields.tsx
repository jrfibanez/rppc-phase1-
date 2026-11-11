import { Field, Select } from '@/components/form'
import { ACCOUNT_STATUSES, LEAD_SOURCES, SEGMENTS, label } from '@/lib/labels'

type A = { name?: string; legal_name?: string | null; segment?: string; status?: string; lead_source?: string | null; owner_id?: string | null; lock_in_months?: number | null; principal_account_id?: string | null; notes?: string | null }

export function AccountFields({ a = {}, staff, canReassign, principals }: {
  a?: A; staff: { id: string; full_name: string }[]; canReassign: boolean; principals: { id: string; name: string; code: string }[]
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Account name *" name="name"><input id="name" name="name" required minLength={2} defaultValue={a.name} className="input" /></Field>
      <Field label="Legal / registered name" name="legal_name"><input id="legal_name" name="legal_name" defaultValue={a.legal_name ?? ''} className="input" /></Field>
      <Field label="Segment" name="segment"><Select name="segment" options={SEGMENTS} labeled defaultValue={a.segment ?? 'other'} /></Field>
      <Field label="Status" name="status"><Select name="status" options={ACCOUNT_STATUSES} labeled defaultValue={a.status ?? 'prospect'} /></Field>
      <Field label="Lead source" name="lead_source"><Select name="lead_source" options={LEAD_SOURCES} labeled blank="—" defaultValue={a.lead_source} /></Field>
      {canReassign && (
        <Field label="Account owner" name="owner_id"><Select name="owner_id" blank="— (me)" defaultValue={a.owner_id} options={staff.map((s) => ({ value: s.id, label: s.full_name }))} /></Field>
      )}
      <Field label="Lock-in (months)" name="lock_in_months"><input id="lock_in_months" name="lock_in_months" type="number" min={1} max={60} inputMode="numeric" defaultValue={a.lock_in_months ?? ''} className="input" /></Field>
      <Field label="Billed principal (if sub-entity)" name="principal_account_id">
        <Select name="principal_account_id" blank="— none" defaultValue={a.principal_account_id} options={principals.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
      </Field>
      <div className="sm:col-span-2"><Field label="Notes" name="notes"><textarea id="notes" name="notes" rows={3} defaultValue={a.notes ?? ''} className="input" /></Field></div>
    </div>
  )
}
