import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { ActionForm } from '@/components/form'
import { PageHeader } from '@/components/ui'
import { listStaff, SALES_ROLES } from '@/lib/data'
import { OppFields } from '../opp-fields'
import { createOpportunity } from '../actions'

export const metadata: Metadata = { title: 'New opportunity' }

export default async function NewOpp({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams
  const { supabase, profile } = await requireUser('opportunity:write')
  const [{ data: accounts }, staff] = await Promise.all([
    supabase.from('accounts').select('id, name, code').is('archived_at', null).order('name').limit(5000),
    listStaff(supabase, SALES_ROLES),
  ])
  return (
    <>
      <PageHeader title="New opportunity" />
      <div className="card p-4 sm:p-6">
        <ActionForm action={createOpportunity} submitLabel="Create opportunity">
          <OppFields o={{ account_id: account }} accounts={accounts ?? []} staff={staff} canReassign={can(profile.role, 'opportunity:reassign')} />
        </ActionForm>
      </div>
    </>
  )
}
