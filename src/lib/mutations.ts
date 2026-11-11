import 'server-only'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth/require-role'
import { activitySchema, taskSchema, ticketSchema, ticketCommentSchema } from '@/lib/validation/schemas'
import { throwIf } from '@/lib/action'

/** All four offline-capable creates are idempotent on client_uuid: a replay is a no-op. */

export async function createActivity(raw: unknown) {
  const { supabase, user } = await requireUser('activity:create')
  const input = activitySchema.parse(raw)
  const { error } = await supabase.from('activities')
    .upsert({ ...input, created_by: user.id }, { onConflict: 'client_uuid', ignoreDuplicates: true })
  throwIf(error)
  revalidatePath(`/accounts/${input.account_id}`)
  revalidatePath('/activities'); revalidatePath('/')
  return { ok: true as const, client_uuid: input.client_uuid }
}

export async function createTask(raw: unknown) {
  const { supabase, user } = await requireUser('task:write')
  const input = taskSchema.parse(raw)
  const row = { ...input, created_by: user.id }
  const { error } = input.client_uuid
    ? await supabase.from('tasks').upsert(row, { onConflict: 'client_uuid', ignoreDuplicates: true })
    : await supabase.from('tasks').insert(row)
  throwIf(error)
  revalidatePath('/tasks'); revalidatePath('/')
  if (input.account_id) revalidatePath(`/accounts/${input.account_id}`)
  if (input.ticket_id) revalidatePath(`/tickets/${input.ticket_id}`)
  return { ok: true as const }
}

export async function createTicket(raw: unknown) {
  const { supabase, user } = await requireUser('ticket:create')
  const input = ticketSchema.parse(raw)
  const { error } = await supabase.from('tickets')
    .upsert({ ...input, status: input.assigned_to ? 'assigned' : 'new', created_by: user.id },
            { onConflict: 'client_uuid', ignoreDuplicates: true })
  throwIf(error)
  const { data } = await supabase.from('tickets').select('id, number').eq('client_uuid', input.client_uuid).maybeSingle()
  revalidatePath('/tickets'); revalidatePath('/'); revalidatePath(`/accounts/${input.account_id}`)
  return { ok: true as const, id: data?.id as string | undefined, number: data?.number as string | undefined }
}

export async function createTicketComment(raw: unknown) {
  const { supabase, user } = await requireUser('ticket:read')
  const input = ticketCommentSchema.parse(raw)
  const { error } = await supabase.from('ticket_comments')
    .upsert({ ...input, created_by: user.id }, { onConflict: 'client_uuid', ignoreDuplicates: true })
  throwIf(error)
  revalidatePath(`/tickets/${input.ticket_id}`)
  return { ok: true as const }
}

export const syncEnvelope = z.object({
  kind: z.enum(['activity', 'ticket', 'ticket_comment', 'task']),
  payload: z.record(z.string(), z.unknown()),
}).strict()
