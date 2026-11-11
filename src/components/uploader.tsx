'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'
import { registerAttachment } from '@/app/(app)/files/actions'

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,application/pdf,image/jpeg,image/png,image/webp'
const MAX = 10 * 1024 * 1024

function safe(name: string) {
  return (name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_').replace(/^\.+/, '') || 'file').slice(-120)
}

export function Uploader({ entityType, entityId }: { entityType: 'account' | 'opportunity' | 'ticket' | 'activity'; entityId: string }) {
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(e.target.files ?? [])]
    if (!files.length) return
    setBusy(true); setMsg(null)
    let okCount = 0
    for (const f of files) {
      if (f.size > MAX) { setMsg({ ok: false, text: `${f.name}: larger than 10 MB` }); continue }
      const path = `${entityType}/${entityId}/${crypto.randomUUID()}-${safe(f.name)}`
      const { error } = await supabaseBrowser().storage.from('crm-attachments').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (error) { setMsg({ ok: false, text: `${f.name}: ${error.message}` }); continue }
      try {
        const r = await registerAttachment({ entity_type: entityType, entity_id: entityId, storage_path: path, file_name: f.name.slice(0, 200) })
        if (!r.ok) { setMsg({ ok: false, text: `${f.name}: ${r.error}` }); continue }
        okCount++
      } catch (err) { setMsg({ ok: false, text: `${f.name}: ${(err as Error).message}` }) }
    }
    setBusy(false)
    if (input.current) input.current.value = ''
    if (okCount) { setMsg((m) => m ?? { ok: true, text: `${okCount} file(s) uploaded.` }); router.refresh() }
  }

  return (
    <div>
      <label className={`btn-secondary cursor-pointer ${busy ? 'pointer-events-none opacity-50' : ''}`}>
        {busy ? 'Uploading…' : 'Attach files'}
        <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={onChange} disabled={busy} />
      </label>
      <p className="mt-1 text-xs text-stone-600">PDF, images, DOCX, XLSX · up to 10 MB each</p>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? 'text-green-800' : 'text-red-800'}`}>{msg.text}</p>}
    </div>
  )
}
