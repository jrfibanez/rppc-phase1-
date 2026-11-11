// Best-effort per-instance limiter (serverless instances do not share memory; Supabase Auth has its own limits).
const hits = new Map<string, { n: number; reset: number }>()
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const h = hits.get(key)
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return true }
  h.n++
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  return h.n <= max
}
