/**
 * Discovery config (companion's own knobs — the mission core carries NO
 * engine config; V5 encapsulation check).
 *
 * Source order (per cwd, resolved at tool-call time like the core):
 *   1. defaults below;
 *   2. `<cwd>/.dsh/web-discovery/config.json` — OPTIONAL file; every field
 *      optional, merges over defaults; corrupt → fail loud (same discipline
 *      as the core's config); unknown keys ignored;
 *   3. env overrides: SEARXNG_ENDPOINT, BROWSER39_BIN (same names the core
 *      honors — one mechanism across the pair).
 *
 * A knob set to the EMPTY STRING disables that engine (the tool layer then
 * reports it as absent → no_engine).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiscoveryEngineKind } from './discovery-port.ts'

export interface DiscoveryConfig {
  /** SearXNG instance base incl. path prefix. NOT :8080 — that port is llama. */
  searxngEndpoint: string
  /** browser39 binary (path or PATH name). Empty = engine disabled. */
  browser39Bin: string
}

export const CONFIG_DIR = 'web-discovery'
export const CONFIG_FILENAME = 'config.json'

/** Plan default: self-hosted instance on this box (operator hand-sets in ENV.md). */
export const DEFAULT_SEARXNG_ENDPOINT = 'http://127.0.0.1:8888/searxng'
/** Plan default: `browser39` on PATH (the core's BROWSER39_BIN override wins). */
export const DEFAULT_BROWSER39_BIN = 'browser39'

export const DEFAULT_CONFIG: DiscoveryConfig = {
  searxngEndpoint: DEFAULT_SEARXNG_ENDPOINT,
  browser39Bin: DEFAULT_BROWSER39_BIN,
}

export class DiscoveryConfigError extends Error {
  constructor(
    readonly code: 'config_corrupt',
    message: string,
  ) {
    super(message)
    this.name = 'DiscoveryConfigError'
  }
}

type FieldSpec =
  | { key: 'searxngEndpoint'; kind: 'string' }
  | { key: 'browser39Bin'; kind: 'string' }

const FIELDS: readonly FieldSpec[] = [
  { key: 'searxngEndpoint', kind: 'string' },
  { key: 'browser39Bin', kind: 'string' },
]

export function configPath(cwd: string): string {
  return join(cwd, '.dsh', CONFIG_DIR, CONFIG_FILENAME)
}

export function readDiscoveryConfig(cwd: string, env: NodeJS.ProcessEnv = process.env): DiscoveryConfig {
  let file: Record<string, unknown> = {}
  const path = configPath(cwd)
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new DiscoveryConfigError('config_corrupt', `${path} must be a JSON object`)
    }
    file = parsed as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // absent file = all defaults
    } else if (error instanceof DiscoveryConfigError) {
      throw error
    } else {
      throw new DiscoveryConfigError(
        'config_corrupt',
        `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  const config: DiscoveryConfig = { ...DEFAULT_CONFIG }
  for (const spec of FIELDS) {
    if (spec.key in file) {
      const value = file[spec.key]
      if (typeof value !== 'string') {
        throw new DiscoveryConfigError(
          'config_corrupt',
          `${path}: ${spec.key} must be a string`,
        )
      }
      config[spec.key] = value
    }
  }
  // env overrides win over the file (operator can redirect without touching disk).
  const endpoint = env.SEARXNG_ENDPOINT
  if (endpoint !== undefined) config.searxngEndpoint = endpoint
  const bin = env.BROWSER39_BIN
  if (bin !== undefined) config.browser39Bin = bin
  return config
}

export interface EnginePresence {
  searxng: boolean
  browser39: boolean
}

/** Which engines exist per config (empty string = disabled). */
export function enginesForConfig(config: DiscoveryConfig): EnginePresence {
  return {
    searxng: config.searxngEndpoint.trim() !== '',
    browser39: config.browser39Bin.trim() !== '',
  }
}

export type { DiscoveryEngineKind }
