/**
 * Discovery tool logic (pure): engine selection + the no_engine contract
 * (D-M7.3).
 *
 * Selection:
 * - explicit `engine` pin → that engine only; absent or unreachable →
 *   `no_engine` (naming the engine + why).
 * - no pin → auto: try `searxng` then `browser39` (in that order, the ones
 *   present in `deps.engines`); the first engine that answers wins. ALL of
 *   them absent/unreachable → `no_engine` with the combined reasons.
 *
 * `no_engine` is a SUPPORTED STATE (missing discovery is fine — the core
 * degrades to fixtures/human-supplied URLs), so it renders as a clean
 * `{ ok: false, error: 'no_engine: …' }`, never a crash. A pinned or
 * auto-selected engine that EXISTS but fails a query (browser39 non-zero
 * exit) surfaces as `search_failed: …` — that is a query failure, not an
 * absent engine.
 */
import {
  DISCOVERY_ENGINES,
  DiscoveryEngineError,
  type DiscoveryEngine,
  type DiscoveryEngineKind,
  type DiscoveryHit,
  type SearchOptions,
} from './discovery-port.ts'

export interface DiscoveryToolDeps {
  /** Engines present by config (endpoint configured / binary expected). */
  engines: Partial<Record<DiscoveryEngineKind, DiscoveryEngine>>
}

export type DiscoveryToolResult =
  | { ok: true; query: string; engine: DiscoveryEngineKind; count: number; urls: DiscoveryHit[] }
  | { ok: false; error: string }

function engineReason(kind: DiscoveryEngineKind, error: DiscoveryEngineError): string {
  switch (error.code) {
    case 'searxng_unreachable':
      return 'searxng not running at the configured endpoint'
    case 'browser39_missing':
      return 'browser39 search binary not found'
    default:
      return `${kind} engine error (${error.code})`
  }
}

export async function runDiscoverySearch(
  deps: DiscoveryToolDeps,
  rawQuery: string,
  opts: SearchOptions = {},
): Promise<DiscoveryToolResult> {
  const query = rawQuery.trim()
  if (!query) {
    return { ok: false, error: 'query_required: pass a non-empty search query' }
  }
  const limit = opts.limit ?? 10

  const candidates: DiscoveryEngineKind[] = opts.engine
    ? [opts.engine]
    : DISCOVERY_ENGINES.filter((k) => deps.engines[k] !== undefined)

  if (candidates.length === 0) {
    return {
      ok: false,
      error:
        'no_engine: no discovery engine available ' +
        '(searxng endpoint not configured; browser39 search not configured)',
    }
  }

  const failures: string[] = []
  for (const kind of candidates) {
    const engine = deps.engines[kind]
    if (!engine) {
      failures.push(
        kind === 'searxng' ? 'searxng endpoint not configured' : 'browser39 search not configured',
      )
      continue
    }
    try {
      const urls = await engine.search(query, { limit })
      return { ok: true, query, engine: engine.kind, count: urls.length, urls }
    } catch (error) {
      if (
        error instanceof DiscoveryEngineError &&
        (error.code === 'searxng_unreachable' || error.code === 'browser39_missing')
      ) {
        failures.push(engineReason(engine.kind, error))
        continue
      }
      if (error instanceof DiscoveryEngineError && error.code === 'browser39_failed') {
        return { ok: false, error: `search_failed: ${error.message}` }
      }
      // Unexpected engine-internal error — surface it, don't loop on it.
      return {
        ok: false,
        error: `search_failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  const reason =
    candidates.length === 1 && opts.engine
      ? `${opts.engine}: ${failures[0] ?? 'unavailable'}`
      : failures.join('; ')
  return { ok: false, error: `no_engine: ${reason} — missing discovery is a supported state; supply URLs directly (fixtures or manual)` }
}
