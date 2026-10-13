// M7 7.1 smoke — dsh-local-web-discovery companion core, hermetic (no
// network, no containers):
//   - SearXNG engine vs a local stub speaking the REAL SearXNG JSON API
//     (GET /search?q=…&format=json → { results: [{url,title,content,…}] })
//   - browser39 engine vs a fake runner emitting the LIVE-CAPTURED 2.0.0
//     reply shape (fetch-shaped SERP page; DDG /l/?uddg= wrappers)
//   - no_engine contract (D-M7.3): supported state, combined reasons,
//     auto-fallback, pinned-engine semantics, search_failed vs no_engine
//   - config (defaults / file / env override / corrupt / disabled)
//   - discovery store (discovery.json record/dedup/corrupt)
// Exit 0 iff every check passes. Mirrors the web-missions smoke family.
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'

const core = await import('../lib/discovery.mjs')
const {
  createSearxngEngine, mapSearxngRow,
  createBrowser39Engine, unwrapSerpHref, mapSerpPage,
  runDiscoverySearch,
  readDiscoveryConfig, enginesForConfig, DiscoveryConfigError, DEFAULT_CONFIG,
  readDiscoveryFile, recordDiscovery, discoveryPath, DiscoveryStoreError,
  DiscoveryEngineError,
} = core

let pass = 0
let fail = 0
const check = (label, cond, detail) => {
  if (cond) { pass++; console.log('ok   ' + label) }
  else { fail++; console.error('FAIL ' + label + (detail ? ' :: ' + String(detail).slice(0, 300) : '')) }
}
const J = (v) => JSON.stringify(v)

// --- SearXNG stub (real API shape) --------------------------------------------
const SXR_RESULTS = [
  { url: 'https://alpha.example/one', title: 'Alpha One', content: 'first snippet', engine: 'google', score: 1 },
  { url: 'https://beta.example/two', title: 'Beta Two', content: 'second snippet', engine: 'bing', score: 0.8 },
  { url: 'not-a-url', title: 'Broken', content: 'x', engine: 'ddg', score: 0.5 },
  { url: 'ftp://nope.example/', title: 'Wrong scheme', content: 'x', engine: 'ddg', score: 0.4 },
  { title: 'No url row', content: 'x', engine: 'ddg', score: 0.3 },
  { url: 'https://gamma.example/three', engine: 'ddg', score: 0.2 }, // no title/content
]
let sxrPath = null
const sxr = createServer((req, res) => {
  if (req.method === 'GET' && req.url && req.url.startsWith('/searxng/search?')) {
    const qs = new URL('http://x' + req.url).searchParams
    if (qs.get('format') !== 'json') { res.statusCode = 400; res.end('{"error":"format=json required"}'); return }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ query: qs.get('q'), results: SXR_RESULTS }))
    return
  }
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'not found' }))
})
await new Promise((r) => sxr.listen(0, '127.0.0.1', r))
const sxrPort = sxr.address().port
const sxrEndpoint = `http://127.0.0.1:${sxrPort}/searxng`
sxrPath = '/searxng/search'

{
  const eng = createSearxngEngine({ endpoint: sxrEndpoint })
  const hits = await eng.search('anything')
  check('searxng: stub → hits mapped (url/title/snippet)', hits.length === 3 && hits[0].url === 'https://alpha.example/one' && hits[0].title === 'Alpha One' && hits[0].snippet === 'first snippet', J(hits))
  check('searxng: bad rows skipped (non-http, no url, wrong scheme)', hits[2]?.url === 'https://gamma.example/three' && hits[2]?.title === undefined && hits[2]?.snippet === undefined, J(hits[2]))
  const limited = await eng.search('anything', { limit: 2 })
  check('searxng: limit respected', limited.length === 2 && limited[1].url === 'https://beta.example/two', J(limited))
  check('searxng: row mapper (non-http → null)', mapSearxngRow({ url: 'ftp://x/' }) === null && mapSearxngRow({}) === null)
}
{
  // reachable-but-empty → [] (engine answered "nothing" — NOT no_engine)
  const emptySxr = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ query: 'q', results: [] }))
  })
  await new Promise((r) => emptySxr.listen(0, '127.0.0.1', r))
  const hits = await createSearxngEngine({ endpoint: `http://127.0.0.1:${emptySxr.address().port}/searxng` }).search('q')
  check('searxng: reachable + empty results → []', Array.isArray(hits) && hits.length === 0, J(hits))
  emptySxr.close()
}
{
  // unreachable endpoint (closed port) → searxng_unreachable
  const dead = createServer()
  await new Promise((r) => dead.listen(0, '127.0.0.1', r))
  const deadPort = dead.address().port
  dead.close()
  const eng = createSearxngEngine({ endpoint: `http://127.0.0.1:${deadPort}/searxng`, timeoutMs: 2000 })
  let code = null
  try { await eng.search('q') } catch (e) { code = e instanceof DiscoveryEngineError ? e.code : 'other' }
  check('searxng: unreachable → searxng_unreachable', code === 'searxng_unreachable', code)
}
{
  // 500 + non-JSON + missing results[] → searxng_unreachable
  const bad = createServer((req, res) => {
    if (req.url?.includes('/searxng/search')) { res.statusCode = 500; res.end('boom') }
    else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ query: 'q' })) }
  })
  await new Promise((r) => bad.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${bad.address().port}/searxng`
  const codes = []
  for (const eng of [createSearxngEngine({ endpoint: base })]) {
    try { await eng.search('q') } catch (e) { codes.push(e.code) } // 500
  }
  // non-JSON on 200:
  const nonjson = createServer((req, res) => { res.statusCode = 200; res.end('text/html not json') })
  await new Promise((r) => nonjson.listen(0, '127.0.0.1', r))
  try { await createSearxngEngine({ endpoint: `http://127.0.0.1:${nonjson.address().port}/searxng` }).search('q') } catch (e) { codes.push(e.code) }
  // 200 JSON but no results[]:
  try { await createSearxngEngine({ endpoint: base.replace('/searxng', '/searxng2') }).search('q') } catch (e) { codes.push(e.code) }
  check('searxng: 500 / non-JSON / no results[] → searxng_unreachable', codes.every((c) => c === 'searxng_unreachable'), J(codes))
  bad.close(); nonjson.close()
}

// --- browser39 engine (fake runner, captured 2.0.0 shape) ----------------------
const SERP_PAGE = {
  url: 'https://html.duckduckgo.com/html/?q=test+query',
  title: 'test query at DuckDuckGo',
  status: 200,
  markdown: 'test query at DuckDuckGo\n\n## [Result One][1]\n\n## [Result Two][2]\n',
  links: [
    { i: 0, text: 'DuckDuckGo', href: '/html/' },
    { i: 1, text: 'Result One', href: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fone.example%2Fa&rut=abc123' },
    { i: 2, text: 'Result Two', href: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Ftwo.example%2Fb%3Fref%3Dx&rut=def456' },
    { i: 3, text: 'Result One (dup)', href: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fone.example%2Fa&rut=ghi789' },
    { i: 4, text: 'Plain result', href: 'https://three.example/c' },
    { i: 5, text: 'Site chrome', href: 'https://duckduckgo.com/privacy' },
    { i: 6, text: 'Wrapper to chrome', href: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fabout&rut=zzz' },
    { i: 7, text: 'Wrapper without target', href: 'https://duckduckgo.com/l/?rut=onlytoken' },
    { i: 8, text: 'Relative result', href: '/relative/page' },
    { i: 9, text: 'Feedback', href: 'feedback' },
  ],
}
const fakeRunner = (page = SERP_PAGE, over = {}) => async (bin, args) => ({
  code: 0,
  stdout: page === null ? over.stdout : JSON.stringify(page),
  stderr: '',
  ...over,
})
{
  let seenArgs = null
  const eng = createBrowser39Engine({ bin: 'b39', runner: async (bin, args) => { seenArgs = [bin, ...args]; return { code: 0, stdout: JSON.stringify(SERP_PAGE), stderr: '' } } })
  await eng.search('the query')
  check('browser39: bin + args (search <q> --output json --no-persist)', seenArgs?.join(' ') === 'b39 search the query --output json --no-persist', J(seenArgs))
}
{
  const eng = createBrowser39Engine({ bin: 'b39', runner: fakeRunner() })
  const hits = await eng.search('test query')
  check('browser39: uddg unwrap + chrome/relative/dup skipped', hits.length === 3 && hits[0].url === 'https://one.example/a' && hits[1].url === 'https://two.example/b?ref=x' && hits[2].url === 'https://three.example/c', J(hits))
  check('browser39: titles = anchor text', hits[0]?.title === 'Result One' && hits[1]?.title === 'Result Two' && hits[2]?.title === 'Plain result', J(hits.map((h) => h.title)))
  check('browser39: no snippets in reply (omitted, not null)', hits.every((h) => !('snippet' in h)), J(hits))
}
{
  const eng = createBrowser39Engine({ bin: 'b39', runner: fakeRunner() })
  const limited = await eng.search('test query', { limit: 2 })
  check('browser39: limit respected', limited.length === 2 && limited[1].url === 'https://two.example/b?ref=x', J(limited))
}
{
  const eng = createBrowser39Engine({ bin: 'b39', runner: fakeRunner(SERP_PAGE, { code: 1, stderr: 'error: no search engine reachable\n' }) })
  let code = null, msg = null
  try { await eng.search('q') } catch (e) { code = e.code; msg = e.message }
  check('browser39: non-zero exit → browser39_failed (NOT no_engine)', code === 'browser39_failed' && /no search engine reachable/.test(msg), code + ' ' + msg)
}
{
  const eng = createBrowser39Engine({ bin: 'b39', runner: fakeRunner(null, { stdout: 'not json at all' }) })
  let code = null
  try { await eng.search('q') } catch (e) { code = e.code }
  check('browser39: non-JSON stdout → browser39_failed', code === 'browser39_failed', code)
}
{
  const eng = createBrowser39Engine({ bin: '/nonexistent/b39', runner: fakeRunner(SERP_PAGE, { code: -1, stdout: '', stderr: 'spawn /nonexistent/b39 ENOENT', spawnError: 'ENOENT' }) })
  let code = null
  try { await eng.search('q') } catch (e) { code = e.code }
  check('browser39: ENOENT spawn → browser39_missing (→ no_engine at tool)', code === 'browser39_missing', code)
}
{
  const eng = createBrowser39Engine({ bin: 'b39', runner: fakeRunner(SERP_PAGE, { code: -1, stdout: '', stderr: 'spawn b39 ENOENT' }) })
  let code = null
  try { await eng.search('q') } catch (e) { code = e.code }
  check('browser39: stderr-only ENOENT → browser39_missing', code === 'browser39_missing', code)
}
check('unwrap: relative/non-http → null', unwrapSerpHref('/html/') === null && unwrapSerpHref('feedback') === null && unwrapSerpHref('ftp://x/') === null)
check('unwrap: uddg decode (query params inside survive)', unwrapSerpHref('https://duckduckgo.com/l/?uddg=https%3A%2F%2Ftwo.example%2Fb%3Fref%3Dx&rut=1') === 'https://two.example/b?ref=x')
check('unwrap: chrome + missing target → null', unwrapSerpHref('https://duckduckgo.com/privacy') === null && unwrapSerpHref('https://duckduckgo.com/l/?rut=x') === null)
check('unwrap: target decoding back to DDG chrome → null', unwrapSerpHref('https://duckduckgo.com/l/?uddg=https%3A%2F%2Fduckduckgo.com%2Fabout') === null)
check('unwrap: plain https passes through', unwrapSerpHref('https://three.example/c') === 'https://three.example/c')
{
  const page = { links: [{ i: 1, text: 'T', href: 'https://a.example/' }, { i: 2, text: 'T2', href: 'https://a.example/' }] }
  const hits = mapSerpPage(page, 10)
  check('mapSerpPage: dedupe case-insensitive', hits.length === 1 && hits[0].url === 'https://a.example/', J(hits))
}

// --- no_engine contract (D-M7.3) -----------------------------------------------
const goodB39 = createBrowser39Engine({ bin: 'b39', runner: fakeRunner() })
const deadSxr = createSearxngEngine({ endpoint: 'http://127.0.0.1:1/searxng', timeoutMs: 500 })
const missingB39 = createBrowser39Engine({ bin: 'nope', runner: fakeRunner(SERP_PAGE, { code: -1, stdout: '', stderr: 'spawn nope ENOENT', spawnError: 'ENOENT' }) })
{
  const r = await runDiscoverySearch({ engines: {} }, 'q')
  check('no_engine: no engines configured', r.ok === false && r.error.startsWith('no_engine:'), J(r))
}
{
  const r = await runDiscoverySearch({ engines: { searxng: deadSxr, browser39: missingB39 } }, 'q')
  check('no_engine: both engines absent → combined reasons', r.ok === false && r.error.startsWith('no_engine:') && r.error.includes('searxng') && r.error.includes('browser39'), J(r))
}
{
  const r = await runDiscoverySearch({ engines: { searxng: deadSxr, browser39: goodB39 } }, 'test query')
  check('auto-fallback: searxng dead → browser39 answers', r.ok === true && r.engine === 'browser39' && r.count === 3 && r.urls[0].url === 'https://one.example/a', J(r.ok ? { engine: r.engine, count: r.count } : r.error))
}
{
  const r = await runDiscoverySearch({ engines: { searxng: deadSxr, browser39: missingB39 } }, 'q', { engine: 'searxng' })
  check('pinned absent engine → no_engine naming it', r.ok === false && r.error.includes('searxng'), J(r.error))
}
{
  const failedB39 = createBrowser39Engine({ bin: 'b39', runner: fakeRunner(null, { code: 1, stderr: 'boom' }) })
  const r = await runDiscoverySearch({ engines: { browser39: failedB39 } }, 'q', { engine: 'browser39' })
  check('pinned present-but-failing → search_failed (not no_engine)', r.ok === false && r.error.startsWith('search_failed:'), J(r.error))
}
{
  const r = await runDiscoverySearch({ engines: { searxng: deadSxr, browser39: goodB39 } }, '   ')
  check('empty query → query_required', r.ok === false && r.error.startsWith('query_required:'), J(r.error))
}
{
  const sxrHits = await createSearxngEngine({ endpoint: sxrEndpoint }).search('q', { limit: 1 })
  const r = await runDiscoverySearch({ engines: { searxng: createSearxngEngine({ endpoint: sxrEndpoint }), browser39: goodB39 } }, 'q', { limit: 1 })
  check('auto: searxng alive wins first (limit 1)', r.ok === true && r.engine === 'searxng' && r.urls[0].url === 'https://alpha.example/one', J(r.ok ? { engine: r.engine, first: r.urls[0]?.url } : r.error))
  void sxrHits
}

// --- config --------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'web-discovery-smoke-'))
{
  const cfg = readDiscoveryConfig(tmp, {})
  check('config: absent file → defaults', cfg.searxngEndpoint === DEFAULT_CONFIG.searxngEndpoint && cfg.browser39Bin === 'browser39' && cfg.searxngEndpoint === 'http://127.0.0.1:8888/searxng', J(cfg))
}
{
  mkdirSync(join(tmp, '.dsh', 'web-discovery'), { recursive: true })
  writeFileSync(join(tmp, '.dsh', 'web-discovery', 'config.json'), JSON.stringify({ searxngEndpoint: '' }))
  const cfg = readDiscoveryConfig(tmp, {})
  const presence = enginesForConfig(cfg)
  check('config: empty endpoint disables searxng engine', presence.searxng === false && presence.browser39 === true && cfg.browser39Bin === 'browser39', J({ cfg, presence }))
}
{
  const dir = join(tmp, 'envdir')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.dsh'), 'x') // will be replaced below
  rmSync(join(dir, '.dsh'))
  mkdirSync(join(dir, '.dsh', 'web-discovery'), { recursive: true })
  writeFileSync(join(dir, '.dsh', 'web-discovery', 'config.json'), JSON.stringify({ searxngEndpoint: 'http://127.0.0.1:9999/searxng' }))
  const cfg = readDiscoveryConfig(dir, { SEARXNG_ENDPOINT: 'http://127.0.0.1:7777/searxng' })
  check('config: env override beats file', cfg.searxngEndpoint === 'http://127.0.0.1:7777/searxng', J(cfg))
  const cfgNoEnv = readDiscoveryConfig(dir, {})
  check('config: file value used when env unset', cfgNoEnv.searxngEndpoint === 'http://127.0.0.1:9999/searxng', J(cfgNoEnv))
}
{
  const dir = join(tmp, 'corrupt')
  mkdirSync(join(dir, '.dsh', 'web-discovery'), { recursive: true })
  writeFileSync(join(dir, '.dsh', 'web-discovery', 'config.json'), '{not json')
  let code = null
  try { readDiscoveryConfig(dir, {}) } catch (e) { code = e instanceof DiscoveryConfigError ? e.code : 'other' }
  check('config: corrupt file → config_corrupt (fail loud)', code === 'config_corrupt', code)
}

// --- discovery store (discovery.json) -------------------------------------------
const missionDir = join(tmp, 'mission')
mkdirSync(missionDir, { recursive: true })
const via1 = { query: 'rust web framework', engine: 'browser39', at: '2026-10-13T12:00:00.000Z' }
{
  check('store: absent file → null', readDiscoveryFile(missionDir) === null)
  const file = recordDiscovery(missionDir, [
    { url: 'https://one.example/a', title: 'Result One' },
    { url: 'https://two.example/b?ref=x' },
  ], via1)
  check('store: record writes entries with provenance', file.updated_at === via1.at && file.urls.length === 2 && file.urls[0].via === via1 && file.urls[0].title === 'Result One', J(file))
  check('store: file on disk with discovery.json name', existsSync(discoveryPath(missionDir)) && JSON.parse(readFileSync(discoveryPath(missionDir), 'utf8')).urls.length === 2)
}
{
  const via2 = { query: 'actix web', engine: 'searxng', at: '2026-10-13T13:00:00.000Z' }
  const file = recordDiscovery(missionDir, [
    { url: 'HTTPS://ONE.example/a', title: 'should not duplicate (case-insensitive exact-url)' },
    { url: 'https://actix.rs/', title: 'Actix Web' },
  ], via2)
  check('store: dedup keeps first-seen provenance', file.urls.length === 3 && file.urls[0].via.query === via1.query, J(file.urls.map((u) => ({ url: u.url, q: u.via.query }))))
  check('store: updated_at refreshed', file.updated_at === via2.at)
}
{
  writeFileSync(discoveryPath(missionDir), '{broken')
  let code = null
  try { readDiscoveryFile(missionDir) } catch (e) { code = e instanceof DiscoveryStoreError ? e.code : 'other' }
  check('store: corrupt file → discovery_corrupt (fail loud)', code === 'discovery_corrupt', code)
}

sxr.close()
rmSync(tmp, { recursive: true, force: true })

if (fail > 0) { console.error('M7 7.1 SMOKE: ' + fail + ' check(s) FAILED'); process.exit(1) }
console.log('M7 7.1 SMOKE: all checks passed (' + pass + ' checks) — companion core green (hermetic)')
