/**
 * SearXNG engine (D-M7.2, engine 1): self-hosted SearXNG, HTTP JSON API.
 *
 * Query:  GET {endpoint}/search?q=<query>&format=json
 * Reply:  { query, results: [{ url, title, content, engine, category, score, … }], … }
 *
 * `endpoint` is the instance base INCLUDING any path prefix (default
 * `http://127.0.0.1:8888/searxng` — NOT :8080, that port is llama; the
 * operator hand-sets a different instance in ENV.md). The engine is *still
 * egress to upstream engines* (SearXNG fans out to Google/Bing/DDG, S6):
 * results are CANDIDATES — every candidate still passes the mission core's
 * allowlist gate when fetched.
 *
 * Absence = supported state: unreachable endpoint / non-JSON reply /
 * non-2xx → `searxng_unreachable` (the tool layer reports `no_engine`).
 * Reachable-but-empty → `[]` (the engine answered "nothing").
 *
 * Pure: the fetch implementation is injected (the smoke drives a local
 * stub speaking the real API shape — no network, no container).
 */
import { DEFAULT_LIMIT, DiscoveryEngineError, type DiscoveryEngine, type DiscoveryHit, type SearchOptions } from '../discovery-port.ts'

export interface SearxngEngineOptions {
  /** Instance base incl. path prefix, e.g. `http://127.0.0.1:8888/searxng`. */
  endpoint: string
  /** Injectable fetch (default: globalThis.fetch). */
  fetchImpl?: typeof fetch
  /** Per-query timeout in ms (default 10000). */
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

interface SearxngResultRow {
  url?: unknown
  title?: unknown
  content?: unknown
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** Map one SearXNG result row to the DiscoveryPort hit shape (skips rows
 *  without an http(s) url). */
export function mapSearxngRow(row: SearxngResultRow): DiscoveryHit | null {
  const url = asString(row.url)
  if (!url) return null
  let isHttp = false
  try {
    const u = new URL(url)
    isHttp = u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return null
  }
  if (!isHttp) return null
  const hit: DiscoveryHit = { url }
  const title = asString(row.title)
  if (title) hit.title = title
  const snippet = asString(row.content)
  if (snippet) hit.snippet = snippet
  return hit
}

export function createSearxngEngine(opts: SearxngEngineOptions): DiscoveryEngine {
  const endpoint = opts.endpoint.replace(/\/+$/, '')
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = opts.fetchImpl ?? fetch

  return {
    kind: 'searxng',
    async search(query: string, searchOpts: SearchOptions = {}): Promise<DiscoveryHit[]> {
      if (!endpoint) {
        throw new DiscoveryEngineError('searxng_unreachable', 'searxng endpoint is not configured')
      }
      const limit = searchOpts.limit ?? DEFAULT_LIMIT
      const qs = new URLSearchParams({ q: query, format: 'json' })
      const res = await fetchImpl(`${endpoint}/search?${qs.toString()}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json' },
      }).catch((error: unknown) => {
        throw new DiscoveryEngineError(
          'searxng_unreachable',
          `searxng unreachable at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
      if (!res.ok) {
        throw new DiscoveryEngineError('searxng_unreachable', `searxng ${res.status} at ${endpoint}`)
      }
      let body: unknown
      try {
        body = await res.json()
      } catch (error) {
        throw new DiscoveryEngineError(
          'searxng_unreachable',
          `searxng replied non-JSON from ${endpoint}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      const results = (body as { results?: unknown })?.results
      if (!Array.isArray(results)) {
        throw new DiscoveryEngineError('searxng_unreachable', `searxng reply has no results[] from ${endpoint}`)
      }
      const hits: DiscoveryHit[] = []
      for (const row of results as SearxngResultRow[]) {
        const hit = mapSearxngRow(row)
        if (hit) hits.push(hit)
        if (hits.length >= limit) break
      }
      return hits
    },
  }
}
