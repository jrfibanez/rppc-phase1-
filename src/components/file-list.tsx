import type { SupabaseClient } from '@supabase/supabase-js'
import { Empty } from '@/components/ui'
import { Uploader } from '@/components/uploader'
import { fmtDateTime } from '@/lib/format'

export async function FileList({ supabase, entityType, entityId, canUpload }: {
  supabase: SupabaseClient; entityType: 'account' | 'opportunity' | 'ticket' | 'activity'; entityId: string; canUpload: boolean
}) {
  const { data } = await supabase.from('attachments').select('id, file_name, mime_type, size_bytes, created_at')
    .eq('entity_type', entityType).eq('entity_id', entityId).order('created_at', { ascending: false })
  return (
    <div className="space-y-3">
      {canUpload && <Uploader entityType={entityType} entityId={entityId} />}
      {(data ?? []).length === 0 ? <Empty>No files yet.</Empty> : (
        <ul className="divide-y divide-stone-100">
          {data!.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <a className="link break-all" href={`/api/files/${f.id}`} target="_blank" rel="noopener">{f.file_name}</a>
              <span className="text-xs text-stone-600">{(f.size_bytes / 1024).toFixed(0)} KB · {fmtDateTime(f.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
