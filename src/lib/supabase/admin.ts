import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

export const hasServiceKey = () => !!process.env.SUPABASE_SERVICE_ROLE_KEY

export const supabaseAdmin = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Vercel → Settings → Environment Variables.')
  return createClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
