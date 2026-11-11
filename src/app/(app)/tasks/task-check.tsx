'use client'
import { useTransition } from 'react'
import { setTaskStatus } from './actions'

export function TaskCheck({ id, done = false }: { id: string; done?: boolean }) {
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={done ? 'Reopen task' : 'Mark task done'}
      onClick={() => start(async () => { try { await setTaskStatus(id, done ? 'open' : 'done') } catch (e) { alert((e as Error).message) } })}
      className="-m-2.5 flex size-11 shrink-0 items-center justify-center disabled:opacity-50 group">
      <span aria-hidden className={`flex size-6 items-center justify-center rounded border-2 text-xs ${done ? 'border-green-600 bg-green-600 text-white' : 'border-stone-400 bg-white group-hover:border-brand-600'}`}>{done ? '✓' : ''}</span>
    </button>
  )
}
