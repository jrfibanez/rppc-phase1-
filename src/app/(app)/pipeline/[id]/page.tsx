import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { ActionForm } from '@/components/form'
import { PageHeader, Section, StatusBadge, Empty, Badge } from '@/components/ui'
import { FileList } from '@/components/file-list'
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format'
import { label } from '@/lib/labels'
import { listStaff, nameMap, SALES_ROLES } from '@/lib/data'
import { OppFields } from '../opp-fields'
import { archiveOpportunity, updateOpportunity } from '../actions'
import { ConfirmButton } from '../../accounts/[id]/client-bits'

export const metadata: Metadata = { title: 'Opportunity' }

export default async function OppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { supabase, user, profile } = await requireUser('opportunity:read')
  const { data: o } = await supabase.from('opportunities').select('*, accounts(id, name, code)').eq('id', id).maybeSingle()
  if (!o) notFound()
  const [staff, acts] = await Promise.all([
    listStaff(supabase),
    supabase.from('activities').select('id, type, summary, occurred_at, created_by').eq('opportunity_id', id).order('occurred_at', { ascending: false }).limit(50),
  ])
  const names = nameMap(staff)
  const acct = o.accounts as { id: string; name: string; code: string }
  const canEdit = can(profile.role, 'opportunity:reassign') || (can(profile.role, 'opportunity:write') && o.owner_id === user.id)
  return (
    <>
      <PageHeader title={o.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Link className="link" href={`/accounts/${acct.id}`}>{acct.name}</Link> <StatusBadge value={o.stage} /> · Owner {names.get(o.owner_id) ?? '—'} · Stage since {fmtDateTime(o.stage_changed_at)}</span>}
        actions={can(profile.role, 'opportunity:reassign') && <ConfirmButton action={archiveOpportunity.bind(null, id)} confirmText="Archive this opportunity?" className="btn-danger">Archive</ConfirmButton>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Details">
            {canEdit ? (
              <ActionForm action={updateOpportunity.bind(null, id)}>
                <OppFields o={o} accounts={[]} lockAccount staff={staff.filter((s) => SALES_ROLES.includes(s.role))} canReassign={can(profile.role, 'opportunity:reassign')} />
              </ActionForm>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-stone-600">Est. pallets</dt><dd>{fmtNumber(o.est_pallets)}</dd></div>
                <div><dt className="text-xs text-stone-600">Pallet spec</dt><dd>{o.pallet_spec ?? '—'}</dd></div>
                <div><dt className="text-xs text-stone-600">Region</dt><dd>{label(o.target_region)}</dd></div>
                <div><dt className="text-xs text-stone-600">Expected start</dt><dd>{fmtDate(o.expected_start)}</dd></div>
                {o.lost_reason && <div className="sm:col-span-2"><dt className="text-xs text-stone-600">Lost reason</dt><dd>{o.lost_reason}</dd></div>}
              </dl>
            )}
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Conforme, contract & files">
            <FileList supabase={supabase} entityType="opportunity" entityId={id} canUpload={can(profile.role, 'attachment:upload')} />
          </Section>
          <Section title="Activity">
            {!acts.data?.length ? <Empty>No activities linked yet.</Empty> : (
              <ul className="divide-y divide-stone-100 text-sm">{acts.data.map((a) => (
                <li key={a.id} className="py-2"><Badge>{label(a.type)}</Badge> <span className="text-xs text-stone-600">{fmtDateTime(a.occurred_at)} · {names.get(a.created_by)}</span><p className="mt-1">{a.summary}</p></li>
              ))}</ul>
            )}
          </Section>
        </div>
      </div>
    </>
  )
}
