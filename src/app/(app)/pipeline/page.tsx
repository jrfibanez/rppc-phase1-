import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { PageHeader } from '@/components/ui'
import { listStaff, nameMap } from '@/lib/data'
import { Kanban, type Card } from './kanban'

export const metadata: Metadata = { title: 'Pipeline' }

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ owner?: string }> }) {
  const { owner } = await searchParams
  const { supabase, user, profile } = await requireUser('opportunity:read')
  let q = supabase.from('opportunities').select('id, title, stage, owner_id, est_pallets, account_id, accounts(name)').is('archived_at', null).order('stage_changed_at', { ascending: false }).limit(1000)
  if (owner === 'me') q = q.eq('owner_id', user.id)
  const [{ data }, staff] = await Promise.all([q, listStaff(supabase)])
  const names = nameMap(staff)
  const cards: Card[] = (data ?? []).map((o) => ({
    id: o.id, title: o.title, stage: o.stage, est_pallets: o.est_pallets, owner_id: o.owner_id, owner: names.get(o.owner_id) ?? '—',
    account_id: o.account_id, account: (o.accounts as unknown as { name: string } | null)?.name ?? '',
  }))
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Drag cards between stages, or use the stage menu on each card. Lost needs a reason."
        actions={<>
          <Link href={owner === 'me' ? '/pipeline' : '/pipeline?owner=me'} className="btn-secondary">{owner === 'me' ? 'Show everyone' : 'Only mine'}</Link>
          <a href="/api/export?entity=opportunities" className="btn-secondary">Export CSV</a>
          {can(profile.role, 'opportunity:write') && <Link href="/pipeline/new" className="btn-primary">New opportunity</Link>}
        </>} />
      <Kanban cards={cards} me={user.id} canMoveAll={can(profile.role, 'opportunity:reassign')} />
      {!can(profile.role, 'opportunity:write') && <p className="text-sm text-stone-600">Read-only view for your role.</p>}
    </>
  )
}
