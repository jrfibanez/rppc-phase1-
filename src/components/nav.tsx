'use client'
import * as queue from '@/lib/offline/queue'
import * as offlineDb from '@/lib/offline/db'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

export type NavItem = { href: string; label: string }

export function Nav({ items, user, role }: { items: NavItem[]; user: string; role: string }) {
  const path = usePathname()
  const [open, setOpen] = useState(false)
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'))
  const links = (
    <ul className="space-y-1">
      {items.map((i) => (
        <li key={i.href}>
          <Link href={i.href} onClick={() => setOpen(false)} aria-current={active(i.href) ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${active(i.href) ? 'bg-brand-50 text-brand-700' : 'text-stone-700 hover:bg-stone-100'}`}>
            {i.label}
          </Link>
        </li>
      ))}
    </ul>
  )
  const footer = (
    <div className="border-t border-stone-200 pt-3 text-sm">
      <p className="truncate px-3 font-medium text-stone-900">{user}</p>
      <p className="px-3 text-xs text-stone-600">{role}</p>
      <div className="mt-2 flex gap-1">
        <Link href="/account/password" className="btn-ghost flex-1 text-xs">Password</Link>
        <SignOutButton />
      </div>
    </div>
  )
  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4 lg:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">R</span>RPPC OS</Link>
        <button type="button" className="btn-ghost" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>{open ? 'Close' : 'Menu'}</button>
      </header>
      {open && (
        <div id="mobile-nav" className="fixed inset-x-0 top-14 bottom-0 z-30 overflow-y-auto bg-white p-4 lg:hidden">{links}<div className="mt-4">{footer}</div></div>
      )}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-stone-200 bg-white p-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2 font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">R</span>RPPC OS</Link>
        <nav aria-label="Main" className="flex-1 overflow-y-auto">{links}</nav>
        {footer}
      </aside>
    </>
  )
}

function SignOutButton() {
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    try {
      const { db } = offlineDb
      const pending = await db.outbox.count()
      if (pending > 0 && !confirm(`${pending} item(s) have not synced yet and will be lost if you sign out. Sign out anyway?`)) {
        e.preventDefault(); return
      }
      const { clearLocalData } = offlineDb
      await clearLocalData()
    } catch { /* storage unavailable: nothing to clear */ }
  }
  return (
    <form action="/auth/signout" method="post" onSubmit={onSubmit} className="flex-1">
      <button type="submit" className="btn-ghost w-full text-xs">Sign out</button>
    </form>
  )
}
