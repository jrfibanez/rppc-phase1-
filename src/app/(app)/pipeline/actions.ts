'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { opportunitySchema, stageMoveSchema, uuid } from '@/lib/validation/schemas'
import { toActionError, throwIf, type ActionState } from '@/lib/action'

export async function createOpportunity(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string
  try {
    const { supabase, user, profile } = await requireUser('opportunity:write')
    const input = opportunitySchema.parse(Object.fromEntries(fd))
    const owner_id = can(profile.role, 'opportunity:reassign') ? input.owner_id ?? user.id : user.id
    const { data, error } = await supabase.from('opportunities').insert({ ...input, owner_id }).select('id').single()
    throwIf(error)
    id = data!.id
  } catch (e) { return toActionError(e) }
  revalidatePath('/pipeline')
  redirect(`/pipeline/${id}`)
}

export async function updateOpportunity(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, profile } = await requireUser('opportunity:write')
    const input = opportunitySchema.parse(Object.fromEntries(fd))
    const patch: Record<string, unknown> = { ...input }
    delete patch.account_id
    if (!can(profile.role, 'opportunity:reassign')) delete patch.owner_id
    const { data, error } = await supabase.from('opportunities').update(patch).eq('id', uuid.parse(id)).select('id')
    throwIf(error)
    if (!data?.length) return { error: 'You can edit only opportunities you own.' }
    revalidatePath(`/pipeline/${id}`); revalidatePath('/pipeline')
    return { ok: true, message: 'Opportunity saved.' }
  } catch (e) { return toActionError(e) }
}

export async function moveStage(raw: { id: string; stage: string; lost_reason?: string | null }): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await requireUser('opportunity:write')
    const input = stageMoveSchema.parse(raw)
    const { data, error } = await supabase.from('opportunities')
      .update({ stage: input.stage, lost_reason: input.stage === 'lost' ? input.lost_reason : null }).eq('id', input.id).select('id')
    throwIf(error)
    if (!data?.length) return { ok: false, error: 'You can move only opportunities you own.' }
    revalidatePath('/pipeline')
    return { ok: true }
  } catch (e) { return { ok: false, error: toActionError(e)?.error } }
}

export async function archiveOpportunity(id: string) {
  const { supabase } = await requireUser('opportunity:reassign')
  const { error } = await supabase.from('opportunities').update({ archived_at: new Date().toISOString() }).eq('id', uuid.parse(id))
  throwIf(error)
  revalidatePath('/pipeline')
  redirect('/pipeline')
}
