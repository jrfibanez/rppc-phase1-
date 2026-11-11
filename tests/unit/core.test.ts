import { describe, expect, it } from 'vitest'
import { can, ROLES, PERMISSIONS, type Action } from '@/lib/auth/permissions'
import { activitySchema, opportunitySchema, ticketUpdateSchema, passwordProblems, importAccountRow, financeSchema } from '@/lib/validation/schemas'
import { nextDelay, BACKOFF, MAX_ATTEMPTS } from '@/lib/offline/backoff'
import { sniffMime, safeFileName } from '@/lib/files/magic'
import { toCsv } from '@/lib/csv'
import { fmtCountdown, manilaLocalToIso, isoToManilaLocal } from '@/lib/format'

describe('permission map (mirrors §3.2)', () => {
  it('denies everything to non-CRM roles', () => {
    for (const r of ['purchasing', 'hr', 'production_officer', 'qc', 'driver', 'helper', 'pallet_maker', 'painter'] as const)
      for (const a of Object.keys(PERMISSIONS) as Action[]) expect(can(r, a), `${r} ${a}`).toBe(false)
  })
  it('matches key matrix cells', () => {
    expect(can('sales_rep', 'account:create')).toBe(true)
    expect(can('sales_rep', 'account:archive')).toBe(false)
    expect(can('sales_rep', 'account:finance:read')).toBe(false)
    expect(can('csr', 'contact:create')).toBe(true)
    expect(can('csr', 'contact:update')).toBe(false)
    expect(can('ops_manager', 'account:accredit')).toBe(true)
    expect(can('deployment_officer', 'opportunity:read')).toBe(false)
    expect(can('finance', 'opportunity:read')).toBe(false)
    expect(can('finance', 'account:finance:write')).toBe(true)
    expect(can('sales_manager', 'account:finance:write')).toBe(false)
    expect(can('sales_manager', 'user:manage')).toBe(false)
    expect(can('admin', 'user:manage')).toBe(true)
    expect(can('admin', 'audit:read')).toBe(true)
    expect(can('sales_manager', 'import:run')).toBe(true)
    expect(can(null, 'account:read')).toBe(false)
  })
  it('owner can do everything', () => {
    for (const a of Object.keys(PERMISSIONS) as Action[]) expect(can('owner', a)).toBe(true)
    expect(ROLES).toHaveLength(17)
  })
})

describe('schemas', () => {
  const base = { client_uuid: crypto.randomUUID(), type: 'visit', account_id: crypto.randomUUID(), summary: 'Visited DC' }
  it('activity: accepts valid, strips nothing unknown (strict)', () => {
    expect(activitySchema.parse(base).summary).toBe('Visited DC')
    expect(() => activitySchema.parse({ ...base, created_by: crypto.randomUUID() })).toThrow()
    expect(() => activitySchema.parse({ ...base, summary: 'ok' })).toThrow()
    expect(() => activitySchema.parse({ ...base, lat: 91 })).toThrow()
  })
  it('opportunity: lost needs reason (BR-4)', () => {
    const o = { account_id: crypto.randomUUID(), title: 'Deal', stage: 'lost' }
    expect(() => opportunitySchema.parse(o)).toThrow()
    expect(opportunitySchema.parse({ ...o, lost_reason: 'Price' }).lost_reason).toBe('Price')
  })
  it('ticket: resolve needs note (BR-5)', () => {
    const t = { id: crypto.randomUUID(), status: 'resolved', priority: 'normal', category: 'billing', assigned_to: '' }
    expect(() => ticketUpdateSchema.parse(t)).toThrow()
    expect(ticketUpdateSchema.parse({ ...t, resolution_note: 'Fixed' }).assigned_to).toBeNull()
  })
  it('password rules', () => {
    expect(passwordProblems('short', 'a@b.c')).toMatch(/12/)
    expect(passwordProblems('juan.delacruz-2026!', 'juan.delacruz@rppc.ph')).toMatch(/email/)
    expect(passwordProblems('pallets fly at dawn', 'juan@rppc.ph')).toBeNull()
  })
  it('TIN format', () => {
    expect(financeSchema.parse({ tin: '123-456-789-00000' }).tin).toBe('123-456-789-00000')
    expect(() => financeSchema.parse({ tin: '12-34' })).toThrow()
  })
  it('CSV account row normalizes enums and defaults', () => {
    const r = importAccountRow.parse({ name: 'ABC Logistics', segment: '3PL', status: '', lead_source: 'Cold Call', billing_cutoff_day: '' })
    expect(r).toMatchObject({ segment: 'third_party_logistics', status: 'prospect', lead_source: 'cold_call', billing_cutoff_day: 10 })
  })
})

describe('offline backoff', () => {
  it('follows 5s,15s,60s,5min then stays at 5min; max 10 attempts', () => {
    expect([1, 2, 3, 4, 5, 9].map(nextDelay)).toEqual([5000, 15000, 60000, 300000, 300000, 300000])
    expect(BACKOFF).toHaveLength(4)
    expect(MAX_ATTEMPTS).toBe(10)
  })
})

describe('file checks', () => {
  const b = (...x: number[]) => new Uint8Array([...x, ...new Array(16).fill(0)])
  it('sniffs real types, rejects disguised files', () => {
    expect(sniffMime(b(0x25, 0x50, 0x44, 0x46, 0x2d), 'x.pdf')).toBe('application/pdf')
    expect(sniffMime(b(0xff, 0xd8, 0xff), 'x.jpg')).toBe('image/jpeg')
    expect(sniffMime(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'x.png')).toBe('image/png')
    expect(sniffMime(new TextEncoder().encode('<script>alert(1)</script>'), 'evil.pdf')).toBeNull()
    expect(sniffMime(new TextEncoder().encode('MZ\x90\x00'), 'x.png')).toBeNull()
  })
  it('sanitizes file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('etcpasswd')
    expect(safeFileName('Conforme (signed).pdf')).toBe('Conforme_signed.pdf')
  })
})

describe('csv + time', () => {
  it('escapes and blocks formula injection', () => {
    const out = toCsv([{ a: '=HYPERLINK("x")', b: 'a,b' }], ['a', 'b'])
    expect(out).toContain(`"'=HYPERLINK(""x"")"`)
    expect(out).toContain('"a,b"')
  })
  it('Manila time conversions', () => {
    expect(manilaLocalToIso('2026-11-11T09:00')).toBe('2026-11-11T01:00:00.000Z')
    expect(isoToManilaLocal('2026-11-11T01:00:00.000Z')).toBe('2026-11-11T09:00')
    const now = Date.parse('2026-11-11T00:00:00Z')
    expect(fmtCountdown('2026-11-11T02:30:00Z', now)).toBe('in 2h 30m')
    expect(fmtCountdown('2026-11-10T23:00:00Z', now)).toBe('1h 0m overdue')
  })
})
