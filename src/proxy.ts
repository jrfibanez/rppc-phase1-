import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC = ['/login', '/setup', '/offline']
const IDLE_MS = 30 * 60 * 1000          // desktop idle timeout
const ABSOLUTE_MS = 12 * 60 * 60 * 1000 // absolute session limit

export async function proxy(req: NextRequest) {
  let res = NextResponse.next({ request: req })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser() // validates the JWT with Supabase
  const path = req.nextUrl.pathname
  const isApi = path.startsWith('/api/')
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + '/'))

  const deny = (reason?: string) => {
    if (isApi) return NextResponse.json({ error: 'not signed in' }, { status: 401 })
    const url = new URL('/login', req.url)
    if (reason) url.searchParams.set('reason', reason)
    else if (path !== '/') url.searchParams.set('next', path)
    const r = NextResponse.redirect(url)
    res.cookies.getAll().forEach((c) => r.cookies.set(c))
    return r
  }

  if (!user) return isPublic ? res : deny()

  // Session limits (idle limit applies to desktop browsers only; field phones stay signed in for the shift).
  const now = Date.now()
  const start = Number(req.cookies.get('rppc_start')?.value ?? now)
  const last = Number(req.cookies.get('rppc_last')?.value ?? now)
  const mobile = /Mobi|Android|iPhone|iPad/i.test(req.headers.get('user-agent') ?? '')
  if (now - start > ABSOLUTE_MS || (!mobile && now - last > IDLE_MS)) {
    await supabase.auth.signOut()
    const r = deny('expired')
    for (const n of ['rppc_start', 'rppc_last']) r.cookies.delete(n)
    return r
  }
  const cookieOpts = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' }
  if (!req.cookies.get('rppc_start')) res.cookies.set('rppc_start', String(now), cookieOpts)
  res.cookies.set('rppc_last', String(now), cookieOpts)

  // Deactivated users are signed out; first-login users must change their password before anything else.
  const { data: profile } = await supabase.from('profiles')
    .select('is_active, must_change_password').eq('id', user.id).maybeSingle()
  if (!profile || !profile.is_active) {
    if (path === '/login') return res
    await supabase.auth.signOut()
    return deny('disabled')
  }
  if (profile.must_change_password && path !== '/account/password' && !path.startsWith('/auth/')) {
    if (isApi) return NextResponse.json({ error: 'password change required' }, { status: 403 })
    return NextResponse.redirect(new URL('/account/password', req.url))
  }
  if (path === '/login') return NextResponse.redirect(new URL('/', req.url))
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)'],
}
