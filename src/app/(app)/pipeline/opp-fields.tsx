import { Field, Select } from '@/components/form'
import { OPP_STAGES, REGIONS, label } from '@/lib/labels'

type O = { title?: string; stage?: string; owner_id?: string; est_pallets?: number | null; pallet_spec?: string | null; target_region?: string | null; expected_start?: string | null; lost_reason?: string | null; account_id?: string }

export function OppFields({ o = {}, accounts, staff, canReassign, lockAccount }: {
  o?: O; accounts: { id: string; name: string; code: string }[]; staff: { id: string; full_name: string }[]; canReassign: boolean; lockAccount?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><Field label="Title *" name="title"><input id="title" name="title" required minLength={2} defaultValue={o.title} placeholder="e.g. 2,400 ECR pallets for Calamba DC" className="input" /></Field></div>
      {lockAccount ? <input type="hidden" name="account_id" value={o.account_id} /> : (
        <Field label="Account *" name="account_id"><Select name="account_id" required blank="Choose…" defaultValue={o.account_id} options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }))} /></Field>
      )}
      <Field label="Stage" name="stage"><Select name="stage" options={OPP_STAGES} labeled defaultValue={o.stage ?? 'new'} /></Field>
      {canReassign && <Field label="Owner" name="owner_id"><Select name="owner_id" blank="— (me)" defaultValue={o.owner_id} options={staff.map((s) => ({ value: s.id, label: s.full_name }))} /></Field>}
      <Field label="Estimated pallets" name="est_pallets"><input id="est_pallets" name="est_pallets" type="number" min={1} inputMode="numeric" defaultValue={o.est_pallets ?? ''} className="input" /></Field>
      <Field label="Pallet spec" name="pallet_spec"><input id="pallet_spec" name="pallet_spec" defaultValue={o.pallet_spec ?? ''} placeholder="ECR 1200×1000" className="input" /></Field>
      <Field label="Target region" name="target_region"><Select name="target_region" options={REGIONS} labeled blank="—" defaultValue={o.target_region} /></Field>
      <Field label="Expected start" name="expected_start"><input id="expected_start" name="expected_start" type="date" defaultValue={o.expected_start ?? ''} className="input" /></Field>
      <div className="sm:col-span-2"><Field label="Lost reason (required if stage is Lost)" name="lost_reason"><textarea id="lost_reason" name="lost_reason" rows={2} defaultValue={o.lost_reason ?? ''} className="input" /></Field></div>
    </div>
  )
}
