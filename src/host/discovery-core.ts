/**
 * Standalone entry (lib/discovery.mjs): the discovery core without cordis —
 * port + engines + tool logic + discovery store. Rebuilt as its own bundle
 * so the smoke can unit-test everything without the @deepseek-ai/* externals
 * (endpoint-health latch/metrics pattern).
 */
export {
  DISCOVERY_ENGINES,
  DiscoveryEngineError,
} from './discovery-port.ts'
export type {
  DiscoveryEngine,
  DiscoveryEngineKind,
  DiscoveryHit,
  DiscoveryPort,
  SearchOptions,
} from './discovery-port.ts'

export { createSearxngEngine, mapSearxngRow } from './engines/searxng.ts'
export type { SearxngEngineOptions } from './engines/searxng.ts'

export {
  createBrowser39Engine,
  defaultRunner,
  mapSerpPage,
  unwrapSerpHref,
} from './engines/browser39.ts'
export type { Browser39CliResult, Browser39EngineOptions, Browser39Runner } from './engines/browser39.ts'

export { runDiscoverySearch } from './discovery-tool.ts'
export type { DiscoveryToolDeps, DiscoveryToolResult } from './discovery-tool.ts'

export {
  DISCOVERY_FILENAME,
  DiscoveryStoreError,
  discoveryPath,
  readDiscoveryFile,
  recordDiscovery,
} from './discovery-store.ts'
export type { DiscoveryFile, DiscoveryProvenance, DiscoveryUrlEntry } from './discovery-store.ts'

export {
  CONFIG_DIR,
  CONFIG_FILENAME,
  DEFAULT_BROWSER39_BIN,
  DEFAULT_CONFIG,
  DEFAULT_SEARXNG_ENDPOINT,
  DiscoveryConfigError,
  configPath,
  enginesForConfig,
  readDiscoveryConfig,
} from './config.ts'
export type { DiscoveryConfig, EnginePresence } from './config.ts'
