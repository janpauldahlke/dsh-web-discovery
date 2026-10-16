# dsh-web-discovery

Discovery companion for **[`dsh-web-missions`](https://github.com/janpauldahlke/dsh-web-missions)**
(npm: `dsh-web-missions`). Happy-path opener for web research missions:
the model gets candidate URLs from **local** search engines, encapsulated in
their own package — the mission core only sees **URLs in / URLs out**.

Agent/dev handover: see **`agent/CONTEXT.md`**. Publish/curate this package on npm
and pin the profile to a known-good version alongside missions.

Two engines, both local, both optional (D-M7.2):

| Engine | Transport | Config |
| --- | --- | --- |
| **SearXNG** | HTTP JSON — `GET {endpoint}/search?q=…&format=json` → `results[{url,title,content}]` | `searxng_endpoint` (default `http://127.0.0.1:8888/searxng` — not :8080, that port is llama) |
| **`browser39 search`** | CLI — `browser39 search <q> --output json --no-persist` (fetch-shaped SERP page; DDG `uddg` redirect unwrap) | `browser39_bin` (default `browser39`; `BROWSER39_BIN` override) |

**Missing discovery is a supported state** (D-M7.3): no SearXNG running + no
browser39 binary → the tool returns `no_engine` and the mission core degrades
to fixtures / human-supplied URLs. No DIY SERP scraping in our code (Eris
scar, D4).

## The one tool

```
discovery_search { query, engine?, limit?, mission_id?, cwd? }
  → { ok: true, query, engine, count, urls: [{ url, title?, snippet? }],
      recorded: "<mission_id>/discovery.json" | null }
  | { ok: false, error: "no_engine: …" | "search_failed: …" | "unknown_mission: …" }
```

- `engine` pins `searxng` or `browser39`; omitted = auto (searxng first, then
  browser39 — first engine that answers wins).
- With `mission_id`, hits are recorded into
  `<cwd>/.dsh/web-missions/<mission_id>/discovery.json` (one-way bridge:
  companion writes, the core surfaces it on `mission_status`). Discovered
  URLs are **not ledger rows** (D-M7.4) — they become rows only when the
  core fetches them, through the allowlist gate.

## Config (per cwd, at tool-call time)

`<cwd>/.dsh/web-discovery/config.json` (optional; corrupt = fail loud),
env overrides win: `SEARXNG_ENDPOINT`, `BROWSER39_BIN`. A knob set to the
empty string disables that engine.

## Egress note (S6)

SearXNG still egresses to upstream engines (Google/Bing/DDG). The no-cloud-LLM
claim is untouched (no LLM in the loop); the allowlist covers **fetch** only —
discovery results are candidates, gated when fetched.

## Build / test

```
npm run build   # lib/index.js (host) + lib/discovery.mjs (core) + lib/client.js (no-op)
npm test        # hermetic smoke (stub SearXNG + fake browser39 CLI, no network)
```
