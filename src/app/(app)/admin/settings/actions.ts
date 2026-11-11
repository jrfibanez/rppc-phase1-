'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-role'
import { slaSchema } from '@/lib/validation/schemas'
import { toActionError, throwIf, type ActionState } from '@/lib/action'

export async function saveSla(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser('settings:manage')
    const input = slaSchema.parse(Object.fromEntries(fd))
    const { error } = await supabase.from('sla_policies').update({ first_response_h: input.first_response_h, resolution_h: input.resolution_h }).eq('priority', input.priority)
    throwIf(error)
    revalidatePath('/admin/settings')
    return { ok: true, message: `${input.priority} SLA saved. Applies to new tickets and priority changes.` }
  } catch (e) { return toActionError(e) }
}
