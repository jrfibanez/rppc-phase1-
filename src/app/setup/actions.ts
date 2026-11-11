'use server'
import { timingSafeEqual } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { passwordProblems } from '@/lib/validation/schemas'
import type { ActionState } from '@/lib/action'

const schema = z.object({
  token: z.string().min(1),
  email: z.string().trim().toLowerCase().email(),
  full_name: z.string().trim().min(2).max(120),
  password: z.string(),
  confirm: z.string(),
}).strip()

function tokenOk(given: string) {
  const expected = process.env.SETUP_TOKEN ?? ''
  if (expected.length < 24) return false
  const a = Buffer.from(given), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function ownerCount() {
  const { count, error } = await supabaseAdmin().from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner')
  if (error) throw new Error(error.message)
  return count ?? 0
}

/** Creates the very first owner. Works only while no owner exists and with the SETUP_TOKEN. */
export async function createFirstOwner(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(fd))
  if (!parsed.success) return { error: 'Fill in every field.' }
  const input = parsed.data
  if (!tokenOk(input.token)) return { error: 'Setup link is invalid.' }
  if (input.password !== input.confirm) return { error: 'Passwords do not match.' }
  const problem = passwordProblems(input.password, input.email)
  if (problem) return { error: problem }

  const admin = supabaseAdmin()
  if ((await ownerCount()) > 0) return { error: 'Setup is already complete. Sign in instead.' }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name },
  })
  if (error || !data.user) return { error: error?.message ?? 'Could not create user' }
  const { error: pErr } = await admin.from('profiles').insert({
    id: data.user.id, full_name: input.full_name, role: 'owner', must_change_password: false,
  })
  if (pErr) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: pErr.message }
  }
  redirect('/login')
}
