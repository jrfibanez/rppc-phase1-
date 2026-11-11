'use client'
import * as queue from '@/lib/offline/queue'
import * as offlineDb from '@/lib/offline/db'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CommentForm({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [internal, setInternal] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const body = String(new FormData(form).get('body') ?? '').trim()
    if (!body) return
    setBusy(true)
    try {
      const { enqueue, flush } = queue
      await enqueue('ticket_comment', { ticket_id: ticketId, body, is_internal: internal }, body.slice(0, 60))
      form.reset()
      if (navigator.onLine) { await flush(true); router.refresh(); setMsg(null) }
      else setMsg('Saved on this device; will sync when online.')
    } finally { setBusy(false) }
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Comment type">
        <button type="button" role="radio" aria-checked={!internal} onClick={() => setInternal(false)} className={!internal ? 'btn-primary' : 'btn-secondary'}>Reply to client (logged)</button>
        <button type="button" role="radio" aria-checked={internal} onClick={() => setInternal(true)} className={internal ? 'btn-primary' : 'btn-secondary'}>Internal note</button>
      </div>
      <label htmlFor="body" className="sr-only">Comment</label>
      <textarea id="body" name="body" required rows={3} maxLength={8000} className="input"
        placeholder={internal ? 'Notes for the team. Does not count as a first response.' : 'What you told the client (paste your Messenger/WhatsApp reply). Counts as first response.'} />
      {msg && <p role="status" className="text-sm text-amber-900">{msg}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : internal ? 'Add note' : 'Log reply'}</button>
    </form>
  )
}
