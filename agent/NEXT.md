# NEXT — concrete next steps (in order)

1. **Save state:** check that `P_00.md` / `PLAN.md` have no unsaved IDE edits. If they do, either save them or ignore them; `P_00-AMEND.md` + `PHASES.md` are authoritative. Commit the `agent/` folder.
2. **Unblock B2** (5 min): run and paste the output into `P_02.md` §audit:
   ```
   browser39 --version; browser39 --help; browser39 search --help; browser39 fetch --help
   browser39 search "node fetch timeout" --output json --no-persist > /tmp/b39.json
   ```
   Is there snippet text in `markdown`?
3. **Unblock B1:** open in the IDE: missions `skills/web-mission-workflow/SKILL.md`, `readDiscoverySurface`, `mission_fetch` + `page_quality`, `HANDOVER.md`.
4. **Unblock B3:** find the DSH web-search tool's name and result shape (source or a tool-list dump).
5. **Start P_01**:
   - profile wire;
   - `:3090` checks;
   - skill text;
   - `limit` → 5;
   - provenance log.
6. After 3 live missions, review C1 (do the models obey the skill?) before moving on to P_02.

**Don't do yet:** P_04 categorizer, P_07 namespace takeover, sending the Alejandro pitch without numbers.
