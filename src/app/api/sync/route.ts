import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { Forbidden } from '@/lib/auth/require-role'
import { createActivity, createTask, createTicket, createTicketComment, syncEnvelope } from '@/lib/mutations'
import { friendlyDbError } from '@/lib/action'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: Request) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin) {
      return NextResponse.json({ error: 'bad origin' }, { status: 403 })
    }
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    if (!rateLimit(`sync:${ip}`, 120, 60_000)) return NextResponse.json({ error: 'slow down' }, { status: 429 })

    const { kind, payload } = syncEnvelope.parse(await req.json())
    switch (kind) {
      case 'activity': await createActivity(payload); break
      case 'task': await createTask(payload); break
      case 'ticket': await createTicket(payload); break
      case 'ticket_comment': await createTicketComment({ is_internal: false, ...payload }); break
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Forbidden) return NextResponse.json({ error: e.message }, { status: 403 })
    if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }, { status: 422 })
    if (e instanceof SyntaxError) return NextResponse.json({ error: 'invalid json' }, { status: 400 })
    if (e instanceof Error && /row-level security|violates|invalid input/i.test(e.message)) {
      return NextResponse.json({ error: friendlyDbError(e.message) }, { status: 422 })
    }
    console.error('sync failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
