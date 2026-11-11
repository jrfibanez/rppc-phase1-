'use server'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { ActionState } from '@/lib/action'

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128), next: z.string().optional() })

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: 'Enter your email and password.' }
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password })
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { error: 'Too many sign-in attempts. Wait a few minutes and try again, or ask an admin to reset your password.' }
    }
    return { error: 'Email or password is incorrect.' }
  }
  const { data: profile } = await supabase.from('profiles').select('is_active, must_change_password').eq('id', data.user.id).maybeSingle()
  if (!profile?.is_active) {
    await supabase.auth.signOut()
    return { error: 'Your account is disabled or not set up. Contact an administrator.' }
  }
  if (profile.must_change_password) redirect('/account/password')
  const next = parsed.data.next && /^\/(?!\/)[\w\-/?=&.]*$/.test(parsed.data.next) ? parsed.data.next : '/'
  redirect(next)
}
