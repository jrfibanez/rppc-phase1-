'use client'
import * as queue from '@/lib/offline/queue'
import * as offlineDb from '@/lib/offline/db'
import { useEffect, useMemo, useState } from 'react'
import { ACTIVITY_TYPES, label } from '@/lib/labels'

type Opt = { id: string; name: string; code?: string }

/**
 * Offline-first activity logger. Writes go to the IndexedDB outbox first, then sync to /api/sync,
 * so a visit logged without signal is saved and sent exactly once when the phone reconnects.
 */
export function ActivityForm({ fixedAccount }: { fixedAccount?: Opt }) {
  const [accounts, setAccounts] = useState<Opt[]>([])
  const [accountId, setAccountId] = useState(fixedAccount?.id ?? '')
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<Opt[]>([])
  const [sites, setSites] = useState<Opt[]>([])
  const [opps, setOpps] = useState<Opt[]>([])
  const [type, setType] = useState<string>('visit')
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null)
  const [geoMsg, setGeoMsg] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (fixedAccount) return
    Promise.resolve(offlineDb).then(async ({ db }) => {
      setAccounts(await db.accounts.orderBy('name').toArray())      // cached list first (works offline)
      if (navigator.onLine) {                                         // then refresh so new accounts appear
        await queue.refreshSnapshot().catch(() => {})
        setAccounts(await db.accounts.orderBy('name').toArray())
      }
    }).catch(() => {})
  }, [fixedAccount])

  useEffect(() => {
    if (!accountId) { setContacts([]); setSites([]); setOpps([]); return }
    Promise.resolve(offlineDb).then(async ({ db }) => {
      const [c, s, o] = await Promise.all([
        db.contacts.where('account_id').equals(accountId).toArray(),
        db.sites.where('account_id').equals(accountId).toArray(),
        db.opportunities.where('account_id').equals(accountId).toArray(),
      ])
      if (!c.length && !s.length && navigator.onLine) {
        // Account opened online but not yet in snapshot: refresh once.
        await queue.refreshSnapshot().catch(() => {})
      }
      const [c2, s2, o2] = await Promise.all([
        db.contacts.where('account_id').equals(accountId).toArray(),
        db.sites.where('account_id').equals(accountId).toArray(),
        db.opportunities.where('account_id').equals(accountId).toArray(),
      ])
      setContacts((c2.length ? c2 : c).map((x) => ({ id: x.id, name: x.full_name })))
      setSites((s2.length ? s2 : s).map((x) => ({ id: x.id, name: x.name })))
      setOpps((o2.length ? o2 : o).map((x) => ({ id: x.id, name: x.title })))
    }).catch(() => {})
  }, [accountId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const l = (q ? accounts.filter((a) => a.name.toLowerCase().includes(q) || a.code?.toLowerCase().startsWith(q)) : accounts).slice(0, 50)
    const sel = accounts.find((a) => a.id === accountId)
    return sel && !l.some((a) => a.id === sel.id) ? [sel, ...l] : l
  }, [accounts, query])

  function stampLocation() {
    if (!('geolocation' in navigator)) { setGeoMsg('Location not available on this device'); return }
    setGeoMsg('Getting location…')
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); setGeoMsg('Location added') },
      () => setGeoMsg('Could not get location'), { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget                 // capture before any await (React clears currentTarget)
    const fd = new FormData(form)
    const s = (k: string) => { const v = String(fd.get(k) ?? '').trim(); return v || null }
    if (!accountId) { setMsg({ ok: false, text: 'Choose an account.' }); return }
    const summary = s('summary') ?? ''
    if (summary.length < 3) { setMsg({ ok: false, text: 'Write a short summary (3+ characters).' }); return }
    const occurredLocal = s('occurred_at')
    setBusy(true)
    try {
      const { enqueue } = queue
      const accountName = fixedAccount?.name ?? accounts.find((a) => a.id === accountId)?.name ?? 'account'
      const next = s('next_step')
      await enqueue('activity', {
        type, account_id: accountId, contact_id: s('contact_id'), site_id: s('site_id'), opportunity_id: s('opportunity_id'),
        summary, next_step: next,
        ...(occurredLocal ? { occurred_at: new Date(occurredLocal + ':00+08:00').toISOString() } : {}),
        ...(geo ? { lat: geo.lat, lng: geo.lng } : {}),
      }, `${label(type)} · ${accountName}`)
      if (next && fd.get('make_task') === 'on') {
        const due = s('task_due')
        const me = document.querySelector<HTMLMetaElement>('meta[name="rppc-user"]')?.content
        if (me) await enqueue('task', {
          title: next.slice(0, 300), assigned_to: me, account_id: accountId,
          due_at: due ? new Date(due + 'T17:00:00+08:00').toISOString() : null,
        }, `Follow-up · ${accountName}`)
      }
      form.reset(); setGeo(null); setGeoMsg('')
      if (!fixedAccount) setAccountId('')
      setMsg({ ok: true, text: navigator.onLine ? 'Saved. Syncing…' : 'Saved on this device. It will sync when you are back online.' })
    } catch (err) {
      setMsg({ ok: false, text: `Could not save: ${(err as Error).message}` })
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset>
        <legend className="label">Type</legend>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t} className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border px-3 text-sm ${type === t ? 'border-brand-600 bg-brand-50 font-medium text-brand-700' : 'border-stone-300 bg-white'}`}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="sr-only" />{label(t)}
            </label>
          ))}
        </div>
      </fieldset>
      {!fixedAccount && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="acct-q" className="label">Find account</label>
            <input id="acct-q" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type to filter" className="input" />
          </div>
          <div>
            <label htmlFor="account_id" className="label">Account *</label>
            <select id="account_id" required value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input">
              <option value="">{accounts.length ? 'Choose…' : 'No accounts cached yet'}</option>
              {filtered.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
            </select>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <OptSelect name="contact_id" label="Contact" opts={contacts} />
        <OptSelect name="site_id" label="Site" opts={sites} />
        <OptSelect name="opportunity_id" label="Opportunity" opts={opps} />
      </div>
      <div>
        <label htmlFor="summary" className="label">What happened? *</label>
        <textarea id="summary" name="summary" required minLength={3} maxLength={4000} rows={3} className="input" placeholder="e.g. Presented ECR lease terms to warehouse head; brochure given." />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="next_step" className="label">Next step</label>
          <input id="next_step" name="next_step" maxLength={500} className="input" placeholder="e.g. Send proposal by Friday" />
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="make_task" className="size-5" /> Make this a follow-up task due <input type="date" name="task_due" aria-label="Task due date" className="input w-auto min-h-9 py-1" /></label>
        </div>
        <div>
          <label htmlFor="occurred_at" className="label">When (leave blank for now)</label>
          <input id="occurred_at" name="occurred_at" type="datetime-local" className="input" />
        </div>
      </div>
      {type === 'visit' && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button type="button" className="btn-secondary" onClick={stampLocation}>Add my location</button>
          <span role="status" className="text-stone-700">{geoMsg}{geo && ` (${geo.lat}, ${geo.lng})`}</span>
        </div>
      )}
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.text}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save activity'}</button>
    </form>
  )
}

function OptSelect({ name, label: l, opts }: { name: string; label: string; opts: Opt[] }) {
  return (
    <div>
      <label htmlFor={name} className="label">{l}</label>
      <select id={name} name={name} className="input" defaultValue="">
        <option value="">—</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  )
}
