# PHASES — dsh-web-discovery (authoritative index; replaces the table in PLAN.md)

**Goal:** missions stops guessing URLs. Discovery is a thin, local-first opener in the same agent loop: real URLs → compact, labelled table → `mission_fetch`. Later it becomes missions' sub-step and replaces DSH web search.

**Decisions:** [`P_00.md`](./P_00.md) + [`P_00-AMEND.md`](./P_00-AMEND.md) · **Critique:** [`CRITIQUE.md`](./CRITIQUE.md) · **Next:** [`NEXT.md`](./NEXT.md)

Rules: never kill `:3080` / `:8080`; dogfood on `:3090`; agents commit only, no push/publish; `npm test` green at the end of every phase.

| Phase | Name | Outcome | Depends |
| --- | --- | --- | --- |
| [P_01](./P_01.md) | Live wire + strict skill + logging | Discovery on in `:3090`; skill forbids recalled URLs; used/exists/useful logged | — |
| [P_02](./P_02.md) | browser39 first-class + upstream case | Order `browser39 → searxng`; time budget; best mapping from today's CLI; evidence pack for Alejandro | P_01 |
| [P_03](./P_03.md) | Contract v1 + heuristic categorizer | Versioned receipt; `Categorizer` interface; heuristic labels/flags/sort; denylist/priors | P_02 |
| [P_04](./P_04.md) | LLM categorizer (opt-in) | OpenAI-compatible client; local CPU 1–2B or remote (labelled); falls back to heuristic | P_03 |
| [P_05](./P_05.md) | Sub-step of missions | Bundled dependency; engine select; missions sources URLs from discovery | P_03 |
| [P_06](./P_06.md) | Dogfood + kill review | ~20 missions; keep/kill decisions | P_05 |
| [P_07](./P_07.md) | Replace DSH web search | Disable the DSH plugin; take over the web-search namespace | P_06 gate |

**Order note:** P_04 is off the critical path. P_05 can start right after P_03.
