'use client'
import * as queue from '@/lib/offline/queue'
import * as offlineDb from '@/lib/offline/db'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TICKET_CATEGORIES, TICKET_CHANNELS, TICKET_PRIORITIES, label } from '@/lib/labels'

type Opt = { id: string; name: string; code?: string }

/** Offline-capable ticket intake: saved to the outbox first, then synced (idempotent on client_uuid). */
export function TicketForm({ staff, defaultAccount }: { staff: { id: string; full_name: string }[]; defaultAccount?: string }) {
  const router = useRouter()
  const [accounts, setAccounts] = useState<Opt[]>([])
  const [accountId, setAccountId] = useState(defaultAccount ?? '')
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Opt[]>([])
  const [sites, setSites] = useState<Opt[]>([])
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.resolve(offlineDb).then(async ({ db }) => {
      setAccounts(await db.accounts.orderBy('name').toArray())
      if (navigator.onLine) { await queue.refreshSnapshot().catch(() => {}); setAccounts(await db.accounts.orderBy('name').toArray()) }
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!accountId) { setContacts([]); setSites([]); return }
    Promise.resolve(offlineDb).then(async ({ db }) => {
      setContacts((await db.contacts.where('account_id').equals(accountId).toArray()).map((c) => ({ id: c.id, name: c.full_name })))
      setSites((await db.sites.where('account_id').equals(accountId).toArray()).map((s) => ({ id: s.id, name: s.name })))
    }).catch(() => {})
  }, [accountId])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const l = q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.code?.toLowerCase().startsWith(q)) : accounts
    const sel = accounts.find((a) => a.id === accountId) ?? (accountId ? { id: accountId, name: 'Selected account', code: '…' } : undefined)
    return sel && !l.some((a) => a.id === sel.id) ? [sel, ...l.slice(0, 49)] : l.slice(0, 50)
  }, [accounts, query, accountId])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget                 // capture before any await (React clears currentTarget)
    const fd = new FormData(form)
    const s = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v || null }
    if (!accountId) { setMsg({ ok: false, text: 'Choose an account.' }); return }
    const subject = s('subject') ?? ''
    if (subject.length < 3) { setMsg({ ok: false, text: 'Subject needs at least 3 characters.' }); return }
    setBusy(true)
    try {
      const { enqueue, flush } = queue
      const client_uuid = crypto.randomUUID()
      await enqueue('ticket', {
        client_uuid, account_id: accountId, site_id: s('site_id'), contact_id: s('contact_id'),
        channel: s('channel') ?? 'messenger', source_ref: s('source_ref'), category: s('category') ?? 'other',
        priority: s('priority') ?? 'normal', subject, description: s('description'), assigned_to: s('assigned_to'),
      }, subject)
      if (navigator.onLine) {
        await flush(true)
        const { db } = offlineDb
        if (!(await db.outbox.get(client_uuid))) {
          // Synced: open the ticket so screenshots can be attached.
          const res = await fetch(`/api/tickets/by-client/${client_uuid}`)
          if (res.ok) { const { id } = await res.json(); router.push(`/tickets/${id}?created=1`); return }
          router.push('/tickets'); return
        }
      }
      form.reset(); setAccountId(defaultAccount ?? '')
      setMsg({ ok: true, text: 'Saved on this device. The ticket will be created when you are back online. Attach screenshots after it syncs.' })
    } catch (err) { setMsg({ ok: false, text: (err as Error).message }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="acct-q" className="label">Find account</label><input id="acct-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="input" placeholder="Type to filter" /></div>
        <div><label htmlFor="account_id" className="label">Account *</label>
          <select id="account_id" required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
            <option value="">Choose…</option>{filtered.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
          </select></div>
        <Sel name="contact_id" label="Contact" opts={contacts} />
        <Sel name="site_id" label="Site" opts={sites} />
        <Enum name="channel" label="Received via" values={TICKET_CHANNELS} def="messenger" />
        <div><label htmlFor="source_ref" className="label">Thread link / reference</label><input id="source_ref" name="source_ref" className="input" placeholder="Paste the Messenger/WhatsApp link" /></div>
        <Enum name="category" label="Category" values={TICKET_CATEGORIES} def="other" />
        <Enum name="priority" label="Priority" values={TICKET_PRIORITIES} def="normal" />
        <div className="sm:col-span-2"><label htmlFor="subject" className="label">Subject *</label><input id="subject" name="subject" required minLength={3} maxLength={200} className="input" /></div>
        <div className="sm:col-span-2"><label htmlFor="description" className="label">Details</label><textarea id="description" name="description" rows={4} className="input" placeholder="What did the client say? Copy key messages here." /></div>
        <div><label htmlFor="assigned_to" className="label">Assign to</label>
          <select id="assigned_to" name="assigned_to" className="input" defaultValue=""><option value="">Unassigned</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</select></div>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
      <button type="submit" disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Create ticket'}</button>
    </form>
  )
}
function Sel({ name, label: l, opts }: { name: string; label: string; opts: Opt[] }) {
  return <div><label htmlFor={name} className="label">{l}</label><select id={name} name={name} className="input" defaultValue=""><option value="">—</option>{opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
}
function Enum({ name, label: l, values, def }: { name: string; label: string; values: readonly string[]; def: string }) {
  return <div><label htmlFor={name} className="label">{l}</label><select id={name} name={name} className="input" defaultValue={def}>{values.map((v) => <option key={v} value={v}>{label(v)}</option>)}</select></div>
}
