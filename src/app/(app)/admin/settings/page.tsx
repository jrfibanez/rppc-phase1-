import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { ActionForm } from '@/components/form'
import { PageHeader, Section } from '@/components/ui'
import { env } from '@/lib/env'
import { label, TICKET_PRIORITIES } from '@/lib/labels'
import { saveSla } from './actions'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const { supabase } = await requireUser('settings:manage')
  const { data } = await supabase.from('sla_policies').select('*')
  const sla = new Map((data ?? []).map((p) => [p.priority, p]))
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <Section title="Ticket SLA targets (hours)">
          <div className="space-y-3">
            {[...TICKET_PRIORITIES].reverse().map((p) => (
              <ActionForm key={p} action={saveSla} submitLabel="Save" submitClass="btn-secondary" className="flex flex-wrap items-end gap-3 border-b border-stone-100 pb-3">
                <input type="hidden" name="priority" value={p} />
                <p className="w-20 text-sm font-semibold">{label(p)}</p>
                <div><label className="label" htmlFor={`fr-${p}`}>First response</label><input id={`fr-${p}`} name="first_response_h" type="number" min={1} max={720} required defaultValue={sla.get(p)?.first_response_h} className="input w-28" /></div>
                <div><label className="label" htmlFor={`rs-${p}`}>Resolution</label><input id={`rs-${p}`} name="resolution_h" type="number" min={1} max={2160} required defaultValue={sla.get(p)?.resolution_h} className="input w-28" /></div>
              </ActionForm>
            ))}
          </div>
        </Section>
        <Section title="Multi-factor authentication">
          <p className="text-sm text-stone-700">Roles required to use MFA: <strong>{env.requireMfaRoles.length ? env.requireMfaRoles.map(label).join(', ') : 'none (off)'}</strong>.</p>
          <p className="mt-2 text-sm text-stone-600">Set by the <code>REQUIRE_MFA_ROLES</code> environment variable in Vercel (e.g. <code>owner,admin,finance</code>). Recommended for owner, admin, and finance.</p>
        </Section>
      </div>
    </>
  )
}
