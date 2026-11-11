'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-role'
import { ticketUpdateSchema } from '@/lib/validation/schemas'
import { toActionError, throwIf, type ActionState } from '@/lib/action'

export async function updateTicket(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser('ticket:update')
    const input = ticketUpdateSchema.parse({ ...Object.fromEntries(fd), id })
    let status = input.status
    if (status === 'new' && input.assigned_to) status = 'assigned'
    const { data, error } = await supabase.from('tickets').update({
      status, priority: input.priority, category: input.category, assigned_to: input.assigned_to,
      resolution_note: input.resolution_note,
    }).eq('id', input.id).select('id')
    throwIf(error)
    if (!data?.length) return { error: 'You cannot update this ticket.' }
    revalidatePath(`/tickets/${id}`); revalidatePath('/tickets'); revalidatePath('/')
    return { ok: true, message: 'Ticket updated.' }
  } catch (e) { return toActionError(e) }
}
