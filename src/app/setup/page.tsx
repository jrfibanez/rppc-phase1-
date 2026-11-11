import type { Metadata } from 'next'
import { ActionForm, Field } from '@/components/form'
import { hasServiceKey } from '@/lib/supabase/admin'
import { PASSWORD_MIN } from '@/lib/validation/schemas'
import { createFirstOwner, ownerCount } from './actions'

export const metadata: Metadata = { title: 'First-time setup', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  let body: React.ReactNode
  if (!hasServiceKey()) {
    body = <p className="text-sm text-stone-700">The server is not fully configured yet: <code>SUPABASE_SERVICE_ROLE_KEY</code> is missing in the Vercel project&apos;s environment variables. Add it and redeploy, then reopen this link.</p>
  } else if ((await ownerCount()) > 0) {
    body = <p className="text-sm text-stone-700">Setup is complete. <a className="link" href="/login">Sign in</a>.</p>
  } else if (!token) {
    body = <p className="text-sm text-stone-700">Open the setup link that includes the setup token.</p>
  } else {
    body = (
      <ActionForm action={createFirstOwner} submitLabel="Create owner account" submitClass="btn-primary w-full">
        <input type="hidden" name="token" value={token} />
        <Field label="Full name" name="full_name"><input id="full_name" name="full_name" required className="input" autoComplete="name" /></Field>
        <Field label="Email" name="email"><input id="email" name="email" type="email" required className="input" autoComplete="username" /></Field>
        <Field label="Password" name="password" hint={`At least ${PASSWORD_MIN} characters.`}><input id="password" name="password" type="password" minLength={PASSWORD_MIN} required className="input" autoComplete="new-password" /></Field>
        <Field label="Confirm password" name="confirm"><input id="confirm" name="confirm" type="password" minLength={PASSWORD_MIN} required className="input" autoComplete="new-password" /></Field>
      </ActionForm>
    )
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <h1 className="mb-1 text-lg font-semibold">RPPC OS: first-time setup</h1>
        <p className="mb-4 text-sm text-stone-600">Creates the company owner account. This page stops working once an owner exists.</p>
        {body}
      </div>
    </main>
  )
}
