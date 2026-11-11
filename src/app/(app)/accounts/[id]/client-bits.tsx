'use client'
import { useTransition } from 'react'

/** Button that runs a server action after an optional confirmation. */
export function ConfirmButton({ action, confirmText, children, className = 'btn-secondary' }: {
  action: () => Promise<unknown>; confirmText?: string; children: React.ReactNode; className?: string
}) {
  const [pending, start] = useTransition()
  return (
    <button type="button" className={className} disabled={pending}
      onClick={() => { if (confirmText && !confirm(confirmText)) return; start(async () => { try { await action() } catch (e) { alert((e as Error).message) } }) }}>
      {pending ? 'Working…' : children}
    </button>
  )
}
