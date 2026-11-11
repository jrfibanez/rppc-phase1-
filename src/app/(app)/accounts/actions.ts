'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-role'
import { can } from '@/lib/auth/permissions'
import { accountSchema, accreditationSchema, contactSchema, financeSchema, siteSchema, uuid } from '@/lib/validation/schemas'
import { toActionError, throwIf, type ActionState } from '@/lib/action'

const form = (fd: FormData) => Object.fromEntries(fd)

export async function createAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string
  try {
    const { supabase, user, profile } = await requireUser('account:create')
    const input = accountSchema.parse(form(fd))
    // Reps always own what they create; managers may pick an owner.
    const owner_id = can(profile.role, 'opportunity:reassign') ? input.owner_id ?? user.id : user.id
    const { data, error } = await supabase.from('accounts').insert({ ...input, owner_id }).select('id').single()
    throwIf(error)
    id = data!.id
  } catch (e) { return toActionError(e) }
  revalidatePath('/accounts')
  redirect(`/accounts/${id}`)
}

export async function updateAccount(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase, profile } = await requireUser('account:update')
    const input = accountSchema.parse(form(fd))
    const patch: Record<string, unknown> = { ...input }
    if (!can(profile.role, 'opportunity:reassign')) delete patch.owner_id
    if (patch.principal_account_id === id) return { error: 'An account cannot be its own principal.' }
    const { data, error } = await supabase.from('accounts').update(patch).eq('id', uuid.parse(id)).select('id')
    throwIf(error)
    if (!data?.length) return { error: 'You can edit only accounts you own.' }
    revalidatePath(`/accounts/${id}`)
    return { ok: true, message: 'Account saved.' }
  } catch (e) { return toActionError(e) }
}

export async function updateAccreditation(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser('account:accredit')
    const input = accreditationSchema.parse(form(fd))
    const { data, error } = await supabase.from('accounts')
      .update({ ...input, accredited_at: input.is_accredited ? input.accredited_at : null }).eq('id', uuid.parse(id)).select('id')
    throwIf(error)
    if (!data?.length) return { error: 'Not allowed.' }
    revalidatePath(`/accounts/${id}`)
    return { ok: true, message: 'Accreditation and billing saved.' }
  } catch (e) { return toActionError(e) }
}

export async function setArchived(id: string, archived: boolean) {
  const { supabase } = await requireUser('account:archive')
  const { error } = await supabase.from('accounts').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', uuid.parse(id))
  throwIf(error)
  revalidatePath(`/accounts/${id}`); revalidatePath('/accounts')
}

export async function saveFinance(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser('account:finance:write')
    const input = financeSchema.parse(form(fd))
    const { error } = await supabase.from('account_finance').upsert({ account_id: uuid.parse(id), ...input }, { onConflict: 'account_id' })
    throwIf(error)
    revalidatePath(`/accounts/${id}`)
    return { ok: true, message: 'Billing details saved.' }
  } catch (e) { return toActionError(e) }
}

// ===== contacts =====
export async function saveContact(accountId: string, contactId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser(contactId ? 'contact:update' : 'contact:create')
    const input = contactSchema.parse(form(fd))
    const account_id = uuid.parse(accountId)
    if (input.is_primary) {
      // Demote the current primary first (partial unique index allows only one).
      let q = supabase.from('contacts').update({ is_primary: false }).eq('account_id', account_id).eq('is_primary', true)
      if (contactId) q = q.neq('id', contactId)
      const { error } = await q
      if (error && !contactId) {
        // CSR can create but not update: surface a clear message instead of a constraint error.
        return { error: 'Another contact is already primary, and you cannot change it. Save without "Primary".' }
      }
      throwIf(error)
    }
    const { error } = contactId
      ? await supabase.from('contacts').update(input).eq('id', uuid.parse(contactId)).eq('account_id', account_id)
      : await supabase.from('contacts').insert({ ...input, account_id })
    throwIf(error)
    revalidatePath(`/accounts/${accountId}`)
    return { ok: true, message: 'Contact saved.' }
  } catch (e) { return toActionError(e) }
}

export async function archiveContact(accountId: string, contactId: string) {
  const { supabase } = await requireUser('account:archive')
  const { error } = await supabase.from('contacts').update({ archived_at: new Date().toISOString(), is_primary: false }).eq('id', uuid.parse(contactId))
  throwIf(error)
  revalidatePath(`/accounts/${accountId}`)
}

// ===== sites =====
export async function saveSite(accountId: string, siteId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const { supabase } = await requireUser('site:write')
    const input = siteSchema.parse(form(fd))
    const account_id = uuid.parse(accountId)
    const { error } = siteId
      ? await supabase.from('sites').update(input).eq('id', uuid.parse(siteId)).eq('account_id', account_id)
      : await supabase.from('sites').insert({ ...input, account_id })
    throwIf(error)
    revalidatePath(`/accounts/${accountId}`)
    return { ok: true, message: 'Site saved.' }
  } catch (e) { return toActionError(e) }
}

export async function archiveSite(accountId: string, siteId: string) {
  const { supabase } = await requireUser('account:archive')
  const { error } = await supabase.from('sites').update({ archived_at: new Date().toISOString() }).eq('id', uuid.parse(siteId))
  throwIf(error)
  revalidatePath(`/accounts/${accountId}`)
}
