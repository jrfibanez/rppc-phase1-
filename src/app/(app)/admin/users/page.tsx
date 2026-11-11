import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { ROLES } from '@/lib/auth/permissions'
import { hasServiceKey, supabaseAdmin } from '@/lib/supabase/admin'
import { ActionForm, Field, Select } from '@/components/form'
import { PageHeader, Section, Badge } from '@/components/ui'
import { label } from '@/lib/labels'
import { fmtDateTime } from '@/lib/format'
import { createUser, updateUser } from './actions'
import { ResetButton } from './reset-button'

export const metadata: Metadata = { title: 'Users' }

export default async function UsersPage() {
  const { supabase, user, profile } = await requireUser('user:manage')
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, role, phone, is_active, must_change_password, created_at').order('full_name')
  const keyOk = hasServiceKey()
  const emails = new Map<string, { email?: string; last?: string | null }>()
  if (keyOk) {
    const { data } = await supabaseAdmin().auth.admin.listUsers({ perPage: 1000 })
    for (const u of data?.users ?? []) emails.set(u.id, { email: u.email, last: u.last_sign_in_at })
  }
  const roleOptions = (ROLES as readonly string[]).filter((r) => r !== 'owner' || profile.role === 'owner')
  return (
    <>
      <PageHeader title="Users" subtitle="Accounts are invite-only. New users get a temporary password and must change it at first sign-in." />
      {!keyOk && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">SUPABASE_SERVICE_ROLE_KEY is not configured on the server, so users cannot be created or reset yet.</p>}
      <div className="space-y-4">
        <Section title="Add a user">
          <ActionForm action={createUser} submitLabel="Create user" resetOnSuccess>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Full name" name="full_name"><input id="full_name" name="full_name" required minLength={2} className="input" /></Field>
              <Field label="Email" name="email"><input id="email" name="email" type="email" required className="input" /></Field>
              <Field label="Role" name="role"><Select name="role" options={roleOptions} labeled defaultValue="sales_rep" /></Field>
              <Field label="Phone" name="phone"><input id="phone" name="phone" type="tel" className="input" /></Field>
            </div>
          </ActionForm>
        </Section>
        <Section title={`People (${profiles?.length ?? 0})`}>
          <ul className="divide-y divide-stone-100">
            {(profiles ?? []).map((p) => {
              const locked = p.role === 'owner' && profile.role !== 'owner'
              return (
                <li key={p.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{p.full_name} {p.id === user.id && <Badge>You</Badge>} {!p.is_active && <Badge tone="red">Inactive</Badge>} {p.must_change_password && <Badge tone="amber">Must set password</Badge>}</p>
                      <p className="text-stone-700">{emails.get(p.id)?.email ?? '—'} · {label(p.role)}</p>
                      <p className="text-xs text-stone-600">Last sign-in {fmtDateTime(emails.get(p.id)?.last)}</p>
                    </div>
                    {!locked && (
                      <div className="flex flex-wrap items-end gap-2">
                        <ActionForm action={updateUser} submitLabel="Save" submitClass="btn-secondary" className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <div><label className="sr-only" htmlFor={`role-${p.id}`}>Role</label><Select id={`role-${p.id}`} name="role" options={roleOptions} labeled defaultValue={p.role} /></div>
                          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={p.is_active} disabled={p.id === user.id} className="size-5" /> Active</label>
                          {p.id === user.id && <input type="hidden" name="is_active" value="on" />}
                        </ActionForm>
                        {keyOk && p.id !== user.id && <ResetButton id={p.id} name={p.full_name} />}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </Section>
      </div>
    </>
  )
}
