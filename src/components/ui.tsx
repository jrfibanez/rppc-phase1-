import Link from 'next/link'
import { label } from '@/lib/labels'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-stone-600">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-600">{children}</p>
}

const TONE: Record<string, string> = {
  gray: 'bg-stone-100 text-stone-700', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-900',
  green: 'bg-green-100 text-green-800', blue: 'bg-sky-100 text-sky-800', violet: 'bg-violet-100 text-violet-800',
}
export function Badge({ tone = 'gray', children }: { tone?: keyof typeof TONE; children: React.ReactNode }) {
  return <span className={`badge ${TONE[tone]}`}>{children}</span>
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    ['urgent', 'lost', 'inactive'].includes(value) ? 'red'
    : ['high', 'waiting_client', 'on_hold', 'prospect'].includes(value) ? 'amber'
    : ['resolved', 'closed', 'active', 'done', 'contract_signed'].includes(value) ? 'green'
    : ['new', 'assigned', 'in_progress'].includes(value) ? 'blue'
    : 'gray'
  return <Badge tone={tone as keyof typeof TONE}>{label(value)}</Badge>
}

export function Tabs({ base, current, tabs }: { base: string; current: string; tabs: { key: string; label: string; count?: number }[] }) {
  return (
    <nav aria-label="Sections" className="-mx-4 mb-4 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((t) => (
          <li key={t.key}>
            <Link href={`${base}?tab=${t.key}`} aria-current={current === t.key ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-1 border-b-2 px-3 text-sm font-medium whitespace-nowrap ${current === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-600 hover:text-stone-900'}`}>
              {t.label}{t.count !== undefined && <span className="text-xs text-stone-500">({t.count})</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Details({ summary, children, open }: { summary: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details className="card group" open={open}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-stone-800">
        {summary}<span aria-hidden className="text-stone-500 group-open:rotate-45 transition-transform text-lg">+</span>
      </summary>
      <div className="border-t border-stone-100 p-4">{children}</div>
    </details>
  )
}
