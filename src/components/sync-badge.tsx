'use client'
import * as queue from '@/lib/offline/queue'
import * as offlineDb from '@/lib/offline/db'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Item = { client_uuid: string; label: string; status: string; last_error?: string; kind: string }

export function SyncBadge() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [online, setOnline] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    let alive = true
    let lastCount = 0
    ;(async () => {
      const { db } = offlineDb; const q = queue
      const load = async () => {
        const all = await db.outbox.orderBy('created_at').toArray()
        if (!alive) return
        if (all.length < lastCount) router.refresh()       // something synced: refresh server data
        lastCount = all.length
        setItems(all)
      }
      unsub = q.onOutboxChange(() => void load())
      q.startSyncLoop()
      void load()
      // Keep the offline snapshot fresh (at most every 10 minutes).
      const meta = await db.meta.get('snapshot_at')
      if (!meta || Date.now() - Number(meta.value) > 600_000) void q.refreshSnapshot()
    })().catch(() => {})
    const on = () => setOnline(navigator.onLine)
    on()
    window.addEventListener('online', on); window.addEventListener('offline', on)
    return () => { alive = false; unsub(); window.removeEventListener('online', on); window.removeEventListener('offline', on) }
  }, [router])

  const pending = items.filter((i) => i.status === 'pending').length
  const failed = items.filter((i) => i.status === 'failed').length
  if (online && items.length === 0) return null

  return (
    <div className={`sticky top-14 z-20 border-b px-4 py-2 text-sm lg:top-0 ${failed ? 'border-red-200 bg-red-50 text-red-900' : online ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span role="status">
          {!online && 'Offline. '}
          {pending > 0 && `${pending} waiting to sync. `}
          {failed > 0 && `${failed} need attention.`}
          {online && pending === 0 && failed === 0 && 'All changes synced.'}
        </span>
        {items.length > 0 && <button type="button" className="font-medium underline" onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Details'}</button>}
      </div>
      {open && (
        <ul className="mx-auto mt-2 max-w-6xl space-y-1">
          {items.map((i) => (
            <li key={i.client_uuid} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white/70 px-2 py-1">
              <span><strong className="capitalize">{i.kind.replace('_', ' ')}</strong>: {i.label} <em className="text-xs">({i.status}{i.last_error ? `: ${i.last_error}` : ''})</em></span>
              {i.status === 'failed' && (
                <span className="flex gap-2">
                  <button type="button" className="underline" onClick={async () => queue.retryFailed()}>Retry</button>
                  <button type="button" className="underline" onClick={async () => { if (confirm('Discard this item?')) queue.discard(i.client_uuid) }}>Discard</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
