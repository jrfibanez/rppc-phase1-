import 'server-only'
import { ZodError } from 'zod'
import { Forbidden } from '@/lib/auth/require-role'

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null

/** Turn thrown errors into a user-facing message. Database messages (RLS/trigger) are shown as-is. */
export function toActionError(e: unknown): ActionState {
  if (e instanceof ZodError) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of e.issues) {
      const k = issue.path.join('.') || 'form'
      fieldErrors[k] ??= issue.message
    }
    const first = Object.entries(fieldErrors)[0]
    return { error: first ? `${labelize(first[0])}: ${first[1]}` : 'Invalid input', fieldErrors }
  }
  if (e instanceof Forbidden) return { error: e.message }
  if (e instanceof Error) return { error: friendlyDbError(e.message) }
  return { error: 'Something went wrong.' }
}

function labelize(k: string) { return k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }

export function friendlyDbError(msg: string) {
  if (/row-level security/i.test(msg)) return 'You do not have permission to make this change.'
  if (/contacts_one_primary/.test(msg)) return 'This account already has a primary contact.'
  if (/lost_reason/.test(msg) || /opportunities_check/.test(msg)) return 'A lost reason is required.'
  if (/resolution_note/.test(msg) || /tickets_check/.test(msg)) return 'A resolution note is required to resolve or close a ticket.'
  if (/accounts_check/.test(msg)) return 'Accredited accounts need an accreditation date.'
  if (/duplicate key/.test(msg)) return 'That record already exists.'
  return msg
}

export function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}
