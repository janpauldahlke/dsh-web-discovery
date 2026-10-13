/**
 * Discovery ledger file (the bridge to the core's optional surface).
 *
 * The companion writes `<missionRoot>/<mission_id>/discovery.json` — data the
 * mission core SURFACES (a `discovery` object on mission_status, M7 7.2).
 * The core never calls an engine; this file is the only coupling, and it is
 * one-way: companion writes, core reads.
 *
 * D-M7.4: discovered URLs are NOT ledger rows — no manifest/fetched rows, no
 * pages/ artifacts, no budget here. They become rows only when the core
 * fetches them (through the allowlist gate).
 *
 * File shape (v0):
 *   {
 *     "updated_at": "<ISO of the last record>",
 *     "urls": [
 *       { "url": "…", "title?": "…", "snippet?": "…",
 *         "via": { "query": "…", "engine": "searxng|browser39", "at": "<ISO>" } }
 *     ]
 *   }
 *
 * Record semantics: append new URLs (deduped case-insensitively,
 * first-seen provenance wins), refresh `updated_at`, rewrite atomically
 * (temp + rename, the core's fs discipline). Absent file = nothing
 * discovered yet. Corrupt file = fail loud (never guess over operator data).
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DiscoveryEngineKind, DiscoveryHit } from './discovery-port.ts'

export const DISCOVERY_FILENAME = 'discovery.json'

export interface DiscoveryProvenance {
  query: string
  engine: DiscoveryEngineKind
  at: string
}

export interface DiscoveryUrlEntry extends DiscoveryHit {
  via: DiscoveryProvenance
}

export interface DiscoveryFile {
  updated_at: string
  urls: DiscoveryUrlEntry[]
}

export class DiscoveryStoreError extends Error {
  constructor(
    readonly code: 'unknown_mission' | 'discovery_corrupt' | 'discovery_unwritable' | 'bad_provenance',
    message: string,
  ) {
    super(message)
    this.name = 'DiscoveryStoreError'
  }
}

export function discoveryPath(missionDir: string): string {
  return join(missionDir, DISCOVERY_FILENAME)
}

/** Read the discovery file for a mission dir; null when absent. Corrupt →
 *  DiscoveryStoreError (fail loud). */
export function readDiscoveryFile(missionDir: string): DiscoveryFile | null {
  const path = discoveryPath(missionDir)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new DiscoveryStoreError('discovery_unwritable', `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as DiscoveryFile).urls) ||
      typeof (parsed as DiscoveryFile).updated_at !== 'string'
    ) {
      throw new Error('bad shape')
    }
    return parsed as DiscoveryFile
  } catch (error) {
    throw new DiscoveryStoreError('discovery_corrupt', `${path} is not valid discovery.json: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Merge `hits` (from one query) into the mission's discovery file and
 *  return the written file. `missionDir` must exist (the core owns mission
 *  dirs — unknown dir = unknown_mission, never created here). */
export function recordDiscovery(
  missionDir: string,
  hits: DiscoveryHit[],
  via: DiscoveryProvenance,
): DiscoveryFile {
  // `updated_at` must always land as a string: the core REJECTS a discovery
  // file without one (fail loud), so a missing `via.at` falls back to now
  // (the record moment) instead of writing a file the core cannot read.
  const at = via.at ?? new Date().toISOString()
  if (typeof at !== 'string' || at.length === 0) {
    throw new DiscoveryStoreError('bad_provenance', `via.at must be an ISO timestamp string (got ${String(via.at)})`)
  }
  const file = readDiscoveryFile(missionDir) ?? { updated_at: at, urls: [] }
  const seen = new Set(file.urls.map((u) => u.url.toLowerCase()))
  for (const hit of hits) {
    const key = hit.url.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    file.urls.push({ ...hit, via: { ...via, at } })
  }
  file.updated_at = at
  const path = discoveryPath(missionDir)
  const tmp = `${path}.tmp-${process.pid}`
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(tmp, JSON.stringify(file, null, 2) + '\n')
    renameSync(tmp, path)
  } catch (error) {
    throw new DiscoveryStoreError('discovery_unwritable', `cannot write ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return file
}
