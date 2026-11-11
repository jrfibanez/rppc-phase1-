import type { Metadata } from 'next'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { PageHeader, Section, Empty, Badge } from '@/components/ui'
import { fmtDateTime } from '@/lib/format'
import { ACTIVITY_TYPES, label } from '@/lib/labels'
import { listStaff, nameMap } from '@/lib/data'
import { ActivityForm } from './activity-form'

export const metadata: Metadata = { title: 'Activities' }

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ mine?: string; type?: string }> }) {
  const sp = await searchParams
  const { supabase, user, profile } = await requireUser('activity:read')
  let q = supabase.from('activities').select('id, type, summary, next_step, occurred_at, created_by, account_id, accounts(name)').order('occurred_at', { ascending: false }).limit(100)
  if (sp.mine === '1') q = q.eq('created_by', user.id)
  if (sp.type && (ACTIVITY_TYPES as readonly string[]).includes(sp.type)) q = q.eq('type', sp.type)
  const [{ data }, staff] = await Promise.all([q, listStaff(supabase)])
  const names = nameMap(staff)
  return (
    <>
      <PageHeader title="Activities" subtitle="Calls, visits, and messages. Logging works offline." />
      <div className="space-y-4">
        {can(profile.role, 'activity:create') && <Section title="Log an activity"><ActivityForm /></Section>}
        <Section title="Recent" actions={
          <div className="flex gap-2 text-sm">
            <Link className={sp.mine === '1' ? 'link' : 'font-semibold'} href="/activities">Everyone</Link>
            <Link className={sp.mine === '1' ? 'font-semibold' : 'link'} href="/activities?mine=1">Mine</Link>
          </div>}>
          {!data?.length ? <Empty>No activities yet.</Empty> : (
            <ul className="divide-y divide-stone-100">
              {data.map((a) => (
                <li key={a.id} className="py-3 text-sm">
                  <p className="flex flex-wrap items-center gap-2"><Badge>{label(a.type)}</Badge>
                    <Link className="link" href={`/accounts/${a.account_id}?tab=activity`}>{(a.accounts as unknown as { name: string } | null)?.name}</Link>
                    <span className="text-xs text-stone-600">{fmtDateTime(a.occurred_at)} · {names.get(a.created_by) ?? '—'}</span></p>
                  <p className="mt-1 whitespace-pre-wrap">{a.summary}</p>
                  {a.next_step && <p className="text-xs"><strong>Next:</strong> {a.next_step}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  )
}
