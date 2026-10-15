// src/shared/types.ts
var PLUGIN = "dsh-web-discovery";
var VERSION = "1.0.0";

// src/host/tools.ts
import { existsSync } from "node:fs";
import { join as join3 } from "node:path";

// src/host/config.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
var CONFIG_DIR = "web-discovery";
var CONFIG_FILENAME = "config.json";
var DEFAULT_SEARXNG_ENDPOINT = "http://127.0.0.1:8888/searxng";
var DEFAULT_BROWSER39_BIN = "browser39";
var DEFAULT_CONFIG = {
  searxngEndpoint: DEFAULT_SEARXNG_ENDPOINT,
  browser39Bin: DEFAULT_BROWSER39_BIN
};
var DiscoveryConfigError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "DiscoveryConfigError";
  }
};
var FIELDS = [
  { key: "searxngEndpoint", kind: "string" },
  { key: "browser39Bin", kind: "string" }
];
function configPath(cwd) {
  return join(cwd, ".dsh", CONFIG_DIR, CONFIG_FILENAME);
}
function readDiscoveryConfig(cwd, env = process.env) {
  let file = {};
  const path = configPath(cwd);
  try {
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new DiscoveryConfigError("config_corrupt", `${path} must be a JSON object`);
    }
    file = parsed;
  } catch (error) {
    if (error.code === "ENOENT") {
    } else if (error instanceof DiscoveryConfigError) {
      throw error;
    } else {
      throw new DiscoveryConfigError(
        "config_corrupt",
        `${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  const config = { ...DEFAULT_CONFIG };
  for (const spec of FIELDS) {
    if (spec.key in file) {
      const value = file[spec.key];
      if (typeof value !== "string") {
        throw new DiscoveryConfigError(
          "config_corrupt",
          `${path}: ${spec.key} must be a string`
        );
      }
      config[spec.key] = value;
    }
  }
  const endpoint = env.SEARXNG_ENDPOINT;
  if (endpoint !== void 0) config.searxngEndpoint = endpoint;
  const bin = env.BROWSER39_BIN;
  if (bin !== void 0) config.browser39Bin = bin;
  return config;
}
function enginesForConfig(config) {
  return {
    searxng: config.searxngEndpoint.trim() !== "",
    browser39: config.browser39Bin.trim() !== ""
  };
}

// src/host/engines/browser39.ts
import { execFile } from "node:child_process";

// src/host/discovery-port.ts
var DISCOVERY_ENGINES = ["searxng", "browser39"];
var DiscoveryEngineError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "DiscoveryEngineError";
  }
};

// src/host/engines/browser39.ts
function defaultRunner(timeoutMs) {
  return (bin, args) => new Promise((resolve) => {
    execFile(
      bin,
      args,
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          const status = error.status;
          resolve({
            code: typeof status === "number" ? status : -1,
            stdout: String(stdout ?? ""),
            stderr: String(stderr ?? ""),
            spawnError: error.code ?? (error instanceof Error ? error.name : void 0)
          });
        } else {
          resolve({ code: 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
        }
      }
    );
  });
}
var DEFAULT_TIMEOUT_MS = 3e4;
var DEFAULT_LIMIT = 10;
var SERP_CHROME_HOST = "duckduckgo.com";
function unwrapSerpHref(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname.toLowerCase() !== SERP_CHROME_HOST) return u.toString();
  if (u.pathname !== "/l/") return null;
  const target = u.searchParams.get("uddg");
  if (!target) return null;
  let t;
  try {
    t = new URL(target);
  } catch {
    return null;
  }
  if (t.protocol !== "http:" && t.protocol !== "https:") return null;
  if (t.hostname.toLowerCase() === SERP_CHROME_HOST) return null;
  return t.toString();
}
function mapSerpPage(page, limit) {
  const links = Array.isArray(page.links) ? page.links : [];
  const seen = /* @__PURE__ */ new Set();
  const hits = [];
  for (const link of links) {
    if (hits.length >= limit) break;
    const href = typeof link.href === "string" ? link.href : "";
    const url = unwrapSerpHref(href);
    if (!url) continue;
    const key = url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const hit = { url };
    const title = typeof link.text === "string" && link.text.trim() !== "" ? link.text.trim() : void 0;
    if (title) hit.title = title;
    hits.push(hit);
  }
  return hits;
}
function createBrowser39Engine(opts) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runner = opts.runner ?? defaultRunner(timeoutMs);
  return {
    kind: "browser39",
    async search(query, searchOpts = {}) {
      const limit = searchOpts.limit ?? DEFAULT_LIMIT;
      let result;
      try {
        result = await runner(opts.bin, ["search", query, "--output", "json", "--no-persist"]);
      } catch (error) {
        throw new DiscoveryEngineError(
          "browser39_missing",
          `browser39 search failed to run: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const spawnError = result.spawnError;
      if (spawnError === "ENOENT" || spawnError === void 0 && result.code === -1 && result.stdout === "" && result.stderr !== "" && /ENOENT/.test(result.stderr)) {
        throw new DiscoveryEngineError("browser39_missing", `browser39 binary not found: ${opts.bin}`);
      }
      if (result.code !== 0) {
        const tail = result.stderr.trim().split("\n").slice(-3).join(" ");
        throw new DiscoveryEngineError("browser39_failed", `browser39 search exited ${result.code}: ${tail || "no stderr"}`);
      }
      let page;
      try {
        page = JSON.parse(result.stdout);
      } catch (error) {
        throw new DiscoveryEngineError(
          "browser39_failed",
          `browser39 search returned non-JSON: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      if (page === null || typeof page !== "object") {
        throw new DiscoveryEngineError("browser39_failed", "browser39 search returned a non-object reply");
      }
      const status = typeof page.status === "number" ? page.status : 200;
      if (status === 202 || status < 200 || status >= 300) {
        throw new DiscoveryEngineError(
          "browser39_blocked",
          `browser39 search blocked by the search engine (HTTP ${status} \u2014 bot challenge or rate limit); retry later or use another engine`
        );
      }
      return mapSerpPage(page, limit);
    }
  };
}

// src/host/engines/searxng.ts
var DEFAULT_TIMEOUT_MS2 = 1e4;
var DEFAULT_LIMIT2 = 10;
function asString(v) {
  return typeof v === "string" && v.trim() !== "" ? v : void 0;
}
function mapSearxngRow(row) {
  const url = asString(row.url);
  if (!url) return null;
  let isHttp = false;
  try {
    const u = new URL(url);
    isHttp = u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return null;
  }
  if (!isHttp) return null;
  const hit = { url };
  const title = asString(row.title);
  if (title) hit.title = title;
  const snippet = asString(row.content);
  if (snippet) hit.snippet = snippet;
  return hit;
}
function createSearxngEngine(opts) {
  const endpoint = opts.endpoint.replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
  const fetchImpl = opts.fetchImpl ?? fetch;
  return {
    kind: "searxng",
    async search(query, searchOpts = {}) {
      if (!endpoint) {
        throw new DiscoveryEngineError("searxng_unreachable", "searxng endpoint is not configured");
      }
      const limit = searchOpts.limit ?? DEFAULT_LIMIT2;
      const qs = new URLSearchParams({ q: query, format: "json" });
      const res = await fetchImpl(`${endpoint}/search?${qs.toString()}`, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json" }
      }).catch((error) => {
        throw new DiscoveryEngineError(
          "searxng_unreachable",
          `searxng unreachable at ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
        );
      });
      if (!res.ok) {
        throw new DiscoveryEngineError("searxng_unreachable", `searxng ${res.status} at ${endpoint}`);
      }
      let body;
      try {
        body = await res.json();
      } catch (error) {
        throw new DiscoveryEngineError(
          "searxng_unreachable",
          `searxng replied non-JSON from ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      const results = body?.results;
      if (!Array.isArray(results)) {
        throw new DiscoveryEngineError("searxng_unreachable", `searxng reply has no results[] from ${endpoint}`);
      }
      const hits = [];
      for (const row of results) {
        const hit = mapSearxngRow(row);
        if (hit) hits.push(hit);
        if (hits.length >= limit) break;
      }
      return hits;
    }
  };
}

// src/host/discovery-store.ts
import { mkdirSync, readFileSync as readFileSync2, renameSync, writeFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";
var DISCOVERY_FILENAME = "discovery.json";
var DiscoveryStoreError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "DiscoveryStoreError";
  }
};
function discoveryPath(missionDir) {
  return join2(missionDir, DISCOVERY_FILENAME);
}
function readDiscoveryFile(missionDir) {
  const path = discoveryPath(missionDir);
  let raw;
  try {
    raw = readFileSync2(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new DiscoveryStoreError("discovery_unwritable", `cannot read ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.urls) || typeof parsed.updated_at !== "string") {
      throw new Error("bad shape");
    }
    return parsed;
  } catch (error) {
    throw new DiscoveryStoreError("discovery_corrupt", `${path} is not valid discovery.json: ${error instanceof Error ? error.message : String(error)}`);
  }
}
function recordDiscovery(missionDir, hits, via) {
  const at = via.at ?? (/* @__PURE__ */ new Date()).toISOString();
  if (typeof at !== "string" || at.length === 0) {
    throw new DiscoveryStoreError("bad_provenance", `via.at must be an ISO timestamp string (got ${String(via.at)})`);
  }
  const file = readDiscoveryFile(missionDir) ?? { updated_at: at, urls: [] };
  const seen = new Set(file.urls.map((u) => u.url.toLowerCase()));
  for (const hit of hits) {
    const key = hit.url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    file.urls.push({ ...hit, via: { ...via, at } });
  }
  file.updated_at = at;
  const path = discoveryPath(missionDir);
  const tmp = `${path}.tmp-${process.pid}`;
  mkdirSync(dirname(path), { recursive: true });
  try {
    writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n");
    renameSync(tmp, path);
  } catch (error) {
    throw new DiscoveryStoreError("discovery_unwritable", `cannot write ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return file;
}

// src/host/discovery-tool.ts
function engineReason(kind, error) {
  switch (error.code) {
    case "searxng_unreachable":
      return "searxng not running at the configured endpoint";
    case "browser39_missing":
      return "browser39 search binary not found";
    case "browser39_blocked":
      return "browser39 blocked by the search engine (bot challenge / rate limit)";
    default:
      return `${kind} engine error (${error.code})`;
  }
}
async function runDiscoverySearch(deps, rawQuery, opts = {}) {
  const query = rawQuery.trim();
  if (!query) {
    return { ok: false, error: "query_required: pass a non-empty search query" };
  }
  const limit = opts.limit ?? 10;
  const candidates = opts.engine ? [opts.engine] : DISCOVERY_ENGINES.filter((k) => deps.engines[k] !== void 0);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "no_engine: no discovery engines configured (searxng endpoint not configured; browser39 search not configured) \u2014 missing discovery is a supported state; supply URLs directly (fixtures or manual)"
    };
  }
  const failures = [];
  for (const kind of candidates) {
    const engine = deps.engines[kind];
    if (!engine) {
      failures.push(
        kind === "searxng" ? "searxng endpoint not configured" : "browser39 search not configured"
      );
      continue;
    }
    try {
      const urls = await engine.search(query, { limit });
      return { ok: true, query, engine: engine.kind, count: urls.length, urls };
    } catch (error) {
      if (error instanceof DiscoveryEngineError && (error.code === "searxng_unreachable" || error.code === "browser39_missing" || error.code === "browser39_blocked")) {
        failures.push(engineReason(engine.kind, error));
        continue;
      }
      if (error instanceof DiscoveryEngineError && error.code === "browser39_failed") {
        return { ok: false, error: `search_failed: ${error.message}` };
      }
      return {
        ok: false,
        error: `search_failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  const reason = candidates.length === 1 && opts.engine ? `${opts.engine}: ${failures[0] ?? "unavailable"}` : failures.join("; ");
  return { ok: false, error: `no_engine: ${reason} \u2014 missing discovery is a supported state; supply URLs directly (fixtures or manual)` };
}

// src/host/tools.ts
var MISSION_STORE_DIR = join3(".dsh", "web-missions");
function resolveCwd(args, exec) {
  const fromArg = args.cwd?.trim();
  if (fromArg) return fromArg;
  const fromAgent = exec.agent?.session?.header?.cwd?.trim();
  if (fromAgent) return fromAgent;
  throw new Error("cwd required (pass cwd or run from an agent session with a workspace cwd)");
}
var CWD_PARAM = {
  type: "string",
  description: "Working directory holding the .dsh store (defaults to the agent session cwd)."
};
function buildEngines(cwd) {
  const config = readDiscoveryConfig(cwd);
  const presence = enginesForConfig(config);
  const engines = {};
  if (presence.searxng) engines.searxng = createSearxngEngine({ endpoint: config.searxngEndpoint });
  if (presence.browser39) engines.browser39 = createBrowser39Engine({ bin: config.browser39Bin });
  return engines;
}
function registerDiscoveryTools(ctx) {
  const disposers = [];
  const unregisterSearch = ctx.tools.register({
    name: "discovery_search",
    description: "Discover candidate URLs from a local search engine (SearXNG or the browser39 search CLI) \u2014 the mission core only sees URLs in / URLs out. Engines are optional: when none is available the result is no_engine (a supported state \u2014 supply URLs directly instead). Results are candidates: they pass the mission allowlist gate when fetched. With mission_id, hits are recorded into that mission\u2019s discovery.json (surfaced by mission_status; not ledger rows until fetched).",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", description: "Search query (non-empty)." },
        engine: {
          type: "string",
          enum: [...DISCOVERY_ENGINES],
          description: "Pin one engine; omit to auto-select (searxng first, then browser39)."
        },
        limit: { type: "number", description: "Max results (default 10, clamped to 1..50)." },
        mission_id: {
          type: "string",
          description: "Mission id to record hits into (its discovery.json). Omit to search without recording."
        },
        cwd: CWD_PARAM
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: true,
        properties: {
          ok: { type: "boolean" },
          error: { type: "string" },
          query: { type: "string" },
          engine: { type: "string" },
          count: { type: "number" },
          urls: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                snippet: { type: "string" }
              }
            }
          },
          recorded: { type: "string" }
        }
      }
    },
    execute: async (args, exec) => {
      let cwd;
      try {
        cwd = resolveCwd(args, exec);
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.min(50, Math.max(1, Math.round(args.limit))) : 10;
      let result;
      try {
        const engines = buildEngines(cwd);
        result = await runDiscoverySearch({ engines }, args.query ?? "", {
          engine: args.engine,
          limit
        });
      } catch (error) {
        return { ok: false, error: `internal_error: ${error instanceof Error ? error.message : String(error)}` };
      }
      if (!result.ok) return result;
      if (!args.mission_id || !args.mission_id.trim()) {
        return { ok: true, query: result.query, engine: result.engine, count: result.count, urls: result.urls };
      }
      const missionDir = join3(cwd, MISSION_STORE_DIR, args.mission_id.trim());
      if (!existsSync(missionDir)) {
        return { ok: false, error: `unknown_mission: no such mission: ${args.mission_id.trim()}` };
      }
      try {
        recordDiscovery(missionDir, result.urls, {
          query: result.query,
          engine: result.engine,
          at: (/* @__PURE__ */ new Date()).toISOString()
        });
      } catch (error) {
        if (error instanceof DiscoveryStoreError) {
          return { ok: false, error: `${error.code}: ${error.message}` };
        }
        return { ok: false, error: `record_failed: ${error instanceof Error ? error.message : String(error)}` };
      }
      return {
        ok: true,
        query: result.query,
        engine: result.engine,
        count: result.count,
        urls: result.urls,
        recorded: join3(args.mission_id.trim(), "discovery.json")
      };
    }
  });
  disposers.push(unregisterSearch);
  return () => {
    for (const dispose of disposers.splice(0)) dispose();
  };
}

// src/host/index.ts
var name = PLUGIN;
var inject = ["tools"];
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function apply(ctx) {
  try {
    const disposeTools = registerDiscoveryTools(ctx);
    ctx.effect(() => disposeTools, "web-discovery: tools");
  } catch (error) {
    ctx.logger?.(PLUGIN).warn("tool registration failed (continuing without it): %s", errorMessage(error));
  }
}
export {
  PLUGIN,
  VERSION,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
