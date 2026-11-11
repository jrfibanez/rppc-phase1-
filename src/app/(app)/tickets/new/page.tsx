import type { Metadata } from 'next'
import { requireUser } from '@/lib/auth/require-role'
import { PageHeader } from '@/components/ui'
import { listStaff, TICKET_ROLES } from '@/lib/data'
import { TicketForm } from '../ticket-form'

export const metadata: Metadata = { title: 'New ticket' }

export default async function NewTicket({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams
  const { supabase } = await requireUser('ticket:create')
  const staff = await listStaff(supabase, TICKET_ROLES)
  return (
    <>
      <PageHeader title="New ticket" subtitle="Log a client concern from Messenger, WhatsApp, a call, or a visit. Works offline." />
      <div className="card p-4 sm:p-6"><TicketForm staff={staff} defaultAccount={account} /></div>
    </>
  )
}
