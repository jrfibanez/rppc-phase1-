'use client'
import Link from 'next/link'
import { useOptimistic, useState, useTransition } from 'react'
import { OPP_STAGES, label } from '@/lib/labels'
import { moveStage } from './actions'

export type Card = { id: string; title: string; stage: string; account: string; account_id: string; owner: string; owner_id: string; est_pallets: number | null }

export function Kanban({ cards, me, canMoveAll }: { cards: Card[]; me: string; canMoveAll: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(cards, (state, m: { id: string; stage: string }) =>
    state.map((c) => (c.id === m.id ? { ...c, stage: m.stage } : c)))
  const [, start] = useTransition()
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canMove = (c: Card) => canMoveAll || c.owner_id === me

  function move(c: Card, stage: string) {
    if (c.stage === stage) return
    let lost_reason: string | null = null
    if (stage === 'lost') {
      lost_reason = prompt(`Why was "${c.title}" lost? (required)`)?.trim() || null
      if (!lost_reason) { setError('Moving to Lost needs a reason.'); return }
    }
    setError(null)
    start(async () => {
      setOptimistic({ id: c.id, stage })
      const r = await moveStage({ id: c.id, stage, lost_reason })
      if (!r.ok) setError(r.error ?? 'Could not move')
    })
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="-mx-4 overflow-x-auto px-4 pb-4">
        <div className="flex gap-3" style={{ minWidth: `${OPP_STAGES.length * 236}px` }}>
          {OPP_STAGES.map((stage) => {
            const list = optimistic.filter((c) => c.stage === stage)
            const pallets = list.reduce((n, c) => n + (c.est_pallets ?? 0), 0)
            return (
              <section key={stage} aria-label={label(stage)}
                onDragOver={(e) => { e.preventDefault(); setOver(stage) }} onDragLeave={() => setOver(null)}
                onDrop={(e) => { e.preventDefault(); setOver(null); const c = optimistic.find((x) => x.id === dragId); if (c) move(c, stage) }}
                className={`w-56 shrink-0 rounded-xl border p-2 ${over === stage ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-stone-100'}`}>
                <header className="mb-2 px-1">
                  <h2 className="text-sm font-semibold">{label(stage)} <span className="text-stone-600">({list.length})</span></h2>
                  <p className="text-xs text-stone-600">{pallets.toLocaleString('en-PH')} pallets</p>
                </header>
                <ul className="space-y-2">
                  {list.map((c) => (
                    <li key={c.id} draggable={canMove(c)} onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(null)}
                      className={`rounded-lg border border-stone-200 bg-white p-2 text-sm shadow-sm ${canMove(c) ? 'cursor-grab' : ''}`}>
                      <Link href={`/pipeline/${c.id}`} className="font-medium hover:underline">{c.title}</Link>
                      <p className="text-xs text-stone-700">{c.account}</p>
                      <p className="text-xs text-stone-600">{c.owner}{c.est_pallets ? ` · ${c.est_pallets.toLocaleString('en-PH')} pcs` : ''}</p>
                      {canMove(c) && (
                        <select aria-label={`Move ${c.title} to stage`} value={c.stage} onChange={(e) => move(c, e.target.value)} className="input mt-2 min-h-9 py-1 text-xs">
                          {OPP_STAGES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}
