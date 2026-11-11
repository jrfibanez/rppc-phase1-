'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/require-role'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { ENTITY_TYPES, MAX_BYTES, sniffMime } from '@/lib/files/magic'

const BUCKET = 'crm-attachments'
const schema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().uuid(),
  storage_path: z.string().min(10).max(400),
  file_name: z.string().min(1).max(200),
}).strict()

const revalidateFor: Record<string, (id: string) => string> = {
  account: (id) => `/accounts/${id}`, ticket: (id) => `/tickets/${id}`,
  opportunity: () => '/pipeline', activity: () => '/activities',
}

/**
 * The browser uploads straight to the private bucket (Vercel functions cap request bodies at 4.5 MB),
 * then calls this to verify the file and register it. Anything that fails verification is deleted.
 */
export async function registerAttachment(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser('attachment:upload')
  const input = schema.parse(raw)
  const prefix = `${input.entity_type}/${input.entity_id}/`
  if (!input.storage_path.startsWith(prefix) || input.storage_path.includes('..')) return { ok: false, error: 'Invalid path' }

  const admin = supabaseAdmin()
  const remove = () => admin.storage.from(BUCKET).remove([input.storage_path])
  const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(input.storage_path)
  if (dlErr || !blob) return { ok: false, error: 'Upload not found' }
  if (blob.size < 1 || blob.size > MAX_BYTES) { await remove(); return { ok: false, error: 'Files must be 10 MB or smaller.' } }
  const head = new Uint8Array(await blob.slice(0, 64 * 1024).arrayBuffer())
  const mime = sniffMime(head, input.file_name)
  if (!mime) { await remove(); return { ok: false, error: 'Only PDF, JPG, PNG, WebP, DOCX, or XLSX files are allowed.' } }

  // Insert as the user, so RLS confirms they can see the parent record.
  const { error } = await supabase.from('attachments').insert({
    entity_type: input.entity_type, entity_id: input.entity_id, storage_path: input.storage_path,
    file_name: input.file_name, mime_type: mime, size_bytes: blob.size, uploaded_by: user.id,
  })
  if (error) { await remove(); return { ok: false, error: /row-level/.test(error.message) ? 'You cannot attach files to this record.' : error.message } }
  revalidatePath(revalidateFor[input.entity_type](input.entity_id))
  return { ok: true }
}
