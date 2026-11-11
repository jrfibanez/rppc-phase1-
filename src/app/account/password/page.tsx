import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm, Field } from '@/components/form'
import { getSession } from '@/lib/auth/require-role'
import { PASSWORD_MIN } from '@/lib/validation/schemas'
import { changePassword } from './actions'

export const metadata: Metadata = { title: 'Change password' }

export default async function PasswordPage() {
  const { profile } = await getSession()
  const forced = !!profile?.must_change_password
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="card p-6">
          <h1 className="text-lg font-semibold">{forced ? 'Set your password' : 'Change password'}</h1>
          <p className="mb-4 mt-1 text-sm text-stone-600">
            {forced ? 'Before you continue, replace the temporary password you were given. ' : ''}
            Use at least {PASSWORD_MIN} characters. A short sentence works well.
          </p>
          <ActionForm action={changePassword} submitLabel="Save password" submitClass="btn-primary w-full">
            <Field label={forced ? 'Temporary password' : 'Current password'} name="current"><input id="current" name="current" type="password" autoComplete="current-password" required className="input" /></Field>
            <Field label="New password" name="password"><input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className="input" /></Field>
            <Field label="Confirm new password" name="confirm"><input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className="input" /></Field>
          </ActionForm>
          <div className="mt-4 flex justify-between text-sm">
            {!forced && <Link href="/" className="link">Back</Link>}
            <form action="/auth/signout" method="post"><button className="link" type="submit">Sign out</button></form>
          </div>
        </div>
      </div>
    </main>
  )
}
