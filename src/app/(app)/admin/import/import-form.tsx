'use client'
import { startTransition, useActionState, useRef, useState } from 'react'
import { runImport, type ImportReport } from './actions'

const TEMPLATES: Record<string, { cols: string; note: string }> = {
  accounts: { cols: 'name,legal_name,segment,status,lead_source,billing_cutoff_day,lock_in_months,notes', note: 'segment: warehouse, distributor, manufacturer, fmcg, 3pl, other · status: prospect, active, inactive · lead_source: cold_call, referral, direct_visit, inbound, website, facebook, event, other · billing_cutoff_day defaults to 10. You become the owner of imported accounts.' },
  contacts: { cols: 'account_code,full_name,job_title,department,email,mobile,is_primary', note: 'account_code is the CUS-00001 code (import or create accounts first). is_primary: yes/no. Duplicates are matched by email (or name) within the account.' },
  sites: { cols: 'account_code,name,region,province,city,address,receiving_hours', note: 'region: luzon, visayas, mindanao (default luzon). Duplicates are matched by site name within the account.' },
}

export function ImportForm() {
  const [report, action, pending] = useActionState<ImportReport | null, FormData>(runImport, null)
  const [entity, setEntity] = useState('accounts')
  const form = useRef<HTMLFormElement>(null)
  const t = TEMPLATES[entity]
  const download = () => {
    const blob = new Blob([t.cols + '\r\n'], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `rppc-${entity}-template.csv`; a.click()
  }
  return (
    <div className="space-y-4">
      {/* onSubmit (not action=) so React does not reset the file input between dry run and import */}
      <form ref={form} className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        if (submitter?.value === 'commit' && !confirm('Import these rows now?')) return
        const fd = new FormData(e.currentTarget, submitter)
        startTransition(() => action(fd))
      }}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label htmlFor="entity" className="label">Import</label>
            <select id="entity" name="entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="input">
              <option value="accounts">Accounts</option><option value="contacts">Contacts</option><option value="sites">Sites</option>
            </select></div>
          <div><label htmlFor="file" className="label">CSV file (max 5 MB, 5,000 rows)</label><input id="file" name="file" type="file" accept=".csv,text/csv" required className="input py-2" /></div>
          <div><label htmlFor="duplicates" className="label">When a duplicate is found</label>
            <select id="duplicates" name="duplicates" className="input" defaultValue="skip"><option value="skip">Skip it (keep existing)</option><option value="update">Update the existing record</option></select></div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3 text-xs text-stone-700">
          <p><strong>Columns:</strong> <code>{t.cols}</code> <button type="button" onClick={download} className="link ml-2">Download template</button></p>
          <p className="mt-1">{t.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="mode" value="dry" className="btn-secondary" disabled={pending}>{pending ? 'Checking…' : '1. Dry run (no changes)'}</button>
          <button type="submit" name="mode" value="commit" className="btn-primary" disabled={pending || !report?.ok || report.committed || report.entity !== entity}>2. Import</button>
        </div>
      </form>
      {report && (
        <div className="card p-4 text-sm" role="status">
          {report.error && <p className="mb-2 rounded bg-red-50 px-3 py-2 text-red-800">{report.error}</p>}
          {report.committed && <p className="mb-2 rounded bg-green-50 px-3 py-2 text-green-800">Imported. Logged in the audit log.</p>}
          {(report.ok || report.errors.length > 0) && (
            <p><strong>{report.committed ? 'Result' : 'Dry run'}:</strong> will create {report.create} · update {report.update} · skip {report.skip} · {report.errors.length} error(s){report.fileName ? ` · ${report.fileName}` : ''}</p>
          )}
          {report.errors.length > 0 && (
            <details open className="mt-2"><summary className="cursor-pointer font-medium text-red-800">Row errors</summary>
              <ul className="mt-1 max-h-60 overflow-auto text-xs">{report.errors.slice(0, 200).map((e, i) => <li key={i}>Row {e.row}: {e.message}</li>)}</ul></details>
          )}
          {report.duplicates.length > 0 && (
            <details className="mt-2"><summary className="cursor-pointer font-medium">Possible duplicates ({report.duplicates.length})</summary>
              <ul className="mt-1 max-h-60 overflow-auto text-xs">{report.duplicates.slice(0, 200).map((d, i) => <li key={i}>Row {d.row}: “{d.name}” matches existing “{d.match}” ({Math.round(d.score * 100)}%)</li>)}</ul></details>
          )}
          {!report.committed && report.ok && <p className="mt-2 text-xs text-stone-600">Keep the same file selected and press Import to commit.</p>}
        </div>
      )}
    </div>
  )
}
