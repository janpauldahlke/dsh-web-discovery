# P_00-AMEND — Decisions added after the first P_00 draft

**Status:** authoritative. Where this file and [`P_00.md`](./P_00.md) disagree, **this file wins**.
**Index:** [`PHASES.md`](./PHASES.md) · **Critique:** [`CRITIQUE.md`](./CRITIQUE.md) · **Next:** [`NEXT.md`](./NEXT.md)

---

## A1. Long-term direction

- **Discovery becomes a sub-step of missions.** When it's active, missions takes its URLs from discovery instead of inventing them or reading them from the prompt. User URLs stay allowed as seeds.
- **It replaces DSH's built-in cloud web search.** Once the contract is proven, the operator disables the DSH web-search plugin and **takes over the web-search tool namespace**. So the receipt is a **public API** from now on: versioned, with fixed error codes. The tool name is a thin alias over one core.
- **ISO 27001 / fully hosted later.** Engine choice is plumbing: the user selects it in missions, and a hosted backend can fill the same slot later. The promise stays the same: **real URLs that exist**.

## A2. Categorizer = an always-on layer

One `Categorizer` interface with two implementations:

| Impl | Default | What it does |
| --- | --- | --- |
| `heuristic` | **on** | Our own deterministic logic: URL/host regex, docs/official cues, login cues, dup host, token miss, operator denylist/priors. No I/O. |
| `llm` | opt-in | OpenAI-compatible client, runs on top of `heuristic`; on any failure the heuristic labels stand. |

The closed label set `primary | reference | forum | commercial | junk` is emitted by both, so every row always has a `label`.

## A3. Receipt (contract v1)

```
{ v: 1, ok: true, query, engine, count, dropped, searchesThisMission?,
  categorizer: "heuristic" | "llm-local" | "llm-remote" | "heuristic (llm unavailable)",
  urls: [ { i, url, host, title, snippet?, flags: [...], label } ]   // sorted, ≤ limit
}
{ v: 1, ok: false, error: "no_engine: …" | "search_failed: …" | "budget_exhausted: …" | "query_required: …" }
```

## A4. Engines

- **YaCy is dropped.** Auto order: `browser39 → searxng`. The user can pin an engine (select in missions).
- **Time budget:** 45 s total per `discovery_search` across all engines; browser39 gets ≤ 25 s of it, so the SearXNG fallback still fits.
- **browser39: we deliver, we don't wait.** No phase's acceptance criteria depend on an upstream change. We make our adapter as good as the CLI allows **today**, and we build the evidence to convince Alejandro (see [`P_02.md`](./P_02.md)):
  - a fixtures corpus;
  - measurements: block rate, latency, mapping yield;
  - a ready proposal or PR for structured `search --output json` and backend selection.

## A5. Metric

The per-mission checks are now **used**, **exists** and **useful** (≥ 1 note from a discovery URL; target ≥ 70%). The baseline (6/6, 4/8, 2/6) is too noisy to compare against.
