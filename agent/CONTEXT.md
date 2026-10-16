# CONTEXT — cold-start handover (authoritative)

**Read order for a new session:** this file → [`PHASES.md`](./PHASES.md) →
[`DECISIONS.md`](./DECISIONS.md) → your phase file → [`NEXT.md`](./NEXT.md).
Everything in [`archive/`](./archive/) is **superseded history** — do not
implement from it.

**Repos:** this one (`~/dev/dsh-web-discovery`) + sibling
`~/dev/dsh-web-missions` (npm `dsh-web-missions@1.0.0`, dsh.pub PR #139 merged).

**Hard rules:** never kill `:3080` (dsh web) / `:8080` (llama) / `:11434`
(ollama). Acceptance web: **`:3090` only** — boot via
`~/dev/dsh-web-missions/agent/scripts/boot-3090.sh`, prefer reuse if already up.
Agents **commit; never push, never `npm publish`** (operator does that).
Cordis scar: never `ctx.effect(() => { disposeTools() })` — return the disposer.

---

## One-line brief

Discovery is missions' **URL supplier**: one tool call turns the mission Goal
into a small, triaged table of **real** URLs (engine registry = the abstraction,
contract v1 receipt = the interface); the same agent's next turn fetches keepers
via `mission_fetch`. URLs in / URLs out, same sequential loop, no second brain.
The product win: **the model stops recalling URLs → fewer 404s** (DECISIONS §0).

## Status (verified 2026-10-16 ~02:00)

| Claim | Reality |
| --- | --- |
| Packaging | **Done.** `dsh-build-tools@^0.2.0`, strict prepare, name `dsh-web-discovery`, GitHub `janpauldahlke/dsh-web-discovery` (`main` clean), npm `1.0.0` latest (+ stale `0.0.0-stage` in the version list) |
| Hermetic tests | **Green** — `npm test` 48 checks (stub SearXNG + fake browser39), re-run 2026-10-16 |
| Live dogfood | **No.** `:3090` is down, so `discovery: off` until booted. **The profile link is fine, not stale** — see the B4 correction below |
| Engines on this box | `browser39` 2.0.0 on PATH (`~/.cargo/bin/browser39`, DDG backend, `uddg` wrappers, **no snippets** — probed 2026-10-13); **no SearXNG installed** (`:8888` free, docker available). Machine pins: `ENV.md` (gitignored) |
| Current tool surface | **One verb:** `discovery_search { query, engine?, limit?, mission_id?, cwd? }`; auto order is still `searxng → browser39` (flip is P_02); `limit` default still **10** (P_01 step 7 changes it to 5) |
| Decisions | **All settled** — `DECISIONS.md` is the Fable-5 verdict with amendments folded in. Preview/scan cut, YaCy dropped, categorizer = optional in-tool stage, same-loop law locked. **Do not re-litigate.** |

## Product contract (do not break)

- **One tool today:** `discovery_search`; missing engines are a **supported
  state** → `{ ok:false, error:"no_engine: …" }`, missions degrades to
  seeds/human URLs.
- **Bridge:** with `mission_id`, write
  `<cwd>/.dsh/web-missions/<id>/discovery.json` — missions **reads only**
  (`readDiscoverySurface` → `mission_status.discovery`). Candidates are **not**
  ledger rows until `mission_fetch` (allowlist applies there).
- **Encapsulation:** the mission core never calls an engine and carries no
  engine config (`DiscoveryPort`, V5).
- **ISO / local-first:** no cloud LLM in the search loop; be honest in the
  README that queries still egress via DDG/SearXNG upstream (CRITIQUE C7).
- **Eris scar:** no DIY DDG scrape — read only browser39's structured output.

## Layout

```
src/host/            index.ts tools.ts config.ts
  discovery-{core,port,store,tool}.ts
  engines/           browser39.ts searxng.ts
src/shared/types.ts  src/client/ (no-op stub)
cordis.patch.yml     id dsh-web-discovery
scripts/smoke-m7.mjs build.mjs (dsh-build-tools)
agent/               the docs you are reading
```

## Blockers (from CRITIQUE — cannot proceed without)

| # | Blocker | Blocks | Who |
| --- | --- | --- | --- |
| B1 | Missions repo files not open in the IDE agent workspace (skill, `readDiscoverySurface`, `mission_fetch` provenance) | P_01 steps 4–6, P_05 | Operator: open as tabs / add module |
| B2 | browser39 CLI capabilities unverified in-session | P_02 step 1 | Operator runs `--help` + one live search, pastes into P_02 |
| B3 | DSH built-in web-search tool name + result shape unknown | P_03 freeze, P_07 | Operator / DSH source |
| B4 | ~~stale `dsh-local-*` link~~ **CORRECTED 2026-10-16 — not a blocker.** DSH resolves bundles by the *dependency key* (`app-boot/src/profile-plugins.ts`: `node_modules/<name>` + `enabled: bundles.includes(name)`), so `dsh-local-web-discovery` → `link:~/dev/dsh-web-discovery` is a **consistent alias**, exactly like the working `dsh-local-web-missions`. Renaming means deps + bundles + symlink + `pnpm-lock.yaml` reinstall on the only working profile — cosmetic and risky, **do not do it**. What's actually left: `:3090` is down | P_01 live checks | Operator boots `:3090` |
| B5 | No SearXNG installed → live fall-through untestable | P_02 live path | Operator (docker, optional) |

## Cross-links

| Item | Where |
| --- | --- |
| Missions skill to amend (P_01) | `~/dev/dsh-web-missions/skills/web-mission-workflow/SKILL.md` (step 2 already says "never invent SERP links"; P_01 hardens it) |
| Missions health badge | `discoveryFace` / `/api/web-missions/health` → `discovery: on|off` |
| Missions bridge read | `readDiscoverySurface` in `~/dev/dsh-web-missions/src/host/store.ts` |
| Build-tools | `~/dev/dsh-build-tools` — `buildDshPlugin`, strict prepare |

## Quick commands

```bash
cd ~/dev/dsh-web-discovery
npm test          # hermetic — must stay green
npm run build     # build.mjs + tsc --noEmit

# After profile wire + :3090 up:
curl -s "http://127.0.0.1:3090/api/web-missions/health?token=$TOKEN" | jq '{discovery}'
```

## Do / don't

**Do:** start at [`NEXT.md`](./NEXT.md) → P_01; fail loud on bad config; treat
`no_engine` as supported; keep the companion separate from missions until P_05;
match missions publish hygiene.

**Don't:** kill sacred ports; soft-prepare; re-break Cordis disposal; invent
SERP URLs in missions while discovery is on; open any UI; build preview/scan/
YaCy/categorizer before their phase; push or publish.
