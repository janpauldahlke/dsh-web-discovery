# HANDOVER — `dsh-web-discovery` (next board)

**Repo (local):** `~/dev/dsh-web-discovery`  
**Sibling (shipped):** `~/dev/dsh-web-missions` → npm + dsh.pub **`dsh-web-missions@1.0.0`**  
  ([dsh.pub PR #139](https://github.com/dsh-pub/dsh-pub/pull/139) **merged** 2026-10-15)  
**Written:** 2026-10-16 ~00:00 (after missions publish + catalog list)  
**Audience:** next Cursor session going in **cold** — Hagbard wants **build-tools first**, then product features.

Sacred ports: never kill **`:3080` / `:8080`**. Acceptance web: **`:3090`** only.

---

## One-line brief

Discovery is the **optional opener** for web-missions: local SERP → candidate URLs → missions fetches. Hermetic smoke is green; **not wired into the live profile**, **not on npm**, **no GitHub remote yet**. Next: **package like missions (`dsh-build-tools`) → rename to `dsh-web-discovery` → wire live → then high-signal ranking**. Do not invent cloud search.

---

## Frank status (2026-10-16)

| Claim | Reality |
| --- | --- |
| Hermetic product? | **Yes.** `npm test` / `scripts/smoke-m7.mjs` was **48 checks green** (stub SearXNG + fake browser39). Re-run before trusting. |
| Live dogfood? | **No.** Missions health `discovery: off` until this package is on the profile Loader. |
| npm / dsh.pub? | **Neither.** Checked 2026-10-16: **`dsh-web-discovery` free** (404). `dsh-local-web-discovery` also free. |
| GitHub? | `package.json` points at `janpauldahlke/dsh-web-discovery` but **local clone has no `git remote`** (repo may not exist yet). Create + push is part of P1. |
| UI? | **None by design** (tool-only + no-op client stub). Visibility = missions badge `discovery: on\|off` + `discovery.json` on disk. |
| Build? | **Hand-rolled `build.mjs`** (esbuild ×3: host / `discovery.mjs` / client). Soft `prepare` fallback — **missions already killed soft prepare**; match that. |

Working tree may have dirty files (`README.md`, `lib/`, `src/host/index.ts`) — inspect before first commit.

---

## Product contract (do not break)

- **One tool:** `discovery_search { query, engine?, limit?, mission_id?, cwd? }`
- **Engines (both local, both optional):**
  - SearXNG HTTP JSON — default `http://127.0.0.1:8888/searxng` (**not** `:8080`)
  - `browser39 search` — SERP + DDG `uddg` unwrap (no DIY HTML scrape — Eris scar)
- **Missing engines = supported:** `{ ok: false, error: "no_engine: …" }` → missions uses seeds / human URLs.
- **Bridge:** with `mission_id`, write  
  `<cwd>/.dsh/web-missions/<id>/discovery.json`  
  Missions **reads** only (one-way). Candidates are **not** ledger rows until `mission_fetch` (allowlist applies there).
- **ISO / local-first:** no cloud LLM in the search loop; self-hosted SearXNG and/or local browser39; fetch egress still gated by missions allowlist. SearXNG upstream may still hit the public web — stay honest in README.

Layout:

```
src/host/
  index.ts tools.ts
  discovery-{core,port,store,tool}.ts
  engines/          # searxng + browser39
  config.ts
src/client/         # no-op ModuleLoader stub
cordis.patch.yml    # id/name still dsh-local-web-discovery
scripts/smoke-m7.mjs
build.mjs           # hand-rolled — migrate away
```

---

## Recommended order (binding)

### P0 — `dsh-build-tools` + packaging parity (**start here**)

Missions already ships the pattern. Mirror it **before** feature work:

1. `npm i -D dsh-build-tools@^0.2.0` (keep `esbuild` as peer/dev like siblings).
2. Collapse `build.mjs` to `await buildDshPlugin({ modules: [{ entry: 'src/host/discovery-core.ts', out: 'discovery.mjs' }] })` (preserve the standalone smoke entry).
3. **Strict prepare:** `"prepare": "node build.mjs"` — **no** soft `|| warn` fallback.
4. Keep `tsc --noEmit` on `build` (type gate; build-tools does not typecheck).
5. `npx dsh-verify-plugin` when migrating existing `lib/` if useful.
6. Re-run `npm test` — must stay green.

**Name (do with packaging):** align to **`dsh-web-discovery`** (drop `local-`, same as missions). One pass: `package.json` `name`, `cordis.patch.yml` `id`/`name`, ModuleLoader id (via pkg name), README, missions README companion line. Registry still free as of this handover.


### OPERATOR: P0.5

* we deliver 3 different search engines tonite, thhe ones already work count, and then wire in webmission and pressed the agent so he does no need to invent links but can really find them, we take over the config idea of depth here, how many subage.  also we need a determistic meachnism for the pattern

read article preview, categoize is it worth diving, next -> scan (lmited by dept) so he only keeps lins that are worht diving
this is the real fun part to build and thinkg abput agentic and interfaces.

i might be good to know i plan to ALWAYS include this package into te webmissin pachake. we own both.

ideally we keep it so we can add up o n searchEnfgines, we need like to type their API and translate this into our uniform types. 



### P1 — Make it real 

**OPERATOR HERE** AGENTS ONLY COMMIT; NEVER OUSH OR npm publish

1. Create public GitHub **`janpauldahlke/dsh-web-discovery`**; `git remote add` + push `main`.
2. Profile wire:  
   `~/.dsh/profiles/web/node_modules/dsh-web-discovery` → this checkout  
   + Loader sees the bundle patch.
3. Boot **`:3090` only**. AC:
   - tool list includes `discovery_search`
   - missions `/health` → `discovery: "on"`
   - one search with `mission_id` → `discovery.json` → `mission_status` shows URLs
4. Engines: SearXNG on `:8888`? If not, disable via config and prove **browser39** (or honest `no_engine`).

### P2 — Publish + list

1. `npm publish` as **`dsh-web-discovery@1.0.0`**.
2. Submit `https://github.com/janpauldahlke/dsh-web-discovery` at [dsh.pub/en/submit](https://dsh.pub/en/submit/) (missions precedent: PR #139).
3. Pin profile to curated npm version (not only `link:`).
4. GitHub description + ~8–10 topics — sibling style from missions/memento.

### P3 — High-signal pre-fetch (features **after** P0–P1)

Better **candidate quality** before missions spends budget — still **URLs in / URLs out**.

- Rank / filter SERP: prefer primary docs / official hosts; demote junk, login walls, duplicate hosts.
- Cap N candidates to fit missions depth/host fence.
- Keep honest empty / blocked / bot-challenge receipts (`browser39_blocked` scars).
- Optional: operator host priors in config — not an endless hardcoded host list.

**Out of scope unless asked:** full rightbar pane; folding engines into missions; DIY DDG scrape; cloud LLM “smart search”.

---

## Cross-links

| Item | Where |
| --- | --- |
| Missions (shipped) | `~/dev/dsh-web-missions` — skill: “if `discovery_search` present, use first” |
| Missions health badge | `discoveryFace` / pane / `/api/web-missions/health` |
| Missions bridge read | `readDiscoverySurface` → `mission_status.discovery` |
| Build-tools | `~/dev/dsh-build-tools` — `buildDshPlugin`, `modules`, strict prepare |

---

## Quick commands

```bash
cd ~/dev/dsh-web-discovery
npm test          # hermetic — expect ALL GREEN before/after build-tools migrate
npm run build

# After profile wire + :3090:
curl -s "http://127.0.0.1:3090/api/web-missions/health?token=$TOKEN" | jq '{discovery, tools}'
```

---

## Do / don’t

**Do**

- Start at **P0 build-tools + rename**; features only after live `discovery: on`.
- Keep companion separate from missions.
- Fail loud on bad config; treat `no_engine` as supported.
- Match missions publish hygiene: LICENSE, README install, no secrets, `lib/` tracked.

**Don’t**

- Kill `:3080` / `:8080`.
- Soft-prepare again.
- Re-break Cordis: never `ctx.effect(() => { disposeTools() })`.
- Invent SERP URLs in missions when this tool is missing.
- Open a big sidebar UI without an explicit ask.

---

## First Cursor actions (cold start)

1. Read this file + `README.md`; run `npm test`.
2. Diff `build.mjs` vs missions’ `dsh-build-tools` wrapper; plan `modules` for `discovery.mjs`.
3. Execute **P0** (build-tools + strict prepare + name → `dsh-web-discovery`).
4. Only then P1 wire / P2 publish / P3 ranking.
