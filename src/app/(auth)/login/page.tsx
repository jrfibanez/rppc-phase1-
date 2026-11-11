import type { Metadata } from 'next'
import { ActionForm, Field } from '@/components/form'
import { signIn } from './actions'

export const metadata: Metadata = { title: 'Sign in' }

const REASONS: Record<string, string> = {
  expired: 'Your session ended. Please sign in again.',
  disabled: 'Your account is disabled. Contact an administrator.',
  password: 'Password changed. Sign in with your new password.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string; next?: string }> }) {
  const { reason, next } = await searchParams
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">R</div>
          <h1 className="text-xl font-semibold">RPPC OS</h1>
          <p className="text-sm text-stone-600">Red Pallet Provider Co.</p>
        </div>
        <div className="card p-6">
          {reason && REASONS[reason] && <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{REASONS[reason]}</p>}
          <ActionForm action={signIn} submitLabel="Sign in" submitClass="btn-primary w-full">
            <input type="hidden" name="next" value={next ?? ''} />
            <Field label="Email" name="email"><input id="email" name="email" type="email" autoComplete="username" required className="input" /></Field>
            <Field label="Password" name="password"><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></Field>
          </ActionForm>
        </div>
        <p className="mt-4 text-center text-xs text-stone-600">Accounts are created by your administrator. Forgot your password? Ask an admin to reset it.</p>
      </div>
    </main>
  )
}
