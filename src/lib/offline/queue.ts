'use client'
import { db, type OutboxKind } from './db'
import { MAX_ATTEMPTS, nextDelay } from './backoff'

const listeners = new Set<() => void>()
export const onOutboxChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach((l) => l())

export async function enqueue(kind: OutboxKind, payload: Record<string, unknown>, label: string) {
  const client_uuid = (payload.client_uuid as string) ?? crypto.randomUUID()
  await db.outbox.put({
    client_uuid, kind, label, payload: { ...payload, client_uuid },
    created_at: Date.now(), attempts: 0, next_try_at: 0, status: 'pending',
  })
  notify()
  void flush()                              // try right away; harmless if offline
  return client_uuid
}

let running: Promise<FlushResult> | null = null
export type FlushResult = { sent: number; authError: boolean }

/** Send due outbox items. Concurrent callers share the in-flight run; a forced call runs again after it. */
export async function flush(force = false): Promise<FlushResult> {
  if (running) {
    const r = await running
    if (!force) return r
  }
  if (running) await running
  running = doFlush(force).finally(() => { running = null })
  return running
}

async function doFlush(force: boolean): Promise<FlushResult> {
  const result = { sent: 0, authError: false }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return result
  {
    const due = (await db.outbox.where('status').equals('pending').sortBy('created_at'))
      .filter((i) => force || i.next_try_at <= Date.now())
    for (const item of due) {
      try {
        const res = await fetch('/api/sync', {
          method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ kind: item.kind, payload: item.payload }),
        })
        if (res.ok) { await db.outbox.delete(item.client_uuid); result.sent++; notify(); continue }
        if (res.status === 401 || res.status === 403) throw new Error('auth')   // stop and ask to sign in
        if (res.status >= 400 && res.status < 500) {                           // validation error: do not retry
          const body = await res.json().catch(() => ({}))
          await db.outbox.update(item.client_uuid, { status: 'failed', last_error: String(body.error ?? res.status) })
          notify(); continue
        }
        throw new Error(`server ${res.status}`)
      } catch (e) {
        const isAuth = String(e).includes('auth')
        const attempts = item.attempts + 1
        await db.outbox.update(item.client_uuid, {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          next_try_at: Date.now() + nextDelay(attempts),
          last_error: isAuth ? 'Sign in again to sync' : String(e),
        })
        notify()
        if (isAuth) { result.authError = true; break }
      }
    }
  }
  return result
}

export async function retryFailed() {
  const failed = await db.outbox.where('status').equals('failed').toArray()
  await Promise.all(failed.map((f) => db.outbox.update(f.client_uuid, { status: 'pending', attempts: 0, next_try_at: 0 })))
  notify()
  return flush(true)
}
export async function discard(client_uuid: string) { await db.outbox.delete(client_uuid); notify() }

/** Refresh the read-only snapshot of accounts/contacts/sites used by offline forms. */
export async function refreshSnapshot() {
  if (!navigator.onLine) return
  const res = await fetch('/api/offline-snapshot', { credentials: 'same-origin' })
  if (!res.ok) return
  const data = await res.json()
  await db.transaction('rw', [db.accounts, db.contacts, db.sites, db.opportunities, db.meta], async () => {
    await Promise.all([db.accounts.clear(), db.contacts.clear(), db.sites.clear(), db.opportunities.clear()])
    await db.accounts.bulkPut(data.accounts ?? [])
    await db.contacts.bulkPut(data.contacts ?? [])
    await db.sites.bulkPut(data.sites ?? [])
    await db.opportunities.bulkPut(data.opportunities ?? [])
    await db.meta.put({ key: 'snapshot_at', value: Date.now() })
  })
}

let timer: ReturnType<typeof setInterval> | null = null
export function startSyncLoop() {
  if (typeof window === 'undefined' || timer) return
  window.addEventListener('online', () => { void flush(true); void refreshSnapshot() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void flush() })
  timer = setInterval(() => void flush(), 5_000)
  void flush()
}
