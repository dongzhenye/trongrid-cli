# Handoff — cold-start agent briefing

**Next-session one-liner**: `读 docs/plans/handoff.md 继续当前 phase`

---

## State

| | |
|---|---|
| `main` tip | Phase E merged, 2026-04-16 |
| Active phase | **Phase F** — Contract family |
| Tests | 340 passing |
| Prod deps | 1 (`commander`) |
| Commands | 17 across 6 resources |

---

## Decision ledger — do NOT re-litigate

Each entry is a closed decision. Rationale lives at the linked SSOT — don't re-derive here.

**Architecture & conventions:**
- Command grammar: action-first positional → [`docs/design/commands.md` §2](../design/commands.md)
- `--network` not `--env` → [`docs/design/cli-best-practices.md` §3](../design/cli-best-practices.md)
- JSON unit shapes S1 / S2 → [`docs/design/units.md`](../design/units.md)
- Exit codes 0/1/2/3 → [`docs/design/cli-best-practices.md` §4](../design/cli-best-practices.md)
- Credential priority chain → [`docs/architecture.md`](../architecture.md)
- One prod dep (`commander`) → [`docs/architecture.md` §Dependencies](../architecture.md)
- Semantic color tokens only → `src/output/colors.ts`
- Error path: `reportErrorAndExit(err, { json, verbose, hint })` → `src/output/format.ts`
- Flat phase letters, no waves → [`docs/roadmap.md` convention note](../roadmap.md)
- No retro git tags; first tag at Phase I (v0.1.0) → [`docs/roadmap.md`](../roadmap.md)
- No MCP server facade → memory `project_no_mcp_layer`

**Sort & filter UX (Phase C Q1–Q5):**
- `--confirmed` default off → [`docs/design/mcp-skills-review.md` §4 Q1](../design/mcp-skills-review.md)
- Sort: per-command default + `--reverse` + `--sort-by`; `--order` rejected → Q3
- Token identifier auto-detection + `--type` override → Q4
- Stake default V2 → Q5

**Phase D implementation:**
- Pagination: `--before`/`--after` global flags (no cursor) → [`docs/specs/phase-d.md`](../specs/phase-d.md)
- Three-layer output: columns.ts → transfers.ts → command → [`docs/specs/phase-d.md`](../specs/phase-d.md)
- `account permissions` structured not list; rejects sort flags → `src/commands/account/permissions.ts`
- `UsageError` on all validators → exit 2 → `src/output/format.ts`
- `helpGroup` on sub-command leaves → `docs/design/notes/commander-helpgroup-investigation.md`

**Phase E implementation:**
- Token type support: TRX + TRC-20 per command; TRC-10/721/1155 → typed `TokenIdentifier` variant, per-command `UsageError` with forward-looking hint → [`docs/specs/phase-e.md`](../specs/phase-e.md)
- `TokenIdentifier` discriminator: `type` (renamed from `kind`) → `src/utils/token-identifier.ts`
- Batch token info via `/v1/trc20/info?contract_list=` → `src/api/token-info.ts`
- Hex-to-Base58 + Base58-to-hex conversion → `src/utils/address.ts`
- Uncentered transfer list renderer (from/to as peers) → `src/output/transfers.ts`
- Positioning tension documented → `docs/specs/phase-e.md` §Strategic context
- `account tokens` display: `[TYPE] SYMBOL ID balance` — key before metric, no parentheses on ID column → `src/commands/account/tokens.ts`
- Human display conventions (§7): thousands separators (US comma), address truncation 6+6, timestamps UTC → `docs/designs/cli-best-practices.md`
- Address truncation minimum 6+6 (anti-spoofing) → `src/output/columns.ts` default
- `addThousandsSep` at renderer layer, not in `formatMajor` (JSON unaffected) → `src/output/columns.ts`
- `uint256.max` allowance → "Unlimited" in human mode, `unlimited: true` in JSON → `src/commands/token/allowance.ts`
- Type check before address validation in command actions (better error priority) → allowance.ts, balance.ts
- E2E acceptance mandatory at phase close → `AGENTS.md` contribution rules

**Open items** (not decisions — tracked in [`docs/roadmap.md`](../roadmap.md)):
- npm package name choice
- TRON-eco vs TronGrid-only positioning (each phase generates evidence)
- Token symbol map refresh cadence
- TRX holders / TRX network-wide transfers (blocked on positioning decision)

---

## Cold-start reading order

1. **This doc** — state + decisions + pointers
2. [`docs/roadmap.md`](../roadmap.md) — phase list, what's next, deferred items
3. [`docs/design/commands.md`](../design/commands.md) — target command surface (Part II)
4. [`docs/design/units.md`](../design/units.md) — JSON unit shape contract
5. [`AGENTS.md`](../../AGENTS.md) — contribution constraints
6. [`docs/architecture.md`](../architecture.md) — tech decisions
7. Active-phase spec/plan under `docs/specs/` and `docs/plans/`
