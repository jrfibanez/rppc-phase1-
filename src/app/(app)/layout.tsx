import { redirect } from 'next/navigation'
import { Nav, type NavItem } from '@/components/nav'
import { SyncBadge } from '@/components/sync-badge'
import { getSession } from '@/lib/auth/require-role'
import { can, hasCrmAccess } from '@/lib/auth/permissions'
import { label } from '@/lib/labels'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSession()
  if (!user) redirect('/login')
  if (!profile?.is_active) redirect('/login?reason=disabled')
  if (profile.must_change_password) redirect('/account/password')

  const r = profile.role
  const items: NavItem[] = [{ href: '/', label: 'Dashboard' }]
  if (hasCrmAccess(r)) {
    items.push({ href: '/accounts', label: 'Accounts' })
    if (can(r, 'opportunity:read')) items.push({ href: '/pipeline', label: 'Pipeline' })
    items.push({ href: '/activities', label: 'Activities' })
    items.push({ href: '/tasks', label: 'Tasks' })
    items.push({ href: '/tickets', label: 'Tickets' })
  }
  if (can(r, 'user:manage')) items.push({ href: '/admin/users', label: 'Users' })
  if (can(r, 'import:run')) items.push({ href: '/admin/import', label: 'Import' })
  if (can(r, 'settings:manage')) items.push({ href: '/admin/settings', label: 'Settings' })
  if (can(r, 'audit:read')) items.push({ href: '/admin/audit', label: 'Audit log' })

  return (
    <div className="min-h-dvh">
      <meta name="rppc-user" content={profile.id} />
      <Nav items={items} user={profile.full_name} role={label(r)} />
      <div className="lg:pl-60">
        <SyncBadge />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  )
}
