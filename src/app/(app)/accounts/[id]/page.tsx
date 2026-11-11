import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { ActionForm, Field, Select } from '@/components/form'
import { PageHeader, Tabs, Section, Empty, StatusBadge, Badge, Details } from '@/components/ui'
import { FileList } from '@/components/file-list'
import { fmtDate, fmtDateTime, fmtNumber } from '@/lib/format'
import { label, REGIONS } from '@/lib/labels'
import { listStaff, nameMap, SALES_ROLES } from '@/lib/data'
import { AccountFields } from '../account-fields'
import {
  archiveContact, archiveSite, saveContact, saveFinance, saveSite, setArchived, updateAccount, updateAccreditation,
} from '../actions'
import { ConfirmButton } from './client-bits'
import { ActivityForm } from '../../activities/activity-form'

export const metadata: Metadata = { title: 'Account' }

type Account = {
  id: string; code: string; name: string; legal_name: string | null; segment: string; status: string; lead_source: string | null
  owner_id: string | null; is_accredited: boolean; accredited_at: string | null; billing_cutoff_day: number; lock_in_months: number | null
  principal_account_id: string | null; notes: string | null; archived_at: string | null; created_at: string
}
type Contact = { id: string; full_name: string; job_title: string | null; department: string | null; email: string | null; mobile: string | null; messenger_link: string | null; is_primary: boolean }
type Site = { id: string; name: string; region: string; province: string | null; city: string | null; address: string | null; lat: number | null; lng: number | null; receiving_hours: string | null; site_contact_id: string | null; trucking_zone: string | null }

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params
  const { tab = 'overview' } = await searchParams
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const { supabase, user, profile } = await requireUser('account:read')
  const r = profile.role

  const { data: a } = await supabase.from('accounts').select('*').eq('id', id).maybeSingle<Account>()
  if (!a) notFound()

  const [contacts, sites, staff, counts] = await Promise.all([
    supabase.from('contacts').select('id, full_name, job_title, department, email, mobile, messenger_link, is_primary').eq('account_id', id).is('archived_at', null).order('is_primary', { ascending: false }).order('full_name'),
    supabase.from('sites').select('id, name, region, province, city, address, lat, lng, receiving_hours, site_contact_id, trucking_zone').eq('account_id', id).is('archived_at', null).order('name'),
    listStaff(supabase),
    Promise.all([
      can(r, 'opportunity:read') ? supabase.from('opportunities').select('id', { count: 'exact', head: true }).eq('account_id', id).is('archived_at', null) : Promise.resolve({ count: 0 }),
      supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('account_id', id).not('status', 'in', '(closed)'),
    ]),
  ])
  const contactRows = (contacts.data ?? []) as Contact[]
  const siteRows = (sites.data ?? []) as Site[]
  const names = nameMap(staff)
  const isOwner = a.owner_id === user.id
  const canEdit = can(r, 'account:update') && (r !== 'sales_rep' || isOwner) && r !== 'ops_manager'
  const base = `/accounts/${id}`

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'contacts', label: 'Contacts', count: contactRows.length },
    { key: 'sites', label: 'Sites', count: siteRows.length },
    ...(can(r, 'opportunity:read') ? [{ key: 'opportunities', label: 'Opportunities', count: counts[0].count ?? 0 }] : []),
    { key: 'activity', label: 'Activity' },
    { key: 'tickets', label: 'Tickets', count: counts[1].count ?? 0 },
    { key: 'files', label: 'Files' },
    ...(can(r, 'account:finance:read') ? [{ key: 'billing', label: 'Billing / TIN' }] : []),
  ]

  return (
    <>
      <PageHeader title={a.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{a.code} <StatusBadge value={a.status} /> {a.is_accredited ? <Badge tone="green">Accredited {fmtDate(a.accredited_at)}</Badge> : <Badge>Not accredited</Badge>} {a.archived_at && <Badge tone="red">Archived</Badge>} · Owner: {a.owner_id ? names.get(a.owner_id) ?? '—' : '—'}</span>}
        actions={<>
          {can(r, 'ticket:create') && <Link className="btn-secondary" href={`/tickets/new?account=${id}`}>New ticket</Link>}
          {can(r, 'account:archive') && (a.archived_at
            ? <ConfirmButton action={setArchived.bind(null, id, false)}>Restore</ConfirmButton>
            : <ConfirmButton action={setArchived.bind(null, id, true)} confirmText="Archive this account? It will be hidden from lists but kept for history." className="btn-danger">Archive</ConfirmButton>)}
        </>} />
      <Tabs base={base} current={tab} tabs={tabs} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Section title="Details">
              {canEdit ? (
                <ActionForm action={updateAccount.bind(null, id)}>
                  <AccountFields a={a} staff={staff.filter((s) => SALES_ROLES.includes(s.role))} canReassign={can(r, 'opportunity:reassign')}
                    principals={(await supabase.from('accounts').select('id, name, code').is('archived_at', null).neq('id', id).order('name').limit(2000)).data ?? []} />
                </ActionForm>
              ) : (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Item k="Legal name" v={a.legal_name} /><Item k="Segment" v={label(a.segment)} /><Item k="Lead source" v={label(a.lead_source)} />
                  <Item k="Lock-in" v={a.lock_in_months ? `${a.lock_in_months} months` : null} /><Item k="Created" v={fmtDate(a.created_at)} />
                  <div className="sm:col-span-2"><Item k="Notes" v={a.notes} /></div>
                </dl>
              )}
            </Section>
          </div>
          <div className="space-y-4">
            <Section title="Accreditation & billing cutoff">
              {can(r, 'account:accredit') ? (
                <ActionForm action={updateAccreditation.bind(null, id)}>
                  <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="is_accredited" defaultChecked={a.is_accredited} className="size-5" /> Accredited (unlocks sales orders in Phase 2)</label>
                  <Field label="Accredited on" name="accredited_at"><input id="accredited_at" name="accredited_at" type="date" defaultValue={a.accredited_at ?? ''} className="input" /></Field>
                  <Field label="Billing cutoff day" name="billing_cutoff_day" hint="Default 10. Days 1–28."><input id="billing_cutoff_day" name="billing_cutoff_day" type="number" min={1} max={28} required defaultValue={a.billing_cutoff_day} className="input" /></Field>
                </ActionForm>
              ) : (
                <dl className="space-y-2 text-sm"><Item k="Accredited" v={a.is_accredited ? `Yes, since ${fmtDate(a.accredited_at)}` : 'No'} /><Item k="Billing cutoff day" v={String(a.billing_cutoff_day)} /></dl>
              )}
            </Section>
            <Section title="Primary contact">
              {contactRows.find((c) => c.is_primary) ? <ContactCard c={contactRows.find((c) => c.is_primary)!} /> : <Empty>No primary contact set.</Empty>}
            </Section>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="space-y-3">
          {can(r, 'contact:create') && (
            <Details summary="Add contact"><ActionForm action={saveContact.bind(null, id, null)} resetOnSuccess submitLabel="Add contact"><ContactFields /></ActionForm></Details>
          )}
          {contactRows.length === 0 ? <Empty>No contacts yet.</Empty> : contactRows.map((c) => (
            <div key={c.id} className="card p-4">
              <ContactCard c={c} />
              {can(r, 'contact:update') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <details className="w-full"><summary className="link cursor-pointer text-sm">Edit</summary>
                    <div className="mt-3"><ActionForm action={saveContact.bind(null, id, c.id)}><ContactFields c={c} /></ActionForm></div>
                  </details>
                  {can(r, 'account:archive') && <ConfirmButton action={archiveContact.bind(null, id, c.id)} confirmText={`Archive ${c.full_name}?`} className="btn-ghost text-red-700">Archive</ConfirmButton>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'sites' && (
        <div className="space-y-3">
          {can(r, 'site:write') && (
            <Details summary="Add delivery site"><ActionForm action={saveSite.bind(null, id, null)} resetOnSuccess submitLabel="Add site"><SiteFields contacts={contactRows} /></ActionForm></Details>
          )}
          {siteRows.length === 0 ? <Empty>No delivery sites yet.</Empty> : siteRows.map((s) => (
            <div key={s.id} className="card p-4 text-sm">
              <p className="font-medium">{s.name} <Badge tone="blue">{label(s.region)}</Badge></p>
              <p className="text-stone-700">{[s.address, s.city, s.province].filter(Boolean).join(', ') || 'No address'}</p>
              <p className="text-xs text-stone-600">
                {s.receiving_hours && <>Receiving: {s.receiving_hours} · </>}
                {s.site_contact_id && <>Contact: {contactRows.find((c) => c.id === s.site_contact_id)?.full_name ?? '—'} · </>}
                {s.lat != null && s.lng != null && <a className="link" href={`https://maps.google.com/?q=${s.lat},${s.lng}`} target="_blank" rel="noopener noreferrer">Map</a>}
              </p>
              {can(r, 'site:write') && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <details className="w-full"><summary className="link cursor-pointer">Edit</summary>
                    <div className="mt-3"><ActionForm action={saveSite.bind(null, id, s.id)}><SiteFields s={s} contacts={contactRows} /></ActionForm></div>
                  </details>
                  {can(r, 'account:archive') && <ConfirmButton action={archiveSite.bind(null, id, s.id)} confirmText={`Archive site ${s.name}?`} className="btn-ghost text-red-700">Archive</ConfirmButton>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'opportunities' && can(r, 'opportunity:read') && <OppsTab supabase={supabase} id={id} names={names} canCreate={can(r, 'opportunity:write')} />}

      {tab === 'activity' && (
        <div className="space-y-4">
          {can(r, 'activity:create') && <Section title="Log activity"><ActivityForm fixedAccount={{ id, name: a.name, code: a.code }} /></Section>}
          <Timeline supabase={supabase} id={id} names={names} />
        </div>
      )}

      {tab === 'tickets' && <TicketsTab supabase={supabase} id={id} />}

      {tab === 'files' && (
        <Section title="Files">
          <FileList supabase={supabase} entityType="account" entityId={id} canUpload={can(r, 'attachment:upload')} />
        </Section>
      )}

      {tab === 'billing' && can(r, 'account:finance:read') && <FinanceTab supabase={supabase} id={id} canWrite={can(r, 'account:finance:write')} />}
    </>
  )
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return <div><dt className="text-xs font-medium text-stone-600">{k}</dt><dd className="whitespace-pre-wrap text-stone-900">{v || '—'}</dd></div>
}

function ContactCard({ c }: { c: Contact }) {
  return (
    <div className="text-sm">
      <p className="font-medium">{c.full_name} {c.is_primary && <Badge tone="violet">Primary</Badge>}</p>
      <p className="text-stone-700">{[c.job_title, c.department].filter(Boolean).join(' · ') || '—'}</p>
      <p className="mt-1 flex flex-wrap gap-x-3 text-stone-700">
        {c.mobile && <a className="link" href={`tel:${c.mobile}`}>{c.mobile}</a>}
        {c.email && <a className="link" href={`mailto:${c.email}`}>{c.email}</a>}
        {c.messenger_link && <a className="link" href={c.messenger_link} target="_blank" rel="noopener noreferrer">Messenger</a>}
      </p>
    </div>
  )
}

function ContactFields({ c }: { c?: Contact }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Full name *" name="full_name"><input name="full_name" id="full_name" required minLength={2} defaultValue={c?.full_name} className="input" /></Field>
      <Field label="Job title" name="job_title"><input name="job_title" id="job_title" defaultValue={c?.job_title ?? ''} className="input" /></Field>
      <Field label="Department" name="department"><input name="department" id="department" defaultValue={c?.department ?? ''} placeholder="Purchasing, logistics, warehouse…" className="input" /></Field>
      <Field label="Mobile" name="mobile"><input name="mobile" id="mobile" type="tel" defaultValue={c?.mobile ?? ''} className="input" /></Field>
      <Field label="Email" name="email"><input name="email" id="email" type="email" defaultValue={c?.email ?? ''} className="input" /></Field>
      <Field label="Messenger link" name="messenger_link"><input name="messenger_link" id="messenger_link" type="url" defaultValue={c?.messenger_link ?? ''} placeholder="https://m.me/…" className="input" /></Field>
      <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_primary" defaultChecked={c?.is_primary} className="size-5" /> Primary contact</label>
    </div>
  )
}

function SiteFields({ s, contacts }: { s?: Site; contacts: Contact[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Site name *" name="name"><input name="name" id="name" required minLength={2} defaultValue={s?.name} placeholder="e.g. Cabuyao DC" className="input" /></Field>
      <Field label="Region" name="region"><Select name="region" options={REGIONS} labeled defaultValue={s?.region ?? 'luzon'} /></Field>
      <Field label="Province" name="province"><input name="province" id="province" defaultValue={s?.province ?? ''} className="input" /></Field>
      <Field label="City / municipality" name="city"><input name="city" id="city" defaultValue={s?.city ?? ''} className="input" /></Field>
      <div className="sm:col-span-2"><Field label="Address" name="address"><input name="address" id="address" defaultValue={s?.address ?? ''} className="input" /></Field></div>
      <Field label="Latitude" name="lat"><input name="lat" id="lat" inputMode="decimal" defaultValue={s?.lat ?? ''} className="input" /></Field>
      <Field label="Longitude" name="lng"><input name="lng" id="lng" inputMode="decimal" defaultValue={s?.lng ?? ''} className="input" /></Field>
      <Field label="Receiving hours" name="receiving_hours"><input name="receiving_hours" id="receiving_hours" defaultValue={s?.receiving_hours ?? ''} placeholder="Mon–Sat 7am–3pm" className="input" /></Field>
      <Field label="Site contact" name="site_contact_id"><Select name="site_contact_id" blank="—" defaultValue={s?.site_contact_id} options={contacts.map((c) => ({ value: c.id, label: c.full_name }))} /></Field>
      <Field label="Trucking zone" name="trucking_zone" hint="Filled when the zone matrix arrives (Phase 3)"><input name="trucking_zone" id="trucking_zone" defaultValue={s?.trucking_zone ?? ''} className="input" /></Field>
    </div>
  )
}

type SB = Awaited<ReturnType<typeof requireUser>>['supabase']

async function OppsTab({ supabase, id, names, canCreate }: { supabase: SB; id: string; names: Map<string, string>; canCreate: boolean }) {
  const { data } = await supabase.from('opportunities').select('id, title, stage, owner_id, est_pallets, target_region, expected_start, lost_reason').eq('account_id', id).is('archived_at', null).order('created_at', { ascending: false })
  return (
    <div className="space-y-3">
      {canCreate && <Link className="btn-primary" href={`/pipeline/new?account=${id}`}>New opportunity</Link>}
      {(data ?? []).length === 0 ? <Empty>No opportunities yet.</Empty> : (
        <div className="card overflow-x-auto"><table className="table">
          <thead><tr><th>Opportunity</th><th>Stage</th><th className="text-right">Est. pallets</th><th>Region</th><th>Start</th><th>Owner</th></tr></thead>
          <tbody>{data!.map((o) => (
            <tr key={o.id}>
              <td><Link className="link" href={`/pipeline/${o.id}`}>{o.title}</Link>{o.lost_reason && <p className="text-xs text-stone-600">Lost: {o.lost_reason}</p>}</td>
              <td><StatusBadge value={o.stage} /></td><td className="text-right">{fmtNumber(o.est_pallets)}</td><td>{label(o.target_region)}</td>
              <td>{fmtDate(o.expected_start)}</td><td>{names.get(o.owner_id) ?? '—'}</td>
            </tr>))}
          </tbody></table></div>
      )}
    </div>
  )
}

async function Timeline({ supabase, id, names }: { supabase: SB; id: string; names: Map<string, string> }) {
  const { data } = await supabase.from('activities').select('id, type, summary, next_step, occurred_at, created_by, lat, lng, contacts(full_name), sites(name), opportunities(title)')
    .eq('account_id', id).order('occurred_at', { ascending: false }).limit(200)
  if (!data?.length) return <Empty>No activity logged yet.</Empty>
  return (
    <ol className="relative space-y-3 border-l-2 border-stone-200 pl-4">
      {data.map((x) => {
        const c = x.contacts as unknown as { full_name: string } | null, s = x.sites as unknown as { name: string } | null, o = x.opportunities as unknown as { title: string } | null
        return (
          <li key={x.id} className="card p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2"><Badge>{label(x.type)}</Badge><span className="text-xs text-stone-600">{fmtDateTime(x.occurred_at)} · {names.get(x.created_by) ?? '—'}</span></p>
            <p className="mt-1 whitespace-pre-wrap">{x.summary}</p>
            {(c || s || o) && <p className="mt-1 text-xs text-stone-600">{[c && `With ${c.full_name}`, s && `At ${s.name}`, o && `Re: ${o.title}`].filter(Boolean).join(' · ')}</p>}
            {x.next_step && <p className="mt-1 text-xs"><strong>Next step:</strong> {x.next_step}</p>}
            {x.lat != null && <a className="link text-xs" href={`https://maps.google.com/?q=${x.lat},${x.lng}`} target="_blank" rel="noopener noreferrer">Location</a>}
          </li>
        )
      })}
    </ol>
  )
}

async function TicketsTab({ supabase, id }: { supabase: SB; id: string }) {
  const { data } = await supabase.from('tickets').select('id, number, subject, status, priority, category, created_at, sla_breached').eq('account_id', id).order('created_at', { ascending: false }).limit(200)
  if (!data?.length) return <Empty>No tickets for this account.</Empty>
  return (
    <div className="card overflow-x-auto"><table className="table">
      <thead><tr><th>Ticket</th><th>Category</th><th>Priority</th><th>Status</th><th>Opened</th></tr></thead>
      <tbody>{data.map((t) => (
        <tr key={t.id}>
          <td><Link className="link" href={`/tickets/${t.id}`}>{t.number}</Link><p className="text-xs text-stone-700">{t.subject}</p></td>
          <td>{label(t.category)}</td><td><StatusBadge value={t.priority} /></td>
          <td><StatusBadge value={t.status} /> {t.sla_breached && <Badge tone="red">SLA breached</Badge>}</td><td>{fmtDate(t.created_at)}</td>
        </tr>))}
      </tbody></table></div>
  )
}

async function FinanceTab({ supabase, id, canWrite }: { supabase: SB; id: string; canWrite: boolean }) {
  const { data: f } = await supabase.from('account_finance').select('tin, billing_address, billing_email').eq('account_id', id).maybeSingle()
  return (
    <Section title="Billing details (finance only)">
      {canWrite ? (
        <ActionForm action={saveFinance.bind(null, id)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="TIN" name="tin"><input name="tin" id="tin" defaultValue={f?.tin ?? ''} placeholder="000-000-000-00000" className="input" /></Field>
            <Field label="Billing email" name="billing_email"><input name="billing_email" id="billing_email" type="email" defaultValue={f?.billing_email ?? ''} className="input" /></Field>
            <div className="sm:col-span-2"><Field label="Billing address" name="billing_address"><textarea name="billing_address" id="billing_address" rows={2} defaultValue={f?.billing_address ?? ''} className="input" /></Field></div>
          </div>
        </ActionForm>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><Item k="TIN" v={f?.tin} /><Item k="Billing email" v={f?.billing_email} /><Item k="Billing address" v={f?.billing_address} /></dl>
      )}
    </Section>
  )
}
