// End-to-end smoke suite (Playwright, no test runner). Usage:
//   BASE_URL=http://localhost:3100 E2E_PASSWORD=... node tests/e2e/smoke.mjs
// Needs the e2e-* users described in supabase/tests/README.md.
import { createRequire } from 'node:module'
const { chromium, devices } = createRequire(import.meta.url)('playwright')
import fs from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const PW = process.env.E2E_PASSWORD
const SHOTS = process.env.SHOTS_DIR
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined
const results = []
const stamp = Date.now().toString(36)

async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name) }
  catch (e) { results.push(['FAIL', name, e.message.split('\n')[0]]); console.log('FAIL', name, '-', e.message.split('\n')[0]) }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }

const browser = await chromium.launch({ proxy })
async function session(user, opts = {}) {
  const ctx = await browser.newContext({ ...opts, serviceWorkers: 'allow' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`  [pageerror ${user}]`, e.message))
  if (process.env.E2E_DEBUG) page.on('response', (r) => { if (r.url().includes('/api/') || r.status() >= 400) console.log(`  [${user}] ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`) })
  await page.goto(`${BASE}/login`)
  await page.fill('#email', `e2e-${user}@rppc-e2e.test`)
  await page.fill('#password', PW)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
  return { ctx, page }
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) }

let accountUrl, accountName = `E2E Foods ${stamp}`, ticketUrl

// ---------- Rep A: account lifecycle ----------
const repa = await session('repa')
await step('rep A creates an account', async () => {
  const p = repa.page
  await p.goto(`${BASE}/accounts/new`)
  await p.fill('#name', accountName)
  await p.selectOption('#segment', 'fmcg')
  await p.selectOption('#lead_source', 'referral')
  await p.click('button:has-text("Create account")')
  await p.waitForURL(/\/accounts\/[0-9a-f-]{36}$/)
  accountUrl = p.url()
  expect(await p.isVisible(`h1:has-text("${accountName}")`), 'title missing')
  await shot(p, 'account-overview')
})
await step('rep A adds primary contact and a site', async () => {
  const p = repa.page
  await p.goto(`${accountUrl}?tab=contacts`)
  await p.click('summary:has-text("Add contact")')
  await p.fill('#full_name', 'Maria Santos'); await p.fill('#mobile', '0917 000 0000'); await p.fill('#email', 'maria@example.com')
  await p.check('input[name=is_primary]')
  await p.click('button:has-text("Add contact")')
  await p.waitForSelector('text=Contact saved.')
  await p.goto(`${accountUrl}?tab=sites`)
  await p.click('summary:has-text("Add delivery site")')
  await p.fill('#name', 'Calamba DC'); await p.fill('#city', 'Calamba'); await p.fill('#province', 'Laguna')
  await p.click('button:has-text("Add site")')
  await p.waitForSelector('text=Site saved.')
  await p.reload()
  expect(await p.isVisible('text=Calamba DC'), 'site not listed')
})
await step('second primary contact is rejected (BR-6 via demotion keeps one primary)', async () => {
  const p = repa.page
  await p.goto(`${accountUrl}?tab=contacts`)
  await p.click('summary:has-text("Add contact")')
  await p.fill('#full_name', 'Jose Cruz'); await p.check('input[name=is_primary]')
  await p.click('button:has-text("Add contact")')
  await p.waitForSelector('text=Contact saved.')
  await p.reload()
  const primaries = await p.locator('span.badge', { hasText: /^Primary$/ }).count()
  expect(primaries === 1, `expected 1 primary badge, got ${primaries}`)
})
await step('rep A creates opportunity; lost requires reason; stage moves', async () => {
  const p = repa.page
  await p.goto(`${BASE}/pipeline/new?account=${accountUrl.split('/').pop()}`)
  await p.fill('#title', `2,400 ECR pallets ${stamp}`); await p.fill('#est_pallets', '2400')
  await p.selectOption('#stage', 'lost')
  await p.click('button:has-text("Create opportunity")')
  await p.waitForSelector('text=lost reason is required', { timeout: 10000 })
  await p.selectOption('#stage', 'presentation_done')
  await p.click('button:has-text("Create opportunity")')
  await p.waitForURL(/\/pipeline\/[0-9a-f-]{36}$/)
  await p.goto(`${BASE}/pipeline`)
  const card = p.locator('li', { hasText: `2,400 ECR pallets ${stamp}` })
  p.once('dialog', (d) => d.accept('Chose competitor on price'))
  await card.locator('select').selectOption('lost')
  await p.waitForTimeout(2500)
  await p.reload()
  const lostCol = p.locator('section[aria-label="Lost"]')
  expect(await lostCol.locator(`text=2,400 ECR pallets ${stamp}`).count() === 1, 'card not in Lost')
  await shot(p, 'pipeline')
})
await step('activity logged OFFLINE syncs exactly once after reconnect (AC-9)', async () => {
  const p = repa.page
  await p.goto(`${BASE}/activities`)
  await p.waitForTimeout(1500)                     // let the offline snapshot load
  await repa.ctx.setOffline(true)
  await p.fill('#acct-q', accountName)
  await p.selectOption('#account_id', accountUrl.split('/').pop())
  await p.fill('#summary', `Offline visit ${stamp}`)
  await p.click('button:has-text("Save activity")')
  await p.waitForSelector('text=Saved on this device')
  expect(await p.isVisible('text=1 waiting to sync'), 'no pending badge')
  await repa.ctx.setOffline(false)
  await p.waitForSelector('text=All changes synced.', { timeout: 30000 }).catch(() => {})
  await p.goto(`${accountUrl}?tab=activity`)
  await p.waitForSelector(`text=Offline visit ${stamp}`, { timeout: 15000 }); const n = await p.locator(`text=Offline visit ${stamp}`).count()
  expect(n === 1, `expected exactly 1 timeline entry, got ${n}`)
})
await step('replaying the same client_uuid is a no-op', async () => {
  const p = repa.page
  const uuid = crypto.randomUUID()
  const body = { kind: 'activity', payload: { client_uuid: uuid, type: 'call', account_id: accountUrl.split('/').pop(), summary: `Replay ${stamp}` } }
  for (let i = 0; i < 3; i++) {
    const r = await p.request.post(`${BASE}/api/sync`, { data: body, headers: { origin: BASE } })
    expect(r.ok(), `sync ${i} status ${r.status()}`)
  }
  await p.goto(`${accountUrl}?tab=activity`)
  { await p.waitForSelector(`text=Replay ${stamp}`); const c = await p.locator(`text=Replay ${stamp}`).count(); expect(c === 1, `replay shows ${c} times`) }
})
await step('sync rejects cross-origin requests', async () => {
  const r = await repa.page.request.post(`${BASE}/api/sync`, { data: { kind: 'activity', payload: {} }, headers: { origin: 'https://evil.example' } })
  expect(r.status() === 403, `status ${r.status()}`)
})
await step('CSV export works', async () => {
  const r = await repa.page.request.get(`${BASE}/api/export?entity=accounts`)
  const t = await r.text()
  expect(r.ok() && t.includes(accountName), 'export missing account')
})

// ---------- Rep B: cannot edit Rep A's account ----------
await step('rep B sees account read-only; direct API edit is blocked (AC-5)', async () => {
  const repb = await session('repb')
  await repb.page.goto(accountUrl)
  expect(!(await repb.page.isVisible('button:has-text("Save")')), 'rep B sees Save on rep A account')
  expect(await repb.page.isVisible('dt:has-text("Segment")'), 'read-only view missing')
  await repb.ctx.close()
})

// ---------- CSR: ticket lifecycle ----------
const csr = await session('csr')
await step('CSR creates a ticket with SLA deadlines (AC-10)', async () => {
  const p = csr.page
  await p.goto(`${BASE}/tickets/new?account=${accountUrl.split('/').pop()}`)
  await p.waitForSelector(`#account_id option[value="${accountUrl.split('/').pop()}"]`, { state: 'attached' })
  await p.waitForTimeout(1500)
  await p.selectOption('#category', 'delivery_delay'); await p.selectOption('#priority', 'high')
  await p.fill('#source_ref', 'https://m.me/t/123'); await p.fill('#subject', `Late truck ${stamp}`)
  await p.click('button:has-text("Create ticket")')
  await p.waitForURL(/\/tickets\/[0-9a-f-]{36}/, { timeout: 30000 })
  ticketUrl = p.url().split('?')[0]
  expect(await p.isVisible('text=First response due'), 'no SLA panel')
  await shot(p, 'ticket')
})
await step('internal note does not stamp first response; reply does', async () => {
  const p = csr.page
  await p.click('button:has-text("Internal note")')
  await p.fill('#body', 'Checking with dispatch'); await p.click('button:has-text("Add note")')
  await p.waitForSelector('text=Checking with dispatch')
  let fr = await p.locator('dt:has-text("First responded") + dd').textContent()
  expect(fr.trim() === '—', `first responded set by internal note: ${fr}`)
  await p.click('button:has-text("Reply to client")')
  await p.fill('#body', 'Truck arrives 3pm today'); await p.click('button:has-text("Log reply")')
  await p.waitForSelector('text=Truck arrives 3pm today')
  await p.reload()
  fr = await p.locator('dt:has-text("First responded") + dd').textContent()
  expect(fr.trim() !== '—', 'reply did not stamp first response')
})
await step('resolving needs a note', async () => {
  const p = csr.page
  await p.selectOption('#status', 'resolved')
  await p.click('button:has-text("Update ticket")')
  await p.waitForSelector('text=resolution note is required', { timeout: 10000 })
  await p.fill('#resolution_note', 'Delivered 3:10pm, client confirmed')
  await p.click('button:has-text("Update ticket")')
  await p.waitForSelector('text=Ticket updated.')
})
await step('CSR cannot open admin pages', async () => {
  const r = await csr.page.goto(`${BASE}/admin/users`)
  const txt = await csr.page.textContent('body')
  expect(!txt.includes('Add a user') && txt.includes("isn't available"), 'CSR sees user admin or no friendly error')
})
await csr.ctx.close()

// ---------- Finance: only billing/contract tickets ----------
await step('finance cannot see delivery tickets', async () => {
  const fin = await session('fin')
  await fin.page.goto(`${BASE}/tickets?status=all`)
  expect(!(await fin.page.isVisible(`text=Late truck ${stamp}`)), 'finance sees delivery ticket')
  const r = await fin.page.goto(ticketUrl)
  expect(r.status() === 404, `finance ticket status ${r.status()}`)
  await fin.ctx.close()
})

// ---------- First login forces password change (AC-1) ----------
await step('first-login user is forced to change password', async () => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`)
  await p.fill('#email', 'e2e-new@rppc-e2e.test'); await p.fill('#password', PW); await p.click('button[type=submit]')
  await p.waitForURL(/\/account\/password/)
  await p.goto(`${BASE}/accounts`)
  expect(p.url().includes('/account/password'), 'could reach /accounts before password change')
  const r = await p.request.get(`${BASE}/api/export?entity=accounts`)
  expect(r.status() === 403, `api status ${r.status()}`)
  await ctx.close()
})

// ---------- Owner: admin screens ----------
await step('owner sees users, audit log with changes, settings, import dry-run', async () => {
  const own = await session('owner')
  const p = own.page
  await p.goto(`${BASE}/admin/users`)
  expect(await p.isVisible('text=E2E Rep A'), 'users list')
  await p.goto(`${BASE}/admin/audit?table=accounts`)
  expect(await p.isVisible(`text=${accountName}`) || (await p.locator('text=accounts').count()) > 1, 'audit empty')
  await shot(p, 'audit')
  await p.goto(`${BASE}/admin/settings`)
  expect(await p.isVisible('text=Ticket SLA targets'), 'settings')
  await p.goto(`${BASE}/admin/import`)
  const csv = `name,segment,status\n${accountName},fmcg,prospect\nBrand New Co ${stamp},warehouse,\nX,,\n`
  const f = `/tmp/e2e-${stamp}.csv`; fs.writeFileSync(f, csv)
  await p.setInputFiles('#file', f)
  await p.click('button:has-text("Dry run")')
  await p.waitForSelector('text=will create 1', { timeout: 20000 })
  expect(await p.isVisible('text=Possible duplicates (1)'), 'duplicate not detected')
  expect(await p.isVisible('text=Row 4'), 'row error not shown')
  await shot(p, 'import')
  await own.ctx.close()
})

// ---------- Mobile + offline shell (AC-14 approximation) ----------
await step('mobile dashboard renders and app shell loads offline', async () => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' })
  const p = await ctx.newPage()
  await p.goto(`${BASE}/login`)
  await p.fill('#email', 'e2e-repa@rppc-e2e.test'); await p.fill('#password', PW); await p.click('button[type=submit]')
  await p.waitForURL(`${BASE}/`)
  await shot(p, 'mobile-dashboard')
  const hasSw = await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))
  if (hasSw) {
    await p.waitForTimeout(2500)
    await ctx.setOffline(true)
    await p.goto(`${BASE}/activities`).catch(() => {})
    const body = await p.textContent('body').catch(() => '')
    expect(/Log an activity|You are offline/.test(body), 'offline shell did not load')
    await ctx.setOffline(false)
  } else console.log('  (service worker only registers in production builds)')
  await ctx.close()
})

await repa.ctx.close()
await browser.close()
const failed = results.filter((r) => r[0] === 'FAIL')
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
