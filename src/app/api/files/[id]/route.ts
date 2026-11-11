import { NextResponse } from 'next/server'
import { requireUser, Forbidden } from '@/lib/auth/require-role'

/** Opens an attachment through a 60-second signed URL, only if the user can read its metadata row. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const { supabase } = await requireUser('attachment:upload')
    const { data: att } = await supabase.from('attachments').select('storage_path, file_name').eq('id', id).maybeSingle()
    if (!att) return NextResponse.json({ error: 'not found' }, { status: 404 })
    // Signed as the user: storage RLS re-checks access to the object.
    const { data, error } = await supabase.storage.from('crm-attachments').createSignedUrl(att.storage_path, 60, { download: att.file_name })
    if (error || !data) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.redirect(data.signedUrl, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Forbidden ? e.message : 'error' }, { status: e instanceof Forbidden ? 403 : 500 })
  }
}
