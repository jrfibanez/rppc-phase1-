'use client'
import { useState, useTransition } from 'react'
import { resetPassword } from './actions'

export function ResetButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div>
      <button type="button" className="btn-ghost text-xs" disabled={pending}
        onClick={() => { if (!confirm(`Reset password for ${name}? They will have to set a new one at next sign-in.`)) return
          start(async () => { const r = await resetPassword(id); setMsg(r.message) }) }}>
        {pending ? 'Resetting…' : 'Reset password'}
      </button>
      {msg && <p role="status" className="mt-1 rounded bg-amber-50 px-2 py-1 font-mono text-xs text-amber-900 select-all">{msg}</p>}
    </div>
  )
}
