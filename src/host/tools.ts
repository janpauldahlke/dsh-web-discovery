/**
 * Agent tool for discovery (M7): `discovery_search`.
 *
 * Contract (mirrors the core's tools, C1):
 * - results are JSON-serializable;
 * - errors return `{ ok: false, error: '<code>: <msg>' }` — never throw into
 *   the tool layer;
 * - JSON Schema scar (dsh ≥ 0.1.7): no `required: true` on scalar property
 *   nodes — object-level `required: ['field', …]` arrays only;
 * - cwd resolves per tool call via resolveCwd (args.cwd → agent session
 *   header cwd → error). Never process.cwd().
 *
 * `discovery_search`:
 *   query (required) + engine? + limit? + mission_id? + cwd?
 *   → { ok: true, query, engine, count, urls: [{url,title?,snippet?}],
 *       recorded: "<mission_id>/discovery.json" | null }
 *   | { ok: false, error: 'no_engine: …' | 'search_failed: …' | … }
 *
 * With `mission_id`, hits are recorded into that mission's discovery.json
 * (the one-way bridge the core surfaces; D-M7.4: not ledger rows). Unknown
 * mission dir → `unknown_mission` (the companion never creates mission dirs).
 */
import type { Context } from '@deepseek-ai/cordis'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { enginesForConfig, readDiscoveryConfig } from './config.ts'
import { createBrowser39Engine } from './engines/browser39.ts'
import { createSearxngEngine } from './engines/searxng.ts'
import { DiscoveryStoreError, recordDiscovery } from './discovery-store.ts'
import {
  DISCOVERY_ENGINES,
  type DiscoveryEngine,
  type DiscoveryEngineKind,
} from './discovery-port.ts'
import { runDiscoverySearch } from './discovery-tool.ts'

/** The mission store root under cwd — the file convention the core surfaces
 *  (discovery.json in the mission dir). Documented coupling: if the core
 *  moves its root, this companion follows (V5: no engine code/config in the
 *  core, one file convention in the companion). */
export const MISSION_STORE_DIR = join('.dsh', 'web-missions')

interface ExecLike {
  agent?: { session?: { header?: { cwd?: string } } }
}

/** Verbatim core pattern (C1 review #4). */
export function resolveCwd(args: { cwd?: string }, exec: ExecLike): string {
  const fromArg = args.cwd?.trim()
  if (fromArg) return fromArg
  const fromAgent = exec.agent?.session?.header?.cwd?.trim()
  if (fromAgent) return fromAgent
  throw new Error('cwd required (pass cwd or run from an agent session with a workspace cwd)')
}

const CWD_PARAM = {
  type: 'string',
  description: 'Working directory holding the .dsh store (defaults to the agent session cwd).',
}

function buildEngines(cwd: string): Partial<Record<DiscoveryEngineKind, DiscoveryEngine>> {
  const config = readDiscoveryConfig(cwd)
  const presence = enginesForConfig(config)
  const engines: Partial<Record<DiscoveryEngineKind, DiscoveryEngine>> = {}
  if (presence.searxng) engines.searxng = createSearxngEngine({ endpoint: config.searxngEndpoint })
  if (presence.browser39) engines.browser39 = createBrowser39Engine({ bin: config.browser39Bin })
  return engines
}

type ToolErrorResult = { ok: false; error: string }
type ToolSuccessResult = Record<string, unknown>

export function registerDiscoveryTools(ctx: Context): () => void {
  const disposers: (() => void)[] = []

  const unregisterSearch = ctx.tools.register({
    name: 'discovery_search',
    description:
      'Discover candidate URLs from a local search engine (SearXNG or the ' +
      'browser39 search CLI) — the mission core only sees URLs in / URLs out. ' +
      'Engines are optional: when none is available the result is ' +
      'no_engine (a supported state — supply URLs directly instead). ' +
      'Results are candidates: they pass the mission allowlist gate when fetched. ' +
      'With mission_id, hits are recorded into that mission\u2019s discovery.json ' +
      '(surfaced by mission_status; not ledger rows until fetched).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (non-empty).' },
        engine: {
          type: 'string',
          enum: [...DISCOVERY_ENGINES],
          description: 'Pin one engine; omit to auto-select (searxng first, then browser39).',
        },
        limit: { type: 'number', description: 'Max results (default 10, clamped to 1..50).' },
        mission_id: {
          type: 'string',
          description:
            'Mission id to record hits into (its discovery.json). Omit to search without recording.',
        },
        cwd: CWD_PARAM,
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
          query: { type: 'string' },
          engine: { type: 'string' },
          count: { type: 'number' },
          urls: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                snippet: { type: 'string' },
              },
            },
          },
          recorded: { type: 'string' },
        },
      },
    },
    execute: async (
      args: { query?: string; engine?: DiscoveryEngineKind; limit?: number; mission_id?: string; cwd?: string },
      exec: ExecLike,
    ): Promise<ToolSuccessResult | ToolErrorResult> => {
      let cwd: string
      try {
        cwd = resolveCwd(args, exec)
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      const limit =
        typeof args.limit === 'number' && Number.isFinite(args.limit)
          ? Math.min(50, Math.max(1, Math.round(args.limit)))
          : 10
      let result
      try {
        const engines = buildEngines(cwd)
        result = await runDiscoverySearch({ engines }, args.query ?? '', {
          engine: args.engine,
          limit,
        })
      } catch (error) {
        return { ok: false, error: `internal_error: ${error instanceof Error ? error.message : String(error)}` }
      }
      if (!result.ok) return result

      if (!args.mission_id || !args.mission_id.trim()) {
        return { ok: true, query: result.query, engine: result.engine, count: result.count, urls: result.urls, recorded: null }
      }
      const missionDir = join(cwd, MISSION_STORE_DIR, args.mission_id.trim())
      if (!existsSync(missionDir)) {
        return { ok: false, error: `unknown_mission: no such mission: ${args.mission_id.trim()}` }
      }
      try {
        recordDiscovery(missionDir, result.urls, {
          query: result.query,
          engine: result.engine,
          at: new Date().toISOString(),
        })
      } catch (error) {
        if (error instanceof DiscoveryStoreError) {
          return { ok: false, error: `${error.code}: ${error.message}` }
        }
        return { ok: false, error: `record_failed: ${error instanceof Error ? error.message : String(error)}` }
      }
      return {
        ok: true,
        query: result.query,
        engine: result.engine,
        count: result.count,
        urls: result.urls,
        recorded: join(args.mission_id.trim(), 'discovery.json'),
      }
    },
  })
  disposers.push(unregisterSearch)

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
