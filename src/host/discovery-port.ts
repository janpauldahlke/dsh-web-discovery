/**
 * DiscoveryPort (D-M7.1): the named port the companion hides both engines
 * behind. The mission core never calls an engine — it only sees URLs in /
 * URLs out (plan/M_7_discovery.md "Companion shape").
 *
 * Engines are OPTIONAL (D-M7.2): no SearXNG running, no `browser39 search`
 * binary → the port reports `no_engine` (D-M7.3), a supported state, not a
 * failure. The core degrades to fixtures / human-supplied URLs.
 */

/** One discovered URL (D-M7.1 shape: `{url, title?, snippet?}`). */
export interface DiscoveryHit {
  url: string
  title?: string
  snippet?: string
}

export type DiscoveryEngineKind = 'searxng' | 'browser39'

export const DISCOVERY_ENGINES: readonly DiscoveryEngineKind[] = ['searxng', 'browser39']

export interface SearchOptions {
  /** Max results to return (default 10). */
  limit?: number
  /** Pin one engine; absent = auto (try searxng, then browser39). */
  engine?: DiscoveryEngineKind
}

/** A concrete local engine. `search` resolves to 0..n hits (empty = no
 *  results, NOT no_engine — the engine was reachable and said "nothing"). */
export interface DiscoveryEngine {
  readonly kind: DiscoveryEngineKind
  search(query: string, opts?: SearchOptions): Promise<DiscoveryHit[]>
}

/** The port shape as consumed by (future) mission-core integrations. */
export interface DiscoveryPort {
  search(query: string, opts?: SearchOptions): Promise<DiscoveryHit[]>
}

export type DiscoveryErrorCode =
  /** No engine available (SearXNG unreachable / absent, browser39 binary missing). Supported state. */
  | 'no_engine'
  /** SearXNG endpoint configured but nothing answers (maps to no_engine at the tool layer). */
  | 'searxng_unreachable'
  /** browser39 binary not found (maps to no_engine at the tool layer). */
  | 'browser39_missing'
  /** browser39 binary exists but the search failed (network, engine error) — NOT no_engine. */
  | 'browser39_failed'
  /** The search engine blocked the request (e.g. DDG bot challenge — the CLI
   *  reports HTTP 202 with no results). Engine-availability failure → maps to
   *  no_engine at the tool layer (fall through / next engine), not search_failed. */
  | 'browser39_blocked'

/** Engine-level failure with a stable code (never thrown into the tool layer
 *  unrendered — the tool maps it to the `{ ok: false, error }` contract). */
export class DiscoveryEngineError extends Error {
  constructor(
    readonly code: DiscoveryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'DiscoveryEngineError'
  }
}
