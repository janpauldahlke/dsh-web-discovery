/**
 * browser39-search engine (D-M7.2, engine 2): the `browser39 search` CLI,
 * same JSON transport family as the fetcher (local CLI → JSON, S1).
 *
 * Probed live (2026-10-13, @aquintanar/browser39@2.0.0):
 *   browser39 search <query> --output json --no-persist
 * emits ONE JSON object — a FETCH-SHAPED page of the SERP, not a structured
 * result list:
 *   { url, title, status, markdown, links: [{ i, text, href }] }
 * The actual results are the SERP anchor links. With the default DuckDuckGo
 * backend the hrefs are redirect wrappers:
 *   https://duckduckgo.com/l/?uddg=<urlencoded target>&rut=<token>
 * so the adapter must unwrap `uddg` to the real target URL (Eris scar: the
 * unwrap is a query-param read, never HTML scraping — D4).
 *
 * Mapping rules (deterministic):
 * - keep links with an absolute http(s) href;
 * - `duckduckgo.com/l/` (and any `duckduckgo.com` site chrome) → unwrap the
 *   `uddg` param to the target; skip if the target is missing/not http(s);
 * - skip targets whose host is the SERP engine's own host (duckduckgo.com) —
 *   those are chrome (logo, /html/, feedback), not results;
 * - title = the anchor text (the SERP result title);
 * - snippet: the JSON reply carries none (markdown has titles + dates only)
 *   → omitted;
 * - dedupe by lowercased url, first-seen wins; `limit` caps the output.
 *
 * Absence = supported state: binary missing (spawn ENOENT) →
 * `browser39_missing`; present but non-zero exit / non-JSON →
 * `browser39_failed` (a query failure, NOT no_engine).
 *
 * Pure: the CLI runner is injected (the smoke drives a fake binary emitting
 * the captured reply shape — no network).
 */
import { execFile } from 'node:child_process'
import {
  DEFAULT_LIMIT,
  DiscoveryEngineError,
  type DiscoveryEngine,
  type DiscoveryHit,
  type SearchOptions,
} from '../discovery-port.ts'

export interface Browser39CliResult {
  code: number
  stdout: string
  stderr: string
  /** Set when the SPAWN itself failed (e.g. `ENOENT` = binary missing) —
   *  distinct from a spawn that ran and exited non-zero. */
  spawnError?: string
}

export type Browser39Runner = (bin: string, args: string[]) => Promise<Browser39CliResult>

/** Default runner: async execFile with a timeout; spawn errors (ENOENT =
 *  binary missing) resolve to `{ code: -1, spawnError }`-style results so
 *  the engine can distinguish missing-binary from failed-query. */
export function defaultRunner(timeoutMs: number): Browser39Runner {
  return (bin, args) =>
    new Promise<Browser39CliResult>((resolve) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const status = (error as { status?: number }).status
            resolve({
              code: typeof status === 'number' ? status : -1,
              stdout: String(stdout ?? ''),
              stderr: String(stderr ?? ''),
              spawnError: (error as NodeJS.ErrnoException).code ?? (error instanceof Error ? error.name : undefined),
            })
          } else {
            resolve({ code: 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
          }
        },
      )
    })
}

const DEFAULT_TIMEOUT_MS = 30_000
const SERP_CHROME_HOST = 'duckduckgo.com'

export interface Browser39EngineOptions {
  /** Binary path (default 'browser39' — resolved on PATH by execFile; the
   *  core's BROWSER39_BIN convention is honored at the config layer). */
  bin: string
  runner?: Browser39Runner
  timeoutMs?: number
}

interface SerpLink {
  i?: unknown
  text?: unknown
  href?: unknown
}

interface SerpPage {
  url?: unknown
  title?: unknown
  status?: unknown
  links?: unknown
}

/** Unwrap a SERP href to a candidate result URL, or null when it is not one:
 *  relative/non-http hrefs → null; `duckduckgo.com/l/?uddg=…` → the decoded
 *  target (must be http(s)); `duckduckgo.com` site chrome (incl. a target
 *  that decodes back to duckduckgo.com) → null; anything else → as-is. */
export function unwrapSerpHref(href: string): string | null {
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (u.hostname.toLowerCase() !== SERP_CHROME_HOST) return u.toString()
  // DDG host: only /l/ redirect wrappers with a valid uddg target count.
  if (u.pathname !== '/l/') return null
  const target = u.searchParams.get('uddg')
  if (!target) return null
  let t: URL
  try {
    t = new URL(target)
  } catch {
    return null
  }
  if (t.protocol !== 'http:' && t.protocol !== 'https:') return null
  if (t.hostname.toLowerCase() === SERP_CHROME_HOST) return null
  return t.toString()
}

/** Map a fetch-shaped SERP page to result hits (deduped, limited). Exported
 *  for the smoke (pure, no I/O). */
export function mapSerpPage(page: SerpPage, limit: number): DiscoveryHit[] {
  const links = Array.isArray(page.links) ? (page.links as SerpLink[]) : []
  const seen = new Set<string>()
  const hits: DiscoveryHit[] = []
  for (const link of links) {
    if (hits.length >= limit) break
    const href = typeof link.href === 'string' ? link.href : ''
    const url = unwrapSerpHref(href)
    if (!url) continue
    const key = url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const hit: DiscoveryHit = { url }
    const title = typeof link.text === 'string' && link.text.trim() !== '' ? link.text.trim() : undefined
    if (title) hit.title = title
    hits.push(hit)
  }
  return hits
}

export function createBrowser39Engine(opts: Browser39EngineOptions): DiscoveryEngine {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const runner = opts.runner ?? defaultRunner(timeoutMs)

  return {
    kind: 'browser39',
    async search(query: string, searchOpts: SearchOptions = {}): Promise<DiscoveryHit[]> {
      const limit = searchOpts.limit ?? DEFAULT_LIMIT
      let result: Browser39CliResult
      try {
        result = await runner(opts.bin, ['search', query, '--output', 'json', '--no-persist'])
      } catch (error) {
        throw new DiscoveryEngineError(
          'browser39_missing',
          `browser39 search failed to run: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const spawnError = result.spawnError
      if (spawnError === 'ENOENT' || (spawnError === undefined && result.code === -1 && result.stdout === '' && result.stderr !== '' && /ENOENT/.test(result.stderr))) {
        throw new DiscoveryEngineError('browser39_missing', `browser39 binary not found: ${opts.bin}`)
      }
      if (result.code !== 0) {
        const tail = result.stderr.trim().split('\n').slice(-3).join(' ')
        throw new DiscoveryEngineError('browser39_failed', `browser39 search exited ${result.code}: ${tail || 'no stderr'}`)
      }
      let page: SerpPage
      try {
        page = JSON.parse(result.stdout) as SerpPage
      } catch (error) {
        throw new DiscoveryEngineError(
          'browser39_failed',
          `browser39 search returned non-JSON: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      if (page === null || typeof page !== 'object') {
        throw new DiscoveryEngineError('browser39_failed', 'browser39 search returned a non-object reply')
      }
      // The CLI's own structured status (the upstream engine's HTTP response).
      // A block — notably DDG's bot-challenge page, which answers HTTP 202
      // ("select all squares containing a duck", no result links) — must be a
      // loud failure so the tool layer falls through / reports no_engine,
      // never a silent 0-hit success. (We read the CLI's status field, not
      // the HTML.)
      const status = typeof page.status === 'number' ? page.status : 200
      if (status === 202 || status < 200 || status >= 300) {
        throw new DiscoveryEngineError(
          'browser39_blocked',
          `browser39 search blocked by the search engine (HTTP ${status} — bot challenge or rate limit); retry later or use another engine`,
        )
      }
      return mapSerpPage(page, limit)
    },
  }
}
