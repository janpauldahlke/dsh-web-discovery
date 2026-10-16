# PLAN — dsh-web-discovery

> **⚠️ SUPERSEDED 2026-10-16 — historical only.** Replaced by [`../PHASES.md`](../PHASES.md) (index) + [`../DECISIONS.md`](../DECISIONS.md) (verdict). The phase table below drifted (P_00 became DECISIONS; P_03/P_05 scopes changed).

**Goal:** missions stops guessing URLs. Discovery is a thin, local-first opener inside the same agent loop: real SERP URLs → compact triaged table → `mission_fetch`.
**Decisions:** [`P_00.md`](./P_00.md) (Fable 5 verdict). Older context: [`P0.5.md`](./P0.5.md) (superseded where P_00 disagrees), [`HANDOVER.md`](./HANDOVER.md).

Rules: never kill `:3080` / `:8080`; dogfood on `:3090`; commit only, no push/publish; `npm test` green at the end of every phase.

---

| Phase | Name | Outcome | Depends |
| --- | --- | --- | --- |
| **P_00** | Decisions | This plan + verdict | — |
| **P_01** | Live wire + no-invented-URLs skill | Discovery on in the `:3090` profile; missions skill forbids recalled URLs; baseline 404 metric | — |
| **P_02** | browser39 first-class | Auto order `browser39 → searxng → yacy`; fast fall-through on blocked; explore CLI capabilities; snippets if available; `limit` default 5 | P_01 |
| **P_03** | Engine registry + triage receipt | Engine = adapter + config field; YaCy adapter (stub-tested); host/flags/sort; denylist/allow-priors; `maxDiscoveryMs`; receipt ≤ 1.5k tokens | P_02 |
| **P_04** | Optional categorizer interface | OpenAI-compatible client (local CPU 1–2B or remote opt-in); labels only; `unavailable` fallback; stub smoke | P_03 |
| **P_05** | Fold into missions | Discovery as a missions dependency (bundled); health/badge; README with SearXNG docker snippet | P_03 (P_04 optional) |
| **P_06** | Dogfood + kill review | ~20 missions; evaluate P_00 §9; decide categorizer keep/kill, browser39 order, preview/scan revival | P_05 |

Each phase gets its own `P_0n.md`, written step by step when we get to it.

## Open for P_01 kickoff

- Metric: the baseline is too noisy (6/6, 4/8, 2/6), so we track "used" and "exists" per mission instead (P_00 §9).
- Read the missions `SKILL.md` + `readDiscoverySurface` (sibling repo, not visible in this IDE workspace; open as tabs).
- Operator → Alejandro: non-DDG backend? Structured `search --output json` with snippets? → input for P_02.
- Find out the DSH built-in web-search tool name and its receipt shape → input for P_03 (contract v1 should be able to stand in for it).
