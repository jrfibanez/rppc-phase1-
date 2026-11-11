'use server'
import { randomInt } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-role'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { userCreateSchema, userUpdateSchema, uuid } from '@/lib/validation/schemas'
import { toActionError, type ActionState } from '@/lib/action'

/** 16-char temporary password from an unambiguous alphabet. */
function tempPassword() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  return Array.from({ length: 16 }, () => A[randomInt(A.length)]).join('').replace(/(.{4})(?!$)/g, '$1-')
}

export async function createUser(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { profile } = await requireUser('user:manage')
    const input = userCreateSchema.parse(Object.fromEntries(fd))
    if (input.role === 'owner' && profile.role !== 'owner') return { error: 'Only an owner can create an owner.' }
    const admin = supabaseAdmin()
    const password = tempPassword()
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email, password, email_confirm: true, user_metadata: { full_name: input.full_name },
    })
    if (error || !data.user) return { error: /already/i.test(error?.message ?? '') ? 'A user with that email already exists.' : error?.message ?? 'Could not create user' }
    const { error: pErr } = await admin.from('profiles').insert({
      id: data.user.id, full_name: input.full_name, role: input.role, phone: input.phone, must_change_password: true,
    })
    if (pErr) { await admin.auth.admin.deleteUser(data.user.id); return { error: pErr.message } }
    revalidatePath('/admin/users')
    return { ok: true, message: `Created ${input.email}. Temporary password: ${password}. Give it to them privately; they must change it at first sign-in.` }
  } catch (e) { return toActionError(e) }
}

/** Role/status changes run as the signed-in admin so the database guard enforces owner protection. */
export async function updateUser(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, user } = await requireUser('user:manage')
    const input = userUpdateSchema.parse(Object.fromEntries(fd))
    if (input.id === user.id && !input.is_active) return { error: 'You cannot deactivate yourself.' }
    const { data, error } = await supabase.from('profiles').update({ role: input.role, is_active: input.is_active }).eq('id', input.id).select('id')
    if (error) return { error: error.message }
    if (!data?.length) return { error: 'Not allowed.' }
    // Deactivation: revoke sessions now (RLS already denies everything for inactive users).
    const admin = supabaseAdmin()
    await admin.auth.admin.updateUserById(input.id, { ban_duration: input.is_active ? 'none' : '876000h' })
    revalidatePath('/admin/users')
    return { ok: true, message: 'User updated.' }
  } catch (e) { return toActionError(e) }
}

export async function resetPassword(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { supabase, profile } = await requireUser('user:manage')
    const targetId = uuid.parse(id)
    const { data: target } = await supabase.from('profiles').select('role').eq('id', targetId).maybeSingle()
    if (!target) return { ok: false, message: 'User not found.' }
    if (target.role === 'owner' && profile.role !== 'owner') return { ok: false, message: 'Only an owner can reset an owner.' }
    const admin = supabaseAdmin()
    const password = tempPassword()
    const { error } = await admin.auth.admin.updateUserById(targetId, { password })
    if (error) return { ok: false, message: error.message }
    await admin.from('profiles').update({ must_change_password: true }).eq('id', targetId)
    return { ok: true, message: `New temporary password: ${password}` }
  } catch (e) { return { ok: false, message: toActionError(e)?.error ?? 'Failed' } }
}
