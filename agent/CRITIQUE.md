# CRITIQUE — negative dialectic on the plan

The plan argued against itself. Each item has the weakness, why it hurts, and the mitigation (or "accepted").

## Where the plan is weak

**C1. "Never invent URLs" is only a request in the skill text.**
A 27B model under context pressure will still recall URLs; skills are soft. The core promise depends on obedience.
→ P_01 logs provenance. If "used" stays under 90%, add a **missions-side soft gate**: `mission_fetch` on an `other`-provenance URL returns a warning receipt (`url_not_from_discovery`) instead of fetching silently. That's a hard fence later, not now.

**C2. browser39 at #1 rests on trust, not data.**
It goes through DuckDuckGo underneath, has no snippets, and gets bot-challenged. The slowest, most blockable engine is the default.
→ Accepted as the operator's lock, with a measured kill trigger (P_02 measurement, P_06 decision).

**C3. Tension with the Eris rule.**
"No DIY DDG scrape", yet we parse DDG SERP links through browser39. The line is thin: we read the CLI's structured output and never make our own HTTP request to DDG.
→ Keep that line explicit in code comments; the P_02 snippet mapping must not cross it.

**C4. Heuristics on titles only are weak.**
Without snippets, `token_miss` and the docs cues fire on very little text. Labels may look confident while being noise.
→ Golden fixtures (P_03); the receipt should say whether a snippet was present.

**C5. "Exists" ≠ useful.**
A real 200 page can still be off-topic. The first draft measured only existence.
→ Added the "useful" check (≥ 1 note from a discovery URL).

**C6. 20 missions, 1 operator.**
The sample is too small and biased (the operator's own topics), and the thresholds (90/70/15%) are guesses.
→ Accepted. The numbers are triggers for a conversation, not statistics.

**C7. Local-first / ISO 27001 is partly a story.**
Search queries leave the box through DDG or SearXNG upstream engines. Only the categorizer and the fetch gate are really local. An ISO audit would flag query egress.
→ The README must be honest. The ISO path needs a hosted backend with a contract (later engine), not "local".

**C8. Freezing contract v1 before knowing DSH's web-search shape.**
If DSH returns page content and not just URLs, v1 can't stand in for it without a v2.
→ Blocker B3; collect that shape before P_03 freezes.

**C9. CPU categorizer under load.**
llama.cpp with the 27B model may already use CPU threads (KV / offload); a 1–2B model on CPU could take 10 s+ instead of ~3 s.
→ Measure in P_04 before promising ≤ 5 s.

**C10. Nobody owns query quality.**
Bad Goal → bad query → bad SERP. The plan only reacts afterwards (reformulate).
→ The skill gets a query recipe (key terms + language + "docs"/"official" hint). Revisit at P_06.

**C11. No caching.**
Repeat missions re-query DDG, which raises the block risk.
→ Small per-query cache (TTL ~1 day) in P_02 or P_03 if the block rate is high. Not planned yet.

**C12. Engine timeouts overlap.**
browser39's 30 s default plus SearXNG could exceed 45 s.
→ Fixed in the amendments: browser39 ≤ 25 s inside the 45 s total.

**C13. Hermetic green ≠ live green.**
DDG markup or CLI changes break things silently while fixtures stay happy.
→ The manual measurement script doubles as a live canary; run it before each dogfood batch.

**C14. Depending on a single upstream author.**
The proposal might never be merged.
→ Accepted. No acceptance criterion depends on it (A4).

## Blockers (cannot proceed without)

| # | Blocker | Blocks | Who |
| --- | --- | --- | --- |
| B1 | Missions repo not visible to this IDE agent (skill, `readDiscoverySurface`, `mission_fetch` provenance) | P_01 step 4–6, P_05 | Operator: open as tabs / add module |
| B2 | browser39 CLI capabilities unverified (terminal unavailable in this plugin session) | P_02 step 1 | Operator runs `--help` and pastes the output |
| B3 | DSH built-in web-search tool name + result shape unknown | P_03 freeze, P_07 | Operator / DSH source |
| B4 | Profile still has the stale `dsh-local-*` link; `:3090` often down | P_01 | Operator |
| B5 | No SearXNG installed → fallback untestable live | P_02 live fall-through | Operator (docker, optional) |
