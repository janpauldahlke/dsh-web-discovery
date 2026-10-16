# NEXT — concrete next steps (in order)

**State:** docs curated 2026-10-16 (this chain is now: `CONTEXT` → `PHASES` →
`DECISIONS` → phase files; `archive/` = history). Working tree clean, tests
green, blockers unchanged from `CRITIQUE.md`.

1. **Unblock B2** (5 min, operator): run and paste the output into
   `P_02.md` §audit:
   ```
   browser39 --version; browser39 --help; browser39 search --help; browser39 fetch --help
   browser39 search "node fetch timeout" --output json --no-persist > /tmp/b39.json
   ```
   Is there snippet text in `markdown`? (2026-10-13 probe says **no** — confirm.)
2. **Unblock B1:** open in the IDE: missions `skills/web-mission-workflow/SKILL.md`,
   `readDiscoverySurface` (`src/host/store.ts`), `mission_fetch` + `page_quality`.
3. **Unblock B3:** find the DSH built-in web-search tool's name and result shape
   (source or a tool-list dump) → input for the P_03 contract freeze.
4. **Start P_01** (agent-executable, in this order):
   - ~~rename the profile links~~ **NOT NEEDED — see the B4 correction in
     `CONTEXT.md`: the alias resolves correctly (DSH keys bundles by dependency
     name); renaming would need a pnpm reinstall on the only working profile.**
   - ~~`limit` default 10 → 5~~ **DONE 2026-10-16** (`DEFAULT_LIMIT` /
     `MAX_LIMIT` / `clampLimit()` single source of truth; 57 smoke checks green).
   - ~~skill text hardening in missions~~ **DONE 2026-10-16** (step 2 of
     `skills/web-mission-workflow/SKILL.md` in the sibling repo now forbids
     recalled URLs, gives the query recipe from the Goal, caps discovery at
     ≤ 2 calls before the first fetch, and says `mission_fetch` is the preview;
     committed separately in `dsh-web-missions` — needs `npm run build` there so
     the shipped `files[]` copy is raw, so no rebuild is needed — it ships as-is).
   - provenance log + per-mission used/exists/useful summary (needs B1);
   - operator boots `:3090` → run the three live checks in `P_01.md` step 3.
5. After 3 live missions, review CRITIQUE C1 (do the models obey the skill?)
   before moving on to P_02.

**Don't do yet:** P_04 categorizer, P_07 namespace takeover, sending the
Alejandro proposal without numbers, any push/publish.
