# Handoff — cold-start agent briefing

**Next-session one-liner**: `读 docs/plans/handoff.md 继续当前 phase`

---

## State

| | |
|---|---|
| `main` tip | `64bfad3` (Phase D merged, 2026-04-16) |
| Active phase | **Phase E** — Token family polish |
| Tests | 280 passing |
| Prod deps | 1 (`commander`) |
| Commands | 13 across 6 resources |

---

## Decision ledger — do NOT re-litigate

Each entry is a closed decision. Rationale lives at the linked SSOT — don't re-derive here.

**Architecture & conventions:**
- Command grammar: action-first positional → [`docs/designs/commands.md` §2](../design/commands.md)
- `--network` not `--env` → [`docs/designs/cli-best-practices.md` §3](../design/cli-best-practices.md)
- JSON unit shapes S1 / S2 → [`docs/designs/units.md`](../design/units.md)
- Exit codes 0/1/2/3 → [`docs/designs/cli-best-practices.md` §4](../design/cli-best-practices.md)
- Credential priority chain → [`docs/architecture.md`](../architecture.md)
- One prod dep (`commander`) → [`docs/architecture.md` §Dependencies](../architecture.md)
- Semantic color tokens only → `src/output/colors.ts`
- Error path: `reportErrorAndExit(err, { json, verbose, hint })` → `src/output/format.ts`
- Flat phase letters, no waves → [`docs/roadmap.md` convention note](../roadmap.md)
- No retro git tags; first tag at Phase I (v0.1.0) → [`docs/roadmap.md`](../roadmap.md)
- No MCP server facade → memory `project_no_mcp_layer`

**Sort & filter UX (Phase C Q1–Q5):**
- `--confirmed` default off → [`docs/designs/mcp-skills-review.md` §4 Q1](../design/mcp-skills-review.md)
- Sort: per-command default + `--reverse` + `--sort-by`; `--order` rejected → Q3
- Token identifier auto-detection + `--type` override → Q4
- Stake default V2 → Q5

**Phase D implementation:**
- Pagination: `--before`/`--after` global flags (no cursor) → [`docs/specs/phase-d.md`](../specs/phase-d.md)
- Three-layer output: columns.ts → transfers.ts → command → [`docs/specs/phase-d.md`](../specs/phase-d.md)
- `account permissions` structured not list; rejects sort flags → `src/commands/account/permissions.ts`
- `UsageError` on all validators → exit 2 → `src/output/format.ts`
- `helpGroup` on sub-command leaves → `docs/designs/notes/commander-helpgroup-investigation.md`

**Open items** (not decisions — tracked in [`docs/roadmap.md` Phase D Deferred](../roadmap.md)):
- npm package name choice
- TRON-eco vs TronGrid-only positioning
- Token symbol map refresh cadence

---

## Cold-start reading order

1. **This doc** — state + decisions + pointers
2. [`docs/roadmap.md`](../roadmap.md) — phase list, what's next, deferred items
3. [`docs/designs/commands.md`](../design/commands.md) — target command surface (Part II)
4. [`docs/designs/units.md`](../design/units.md) — JSON unit shape contract
5. [`AGENTS.md`](../../AGENTS.md) — contribution constraints
6. [`docs/architecture.md`](../architecture.md) — tech decisions
7. Active-phase spec/plan under `docs/specs/` and `docs/plans/`
