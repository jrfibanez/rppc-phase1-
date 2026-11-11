const TZ = 'Asia/Manila'

export function fmtDateTime(v: string | Date | null | undefined) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v))
}
export function fmtDate(v: string | Date | null | undefined) {
  if (!v) return '—'
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00+08:00') : new Date(v)
  return new Intl.DateTimeFormat('en-PH', { timeZone: TZ, dateStyle: 'medium' }).format(d)
}
export function fmtNumber(n: number | null | undefined) {
  return n == null ? '—' : new Intl.NumberFormat('en-PH').format(n)
}
/** "in 3h 20m" / "2h 5m overdue" */
export function fmtCountdown(due: string | null | undefined, now = Date.now()) {
  if (!due) return '—'
  const ms = new Date(due).getTime() - now
  const abs = Math.abs(ms)
  const d = Math.floor(abs / 86_400_000), h = Math.floor((abs % 86_400_000) / 3_600_000), m = Math.floor((abs % 3_600_000) / 60_000)
  const s = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
  return ms >= 0 ? `in ${s}` : `${s} overdue`
}
/** Convert a <input type="datetime-local"> value (Manila wall time) to ISO UTC. */
export function manilaLocalToIso(v: string | null | undefined) {
  if (!v) return null
  const s = v.length === 16 ? v + ':00' : v
  return new Date(s + '+08:00').toISOString()
}
/** ISO -> value for <input type="datetime-local"> in Manila time. */
export function isoToManilaLocal(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(new Date(v).getTime() + 8 * 3_600_000)
  return d.toISOString().slice(0, 16)
}
export function todayManila() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}
