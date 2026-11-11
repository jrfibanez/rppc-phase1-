import Dexie, { type Table } from 'dexie'

export type OutboxKind = 'activity' | 'ticket' | 'ticket_comment' | 'task'
export interface OutboxItem {
  client_uuid: string            // primary key, doubles as the server idempotency key
  kind: OutboxKind
  payload: Record<string, unknown>
  label: string                  // human-readable summary for the sync list
  created_at: number
  attempts: number
  next_try_at: number
  status: 'pending' | 'failed'
  last_error?: string
}
export type CachedAccount = { id: string; code: string; name: string }
export type CachedContact = { id: string; account_id: string; full_name: string }
export type CachedSite = { id: string; account_id: string; name: string }
export type CachedOpp = { id: string; account_id: string; title: string }

class OfflineDB extends Dexie {
  outbox!: Table<OutboxItem, string>
  accounts!: Table<CachedAccount, string>
  contacts!: Table<CachedContact, string>
  sites!: Table<CachedSite, string>
  opportunities!: Table<CachedOpp, string>
  meta!: Table<{ key: string; value: unknown }, string>
  constructor() {
    super('rppc-os')
    this.version(1).stores({
      outbox: 'client_uuid, status, next_try_at, created_at',
      accounts: 'id, name',
      contacts: 'id, account_id',
      sites: 'id, account_id',
      opportunities: 'id, account_id',
      meta: 'key',
    })
  }
}
export const db = new OfflineDB()
export const clearLocalData = () =>
  Promise.all([db.outbox.clear(), db.accounts.clear(), db.contacts.clear(), db.sites.clear(), db.opportunities.clear(), db.meta.clear()])
