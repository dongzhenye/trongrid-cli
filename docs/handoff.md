# Handoff — cold-start agent briefing

**Next-session one-liner**: `读 docs/handoff.md 继续当前 phase`

---

## State

| | |
|---|---|
| `main` tip | Phase F merged, 2026-04-16 |
| Active phase | **Phase G** — Governance + stats |
| Tests | 435 passing |
| Prod deps | 1 (`commander`) |
| Commands | 31 across 7 resources |

---

## Decision ledger — do NOT re-litigate

Each entry is a closed decision. Rationale lives at the linked SSOT — don't re-derive here.

**Architecture & conventions:**
- Command grammar: action-first positional → [`docs/designs/commands.md` §2](./designs/commands.md)
- `--network` not `--env` → [`docs/research/cli-best-practices.md` §3](./research/cli-best-practices.md)
- JSON unit shapes S1 / S2 → [`docs/designs/units.md`](./designs/units.md)
- Exit codes 0/1/2/3 → [`docs/research/cli-best-practices.md` §4](./research/cli-best-practices.md)
- Credential priority chain → [`docs/architecture.md`](./architecture.md)
- One prod dep (`commander`) → [`docs/architecture.md` §Dependencies](./architecture.md)
- Semantic color tokens only → `src/output/colors.ts`
- Error path: `reportErrorAndExit(err, { json, verbose, hint })` → `src/output/format.ts`
- Flat phase letters, no waves → [`docs/roadmap.md` convention note](./roadmap.md)
- No retro git tags; first tag at Phase I (v0.1.0) → [`docs/roadmap.md`](./roadmap.md)
- No MCP server facade → memory `project_no_mcp_layer`

**Sort & filter UX (Phase C Q1–Q5):**
- `--confirmed` default off → [`docs/research/mcp-skills.md` §4 Q1](./research/mcp-skills.md)
- Sort: per-command default + `--reverse` + `--sort-by`; `--order` rejected → Q3
- Token identifier auto-detection + `--type` override → Q4
- Stake default V2 → Q5

**Phase D implementation:**
- Pagination: `--before`/`--after` global flags (no cursor) → [`docs/designs/phase-d-account-list.md`](./designs/phase-d-account-list.md)
- Three-layer output: columns.ts → transfers.ts → command → [`docs/designs/phase-d-account-list.md`](./designs/phase-d-account-list.md)
- `account permissions` structured not list; rejects sort flags → `src/commands/account/permissions.ts`
- `UsageError` on all validators → exit 2 → `src/output/format.ts`
- `helpGroup` on sub-command leaves → `_(removed — see git history)_`

**Phase E implementation:**
- Token type support: TRX + TRC-20 per command; TRC-10/721/1155 → typed `TokenIdentifier` variant, per-command `UsageError` with forward-looking hint → [`docs/designs/phase-e-token-family.md`](./designs/phase-e-token-family.md)
- `TokenIdentifier` discriminator: `type` (renamed from `kind`) → `src/utils/token-identifier.ts`
- Batch token info via `/v1/trc20/info?contract_list=` → `src/api/token-info.ts`
- Hex-to-Base58 + Base58-to-hex conversion → `src/utils/address.ts`
- Uncentered transfer list renderer (from/to as peers) → `src/output/transfers.ts`
- Positioning tension documented → `docs/designs/phase-e-token-family.md` §Strategic context
- `account tokens` display: `[TYPE] SYMBOL ID balance` — key before metric, no parentheses on ID column → `src/commands/account/tokens.ts`
- Human display conventions (§7): thousands separators (US comma), address truncation 6+6, timestamps UTC → `docs/research/cli-best-practices.md`
- Address truncation minimum 6+6 (anti-spoofing) → `src/output/columns.ts` default
- `addThousandsSep` at renderer layer, not in `formatMajor` (JSON unaffected) → `src/output/columns.ts`
- `uint256.max` allowance → "Unlimited" in human mode, `unlimited: true` in JSON → `src/commands/token/allowance.ts`
- Type check before address validation in command actions (better error priority) → allowance.ts, balance.ts
- E2E acceptance mandatory at phase close → `AGENTS.md` contribution rules

**Phase F implementation:**
- Multi-entry principle: contract commands mirror account commands where intuition demands it; help text notes equivalence → [`docs/designs/phase-f-contract-family.md`](./designs/phase-f-contract-family.md)
- `deployer` naming (not `origin` or `creator`) → `docs/designs/glossary.md`
- `contract call`/`estimate` deferred: requires general ABI encoder, complexity disproportionate to Phase F scope → spec Q1
- `contract permissions` not applicable: CA has no practical multi-sig management → spec
- Keccak-256 self-implemented (80 lines): Node.js `sha3-256` is NIST SHA-3, not keccak → `src/utils/keccak.ts`
- Terminology glossary: API-to-CLI field mapping for cross-command consistency → `docs/designs/glossary.md`
- Internal txs embedded in regular tx response, not separate endpoint → `src/api/internal-txs.ts`
- Transaction list display redesign: from/to columns, subject muting, type/method mapping, conditional status columns → [`docs/designs/tx-list-display.md`](./designs/tx-list-display.md)

**Open items** (not decisions — tracked in [`docs/roadmap.md`](./roadmap.md)):
- npm package name choice
- TRON-eco vs TronGrid-only positioning (each phase generates evidence)
- Token symbol map refresh cadence
- TRX holders / TRX network-wide transfers (blocked on positioning decision)

---

## Cold-start reading order

1. **This doc** — state + decisions + pointers
2. [`docs/roadmap.md`](./roadmap.md) — phase list, what's next, deferred items
3. [`docs/designs/commands.md`](./designs/commands.md) — target command surface (Part II)
4. [`docs/designs/units.md`](./designs/units.md) — JSON unit shape contract
5. [`AGENTS.md`](../AGENTS.md) — contribution constraints
6. [`docs/architecture.md`](./architecture.md) — tech decisions
7. Active-phase spec/plan under `docs/designs/` and `docs/plans/`
