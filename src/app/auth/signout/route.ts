import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const origin = new URL(req.url).origin
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) {
    return NextResponse.json({ error: 'bad origin' }, { status: 403 })
  }
  const supabase = await createClient()
  await supabase.auth.signOut()
  const res = NextResponse.redirect(new URL('/login?cleared=1', req.url), { status: 303 })
  res.cookies.delete('rppc_start')
  res.cookies.delete('rppc_last')
  // Tells the browser to drop cached pages and storage for this origin (offline cache, outbox).
  res.headers.set('Clear-Site-Data', '"cache", "storage"')
  return res
}
