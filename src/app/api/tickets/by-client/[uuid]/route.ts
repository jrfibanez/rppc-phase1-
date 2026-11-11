import { NextResponse } from 'next/server'
import { requireUser, Forbidden } from '@/lib/auth/require-role'

export async function GET(_req: Request, { params }: { params: Promise<{ uuid: string }> }) {
  try {
    const { uuid } = await params
    if (!/^[0-9a-f-]{36}$/i.test(uuid)) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const { supabase } = await requireUser('ticket:read')
    const { data } = await supabase.from('tickets').select('id').eq('client_uuid', uuid).maybeSingle()
    return data ? NextResponse.json({ id: data.id }) : NextResponse.json({ error: 'not found' }, { status: 404 })
  } catch (e) {
    return NextResponse.json({ error: 'forbidden' }, { status: e instanceof Forbidden ? 403 : 500 })
  }
}
