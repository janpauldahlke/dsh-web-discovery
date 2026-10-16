# DECISIONS — locked verdict (Fable 5 session, 2026-10-16)

**This is the only decision file.** It merges the former `P_00.md` (Fable 5
verdict) and `P_00-AMEND.md` (authoritative amendments) — amendments are folded
in inline below, not kept separate. Superseded drafts live in
[`archive/`](./archive/); the phase index is [`PHASES.md`](./PHASES.md).

**Framing question that produced this:**
[`archive/FABLE-5-discovery-loop.md`](./archive/FABLE-5-discovery-loop.md) ·
**Stress test:** [`CRITIQUE.md`](./CRITIQUE.md)

Rules for every session: never kill `:3080` / `:8080`; dogfood web on `:3090`
only; agents **commit, never push / never publish**; `npm test` green at the end
of every phase.

---

## 0. The real product (re-framed)

The core problem is in **missions**, not discovery:

> On `mission_start`, either the user pastes the URLs or the model "remembers"
> them. That leads to **bad URLs and lots of 404s**.

So discovery's value is mostly **"real URLs instead of hallucinated ones"**.
Ranking and categorizing come second — any real SERP URL already beats a
recalled one. That sets the priority order:

1. **Get it live and make the skill strict** (no invented URLs while discovery
   is on). Biggest win, near-zero cost. → [`P_01.md`](./P_01.md)
2. Cheap triage inside the search receipt. → [`P_03.md`](./P_03.md)
3. Optional categorizer. → [`P_04.md`](./P_04.md)
4. Extra engines. → not planned (see §6).

---

## 1. Constraint verdict

**The "same sequential turn loop" is hard law for v0 and v1.** Discovery is not
a parallel sidecar, not a background worker, not a subagent: every `discovery_*`
call costs one agent step, dumps a receipt into context, and burns wall clock
while the human waits.

`mission_fetch` already acts as the quality gate (`page_quality`). A subagent
would add a second token stream on a box with no headroom (27B at ~15 tok/s) and
would only fix a problem we have not measured.

**Corollary:** `discovery_preview` and `discovery_scan` are **cut from v0**.
Preview would duplicate `mission_fetch` (same browser, same cost, but no ledger
row); scan duplicates missions' depth fence. Both may return only if the kill
criteria in §9 show they are needed.

---

## 2. Budget (sized to qwen 27B Q4 · 128k ctx · ~15 tok/s · compaction at 60–80%)

| Budget | Value | Why |
| --- | --- | --- |
| Discovery tool calls before the first `mission_fetch` | **≤ 2** (1 search + 1 optional reformulate) | Each turn costs ~10–30 s of model output at 15 tok/s |
| Results per search (`limit`) | **5** (max 8) | The main model judges 5 rows nearly for free |
| Discovery receipt in context | **≤ ~1.5k tokens per call, ≤ 3k total** | ~2% of 128k — must not push compaction earlier |
| Wall clock per `discovery_search` | **45 s total** (`maxDiscoveryMs`) → `budget_exhausted`; browser39 gets **≤ 25 s** of it | browser39 takes 5–30 s; the SearXNG fallback must still fit |
| Categorizer (if on) | **≤ 5 s added, 0 extra steps** | Runs *inside* the search call |

Happy path step count: **≤ 4** discovery-related steps before the first
`mission_fetch` (start → search → fetch → read/note).

---

## 3. Architecture pick: **A now, B as an optional in-tool stage, never C**

- **A (chosen default):** `discovery_search` returns a **compact, triaged
  table** — real URLs, title, host, deterministic flags (`dup_host`,
  `login_cue`, `token_miss`, `denylisted`), already sorted.
- **The main model picks** 1–2 rows and calls `mission_fetch`. **Fetch is the
  preview**: missions already returns `thin` / `js_shell` / 404 and records a
  ledger row. On a bad result the model takes the next row from the same table
  *without searching again*.
- **B (optional, later):** a categorizer that runs *inside* the tool — see §4.
- **C (refused):** subagent / nested loop / background worker. Not built.

**Critical insight behind the pick:** the outer agent *already categorizes* if
the tool returns a small table. A 1–2B model only wins if it removes steps or
previews the main model would otherwise burn — not if it adds a step to
rubberstamp the same five URLs.

---

## 4. The categorizer: one interface, two impls, always-on heuristic layer

One `Categorizer` interface with two implementations:

| Impl | Default | What it does |
| --- | --- | --- |
| `heuristic` | **on** | Deterministic, no I/O: URL/host regex, docs/official cues, login cues, dup host, token miss, operator denylist/priors |
| `llm` | **opt-in** | OpenAI-compatible client on top of `heuristic`; on any failure the heuristic labels stand |

The closed label set **`primary | reference | forum | commercial | junk`** is
emitted by both, so **every row always has a `label`**.

LLM impl rules (what keeps it from becoming a nested researcher):

- **When:** inside `discovery_search`, after the engine responds and the
  heuristics run, before the receipt is returned. **0 extra agent steps.**
- **Input:** goal/query + ≤ 8 rows of `{url, host, title, snippet?}`.
  **Output:** labels only, per row: `{i, label, keep}`. **It never rewrites the
  query and never fetches.**
- **Transport:** one OpenAI-compatible `/v1/chat/completions` client, config
  `{ categorizerEndpoint, categorizerModel, categorizerApiKeyEnv, timeoutMs }`.
  Covers local llama.cpp / ollama on **its own port (never `:8080`)** and hosted
  models (**opt-in; breaks local-first** — README and receipt must say
  `categorizer: llm-remote`).
- **VRAM reality:** 27B Q4 + 128k KV already fills 32 GB. A 1–2B Q4 model
  (~1–1.5 GB) is **recommended on CPU**: classifying 8 rows of titles is a few
  hundred tokens, a few seconds, no GPU fight.
- **Failure:** endpoint empty → off. Timeout / error / bad JSON → receipt says
  `heuristic (llm unavailable)` and heuristic order stands. **It never fails the
  search.**
- **Determinism:** temperature 0, JSON schema, closed label set. Hermetic smoke
  uses a stub HTTP server (same pattern as SearXNG today).

---

## 5. How the main model picks (receipt + skill copy)

Receipt sketch (this *is* the size budget):

```
{ ok, query, engine, count, categorizer: "off"|"local"|"remote"|"unavailable",
  urls: [ { i, url, host, title, snippet?, flags: [...], label? } ] }   // sorted, ≤5
```

Skill copy for missions `web-mission-workflow`:

- With `discovery_search` present, **never invent or recall URLs**. Start with
  one search; build the query from the mission **Goal**.
- Fetch the top 1–2 rows that aren't flagged. On `thin` / 404 take the **next
  row**; don't search again unless every row failed.
- `no_engine` → tell the user and ask for URLs. **Don't fall back to memory.**

---

## 6. Engines

**Auto order: `browser39 → searxng`.** The user can pin an engine.

- **browser39 #1 is an operator lock** (we know and trust the author), not a
  measurement. Because the others are fallbacks, `browser39_blocked` (DDG
  captcha, HTTP 202) must **fall through quickly**. Revisited only by the kill
  trigger in §9.
- **browser39: we deliver, we don't wait.** No phase's acceptance criteria
  depend on an upstream change. Make the adapter as good as today's CLI allows,
  and build the evidence pack for Alejandro (fixtures corpus; block rate,
  latency, mapping yield; a ready proposal for structured
  `search --output json` + `--backend`). See [`P_02.md`](./P_02.md).
- **SearXNG:** Python app, one Docker container (~200 MB) on `:8888`.
  **Gotcha:** `settings.yml` needs `search.formats: [html, json]` or the JSON
  API 403s. Document the snippet; **don't vendor it**. No CORS concern — the
  Node host calls it server-to-server, no browser involved.
- **YaCy is dropped.** Java, ~0.5–1 GB RAM, empty index unless crawled or joined
  to the P2P network, low quality for our use. Not worth an adapter.

---

## 7. Non-goals

- No DIY DDG / HTML scrape (**Eris scar**). We read only browser39's structured
  fields and never issue our own DDG request.
- No subagent, background worker, or parallel fan-out.
- No `discovery_preview` / `discovery_scan` in v0.
- The categorizer never fetches, never rewrites queries, never loops.
- No cloud categorizer **by default** (opt-in only, labelled `llm-remote`).
- No sidebar UI.
- No vendored SearXNG/YaCy install scripts beyond a README snippet.
- No new engines beyond `browser39` + `searxng`.

---

## 8. Resolved open table

| # | Question | Decision |
| --- | --- | --- |
| 1 | Auto-drop hard skips? | **No.** Show every row with flags; sort flagged rows last. Exception: an operator `denylist` match is dropped and counted as `dropped: n` |
| 2 | Does scan spend fetch budget? | Moot (scan cut). If it returns: **yes**, it's egress |
| 3 | `maxSearchTurns` | Not a hard counter. The skill says 1 + 1 reformulate; the receipt carries `searchesThisMission` (from `discovery.json`) so the model sees the count |
| 4 | Batch preview? | Moot (preview cut; `mission_fetch` is the preview) |
| 5 | Same loop vs categorizer vs subagent | Same loop + optional in-tool categorizer (§3–4) |
| 6 | Engine order | browser39 first (lock), fast fall-through on blocked (§6) |

---

## 9. Kill criteria (check after ~20 dogfood missions)

Baseline is too noisy to compare against (6/6, 4/8, 2/6 good fetches across a
few runs), so we count three binary checks per mission instead:

| Check | Meaning | Target |
| --- | --- | --- |
| **Used** | Agent called `discovery_search` and fetched from its rows — no invented/recalled URLs | **≥ 90%** |
| **Exists** | The fetched URLs resolve (no 404 / DNS fail) | **≥ 90%** |
| **Useful** | ≥ 1 mission note came from a discovery URL ("exists" alone can be a real but useless page) | **≥ 70%** |

If *used*/*exists* miss, **fix the skill or the engine before adding features.**

Further triggers:

- **Contract readiness (gate for §10 namespace takeover):** used + exists stay
  green across ~20 missions on both engines with no contract change.
- **LLM categorizer:** on for half the runs. Under ~15% gain in "good first
  fetch", or more than 5 s added on average → **remove it**.
- **browser39 #1:** blocked in > ~30% of searches, or median > 20 s → demote it
  behind SearXNG (revisit the lock).
- **Preview/scan revival:** only if logs show the model regularly burns ≥ 3
  fetches to find a keeper.
- **Discovery tokens:** if the receipt pushes compaction earlier in real runs,
  cut `limit` to 3.

---

## 10. Long-term direction

- **Discovery becomes a sub-step of missions.** When active, missions takes its
  URLs from discovery instead of inventing them or reading them from the prompt.
  User URLs stay allowed as seeds. Shape: missions **depends on** the npm
  package; the code stays in its own repo; the port stays clean so merging the
  codebases later costs nothing. → [`P_05.md`](./P_05.md)
- **It replaces DSH's built-in cloud web search.** Once the contract is proven,
  the operator disables the DSH web-search plugin and **takes over the
  web-search tool namespace**. Consequence: **the receipt is a public API from
  now on** — versioned, fixed error codes, and the tool name is a thin alias
  over one core. → [`P_03.md`](./P_03.md), [`P_07.md`](./P_07.md)
- **ISO 27001 / fully hosted later.** Engine choice is plumbing: the user
  selects it in missions and a hosted backend can fill the same slot. The
  promise stays the same: **real URLs that exist.**

---

## 11. Contract v1 (receipt)

```
{ v: 1, ok: true, query, engine, count, dropped, searchesThisMission?,
  categorizer: "heuristic" | "llm-local" | "llm-remote" | "heuristic (llm unavailable)",
  urls: [ { i, url, host, title, snippet?, flags: [...], label } ] }   // sorted, ≤ limit
{ v: 1, ok: false,
  error: "no_engine: …" | "search_failed: …" | "budget_exhausted: …" | "query_required: …" }
```

Ship 1.0.0 today still returns the pre-v1 shape (`{ok, query, engine, count,
urls:[{url,title?,snippet?}], recorded?}`) — v1 lands in P_03 and must stay
additive for missions' `readDiscoverySurface`.
