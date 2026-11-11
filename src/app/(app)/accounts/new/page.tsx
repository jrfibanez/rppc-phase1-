import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { ActionForm } from '@/components/form'
import { PageHeader } from '@/components/ui'
import { listStaff, SALES_ROLES } from '@/lib/data'
import { AccountFields } from '../account-fields'
import { createAccount } from '../actions'

export const metadata: Metadata = { title: 'New account' }

export default async function NewAccount() {
  const { supabase, profile } = await requireUser('account:create')
  const [staff, { data: principals }] = await Promise.all([
    listStaff(supabase, SALES_ROLES),
    supabase.from('accounts').select('id, name, code').is('archived_at', null).order('name').limit(2000),
  ])
  return (
    <>
      <PageHeader title="New account" subtitle="Start as a prospect; status becomes Active at first delivery." />
      <div className="card p-4 sm:p-6">
        <ActionForm action={createAccount} submitLabel="Create account">
          <AccountFields staff={staff} canReassign={can(profile.role, 'opportunity:reassign')} principals={principals ?? []} />
        </ActionForm>
      </div>
    </>
  )
}
