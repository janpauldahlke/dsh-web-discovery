/**
 * Host half of dsh-web-discovery (the M7 companion to dsh-web-missions).
 *
 * - `inject: ['tools']` — tool-only companion: `discovery_search` must work
 *   in headless agent sessions (no web face; the client stub is no-op for
 *   C9 shape parity).
 * - The mission core never calls an engine (V5 encapsulation): this plugin
 *   owns both engines (SearXNG HTTP JSON + browser39 search CLI) behind the
 *   DiscoveryPort and hands the core one-way data (discovery.json in the
 *   mission dir — surfaced by mission_status in M7 7.2).
 * - apply must never throw: registration degrades to a logged error.
 */
import type { Context } from '@deepseek-ai/cordis'
import { PLUGIN, VERSION } from '../shared/types.ts'
import { registerDiscoveryTools } from './tools.ts'

export const name = PLUGIN
export const inject = ['tools']

export { PLUGIN, VERSION }

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function apply(ctx: Context): void {
  try {
    const disposeTools = registerDiscoveryTools(ctx)
    // Cordis: return the disposer — calling disposeTools() here unregisters
    // discovery_search immediately on apply (same scar as web-missions).
    ctx.effect(() => disposeTools, 'web-discovery: tools')
  } catch (error) {
    ctx.logger?.(PLUGIN).warn('tool registration failed (continuing without it): %s', errorMessage(error))
  }
}
