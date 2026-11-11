'use client'
import { startTransition, useActionState, useEffect, useRef } from 'react'
import { createContext, useContext } from 'react'
import { label as enumLabel } from '@/lib/labels'

const PendingCtx = createContext(false)
const usePending = () => useContext(PendingCtx)

export type FormState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null
type Action = (prev: FormState, fd: FormData) => Promise<FormState>

export function ActionForm({
  action, children, className, submitLabel = 'Save', resetOnSuccess = false, hideSubmit = false, submitClass = 'btn-primary', onSuccess,
}: {
  action: Action; children: React.ReactNode; className?: string; submitLabel?: string
  resetOnSuccess?: boolean; hideSubmit?: boolean; submitClass?: string; onSuccess?: () => void
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state?.ok) { if (resetOnSuccess) ref.current?.reset(); onSuccess?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  return (
    // onSubmit + startTransition instead of action=, so React does not clear the user's input on validation errors.
    <form ref={ref} className={className ?? 'space-y-4'} onSubmit={(e) => {
      e.preventDefault()
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null
      const fd = new FormData(e.currentTarget, submitter)
      startTransition(() => formAction(fd))
    }}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {state?.ok && state.message && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.message}</p>}
      {!hideSubmit && <PendingCtx.Provider value={pending}><Submit className={submitClass}>{submitLabel}</Submit></PendingCtx.Provider>}
    </form>
  )
}

export function Submit({ children, className = 'btn-primary', name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const pending = usePending()
  return <button type="submit" name={name} value={value} className={className} disabled={pending}>{pending ? 'Saving…' : children}</button>
}

export function Field({ label, name, children, hint }: { label: string; name: string; children?: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-600">{hint}</p>}
    </div>
  )
}

export function Select({ name, options, defaultValue, required, blank, id, labeled }: {
  name: string; options: readonly string[] | { value: string; label: string }[]; defaultValue?: string | null
  required?: boolean; blank?: string; id?: string; labeled?: boolean
}) {
  const opts = (options as (string | { value: string; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o, label: labeled ? enumLabel(o) : o } : o)
  return (
    <select id={id ?? name} name={name} defaultValue={defaultValue ?? ''} required={required} className="input">
      {blank !== undefined && <option value="">{blank}</option>}
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
