'use server'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { passwordProblems } from '@/lib/validation/schemas'
import type { ActionState } from '@/lib/action'

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const current = String(fd.get('current') ?? '')
  const password = String(fd.get('password') ?? '')
  const confirm = String(fd.get('confirm') ?? '')
  if (password !== confirm) return { error: 'The two new passwords do not match.' }
  const problem = passwordProblems(password, user.email)
  if (problem) return { error: problem }
  if (password === current) return { error: 'Choose a password different from the current one.' }

  // Re-authenticate with the current password before changing it.
  const { error: reErr } = await supabase.auth.signInWithPassword({ email: user.email!, password: current })
  if (reErr) return { error: 'Current password is incorrect.' }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (/weak|pwned|leaked/i.test(error.message)) return { error: 'That password appears in known data breaches. Choose a different one.' }
    return { error: error.message }
  }
  // must_change_password can only be cleared by trusted server code.
  try {
    const { error: pErr } = await supabaseAdmin().from('profiles').update({ must_change_password: false }).eq('id', user.id)
    if (pErr) return { error: pErr.message }
  } catch (e) {
    return { error: (e as Error).message }
  }
  redirect('/')
}
