'use server'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-role'
import { createTask } from '@/lib/mutations'
import { taskStatusSchema } from '@/lib/validation/schemas'
import { toActionError, throwIf, type ActionState } from '@/lib/action'
import { manilaLocalToIso } from '@/lib/format'

export async function setTaskStatus(id: string, status: 'open' | 'done' | 'cancelled') {
  const { supabase } = await requireUser('task:write')
  const input = taskStatusSchema.parse({ id, status })
  const { data, error } = await supabase.from('tasks').update({ status: input.status }).eq('id', input.id).select('id')
  throwIf(error)
  if (!data?.length) throw new Error('Task not found or not yours to change.')
  revalidatePath('/tasks'); revalidatePath('/')
  return { ok: true }
}

export async function addTask(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { user } = await requireUser('task:write')
    const s = (k: string) => (fd.get(k) ? String(fd.get(k)) : null)
    await createTask({
      title: s('title') ?? '',
      due_at: manilaLocalToIso(s('due_at')),
      assigned_to: s('assigned_to') ?? user.id,
      account_id: s('account_id'),
      opportunity_id: s('opportunity_id'),
      activity_id: s('activity_id'),
      ticket_id: s('ticket_id'),
    })
    return { ok: true, message: 'Task added.' }
  } catch (e) { return toActionError(e) }
}
