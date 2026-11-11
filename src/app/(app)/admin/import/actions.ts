'use server'
import Papa from 'papaparse'
import { revalidatePath } from 'next/cache'
import type { ZodTypeAny } from 'zod'
import { requireUser } from '@/lib/auth/require-role'
import { importAccountRow, importContactRow, importSiteRow } from '@/lib/validation/schemas'
import { rateLimit } from '@/lib/rate-limit'

export type ImportReport = {
  ok: boolean; error?: string; committed?: boolean; entity?: string; fileName?: string
  create: number; update: number; skip: number
  errors: { row: number; message: string }[]
  duplicates: { row: number; name: string; match: string; score: number }[]
}
const empty = (): ImportReport => ({ ok: false, create: 0, update: 0, skip: 0, errors: [], duplicates: [] })
const MAX_ROWS = 5000, MAX_BYTES = 5 * 1024 * 1024
const SCHEMAS: Record<string, ZodTypeAny> = { accounts: importAccountRow, contacts: importContactRow, sites: importSiteRow }

export async function runImport(_: ImportReport | null, fd: FormData): Promise<ImportReport> {
  const report = empty()
  try {
    const { supabase, user } = await requireUser('import:run')
    if (!rateLimit(`import:${user.id}`, 20, 60_000)) return { ...report, error: 'Too many imports; wait a minute.' }
    const entity = String(fd.get('entity'))
    const mode = fd.get('mode') === 'commit' ? 'commit' : 'dry'
    const dupMode = fd.get('duplicates') === 'update' ? 'update' : 'skip'
    const file = fd.get('file')
    if (!SCHEMAS[entity]) return { ...report, error: 'Choose what to import.' }
    if (!(file instanceof File) || file.size === 0) return { ...report, error: 'Choose a CSV file.' }
    if (file.size > MAX_BYTES) return { ...report, error: 'File is larger than 5 MB.' }
    report.entity = entity; report.fileName = file.name

    const parsed = Papa.parse<Record<string, string>>(await file.text(), {
      header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'),
    })
    if (parsed.errors.length) report.errors.push(...parsed.errors.slice(0, 50).map((e) => ({ row: (e.row ?? 0) + 2, message: e.message })))
    const raw = parsed.data
    if (raw.length > MAX_ROWS) return { ...report, error: `Too many rows (${raw.length}). Max ${MAX_ROWS}.` }
    if (!raw.length) return { ...report, error: 'The file has no data rows.' }

    // 1) Validate rows
    const valid: { row: number; data: Record<string, unknown> }[] = []
    raw.forEach((r, i) => {
      const res = SCHEMAS[entity].safeParse(r)
      if (res.success) valid.push({ row: i + 2, data: res.data as Record<string, unknown> })
      else report.errors.push({ row: i + 2, message: res.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`).join('; ') })
    })

    // 2) Resolve references & duplicates
    const toInsert: Record<string, unknown>[] = []
    const toUpdate: Record<string, unknown>[] = []
    if (entity === 'accounts') {
      const names = valid.map((v) => String(v.data.name))
      const { data: matches, error } = await supabase.rpc('match_account_names', { names })
      if (error) throw new Error(error.message)
      const byName = new Map<string, { account_id: string; account_name: string; score: number }>()
      for (const m of matches ?? []) if (!byName.has(m.input_name)) byName.set(m.input_name, m)
      const seen = new Set<string>()
      for (const v of valid) {
        const key = String(v.data.name).trim().toLowerCase()
        if (seen.has(key)) { report.errors.push({ row: v.row, message: 'Duplicate name within the file' }); continue }
        seen.add(key)
        const m = byName.get(String(v.data.name))
        if (m) {
          report.duplicates.push({ row: v.row, name: String(v.data.name), match: m.account_name, score: Math.round(m.score * 100) / 100 })
          if (dupMode === 'update') toUpdate.push({ id: m.account_id, ...v.data }); else report.skip++
        } else toInsert.push({ ...v.data, owner_id: user.id })
      }
    } else {
      const codes = [...new Set(valid.map((v) => String(v.data.account_code).toUpperCase()))]
      const { data: accts } = await supabase.from('accounts').select('id, code').in('code', codes)
      const idByCode = new Map((accts ?? []).map((a) => [a.code.toUpperCase(), a.id]))
      const accountIds = [...idByCode.values()]
      if (entity === 'contacts') {
        const { data: existing } = await supabase.from('contacts').select('id, account_id, email, full_name, is_primary').in('account_id', accountIds.length ? accountIds : ['00000000-0000-0000-0000-000000000000']).is('archived_at', null)
        const hasPrimary = new Set((existing ?? []).filter((c) => c.is_primary).map((c) => c.account_id))
        const byKey = new Map((existing ?? []).map((c) => [`${c.account_id}|${(c.email ?? c.full_name).toLowerCase()}`, c]))
        for (const v of valid) {
          const account_id = idByCode.get(String(v.data.account_code).toUpperCase())
          if (!account_id) { report.errors.push({ row: v.row, message: `Unknown account_code ${v.data.account_code}` }); continue }
          const { account_code: _c, ...rest } = v.data
          const key = `${account_id}|${String(rest.email ?? rest.full_name).toLowerCase()}`
          const dup = byKey.get(key)
          if (rest.is_primary && hasPrimary.has(account_id) && !(dup?.is_primary)) {
            report.errors.push({ row: v.row, message: 'Account already has a primary contact' }); continue
          }
          if (dup) {
            report.duplicates.push({ row: v.row, name: String(rest.full_name), match: dup.full_name, score: 1 })
            if (dupMode === 'update') toUpdate.push({ id: dup.id, account_id, ...rest }); else report.skip++
            continue
          }
          if (rest.is_primary) hasPrimary.add(account_id)
          byKey.set(key, { id: '', account_id, email: (rest.email as string) ?? null, full_name: String(rest.full_name), is_primary: !!rest.is_primary })
          toInsert.push({ ...rest, account_id })
        }
      } else {
        const { data: existing } = await supabase.from('sites').select('id, account_id, name').in('account_id', accountIds.length ? accountIds : ['00000000-0000-0000-0000-000000000000']).is('archived_at', null)
        const byKey = new Map((existing ?? []).map((s) => [`${s.account_id}|${s.name.toLowerCase()}`, s]))
        for (const v of valid) {
          const account_id = idByCode.get(String(v.data.account_code).toUpperCase())
          if (!account_id) { report.errors.push({ row: v.row, message: `Unknown account_code ${v.data.account_code}` }); continue }
          const { account_code: _c, ...rest } = v.data
          const key = `${account_id}|${String(rest.name).toLowerCase()}`
          const dup = byKey.get(key)
          if (dup) {
            report.duplicates.push({ row: v.row, name: String(rest.name), match: dup.name, score: 1 })
            if (dupMode === 'update' && dup.id) toUpdate.push({ id: dup.id, account_id, ...rest }); else report.skip++
            continue
          }
          byKey.set(key, { id: '', account_id, name: String(rest.name) })
          toInsert.push({ ...rest, account_id })
        }
      }
    }
    report.create = toInsert.length
    report.update = toUpdate.length

    if (mode === 'dry') return { ...report, ok: true }
    if (report.errors.length) return { ...report, error: 'Fix the row errors (or remove those rows) before importing.' }

    // 3) Commit. New rows go in one INSERT statement (all-or-nothing); updates go in one UPSERT statement.
    if (toInsert.length) {
      const { error } = await supabase.from(entity).insert(toInsert, { defaultToNull: false })
      if (error) return { ...report, error: `Nothing was imported: ${error.message}` }
    }
    if (toUpdate.length) {
      const { error } = await supabase.from(entity).upsert(toUpdate, { onConflict: 'id' })
      if (error) return { ...report, committed: toInsert.length > 0, error: `New rows were imported, but updating existing records failed: ${error.message}` }
    }
    await supabase.rpc('log_import', { p_entity: entity, p_file_name: file.name.slice(0, 200), p_counts: { created: report.create, updated: report.update, skipped: report.skip } })
    revalidatePath('/accounts')
    return { ...report, ok: true, committed: true }
  } catch (e) {
    return { ...report, error: (e as Error).message }
  }
}
