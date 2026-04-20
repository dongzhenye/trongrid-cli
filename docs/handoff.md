# Handoff — cold-start agent briefing

**Next-session one-liner**: `读 docs/handoff.md 继续当前 phase`

---

## State

| | |
|---|---|
| `main` tip | Phase G shipped (v0.1.0 + v0.1.1) + CI fixes, 2026-04-20 |
| Active phase | **Phase G — finalizing v0.1.2 + v0.1.3 patches** (then advance to **Phase H — Governance + stats**) |
| Pending cross-cut | v0.1.2 patch (truncation hint + CLAUDE.md) → v0.1.3 patch (npm Trusted Publishing OIDC setup) — see Next-Session Checklist |
| Design docs | `human-display.md` (living, comprehensive) ← `tx-list-display.md` / `transfer-list-display.md` |
| Tests | 464 passing |
| Prod deps | 1 (`commander`) |
| Commands | 31 across 7 resources |
| Published | [`trongrid-cli@0.1.1` on npm](https://www.npmjs.com/package/trongrid-cli) |
| CI | green (lint + build + test + tsc) |

---

## Next-Session Checklist (start here)

Sequence — execute top-down. Roadmap already reflects target Phase H = Governance + stats; v0.1.2 / v0.1.3 are Phase G patches; real cursor pagination is deferred under Phase G follow-up (no dedicated phase).

**Release-prep invariant** (applies to every v0.x.y in this checklist; SSOT is `meta/WORKFLOW.md §3 Release Flow`):
`branch → implement → bump → self-review → fix → cross-model review → fix-if-needed → amend Co-Reviewed-By (on tagged commit) → tag → push → publish → release`.
Review gates tag/publish because `npm publish` is a one-way door (can't unpublish beyond 72h, and retagging a shipped SHA breaks provenance). Bump precedes review so the release candidate — including version string — is actually reviewed. Fix any review finding BEFORE the tag exists — never retag or unpublish to patch a reviewer finding.

0. **Branch** — `git checkout -b feat/v0.1.2` from current `main`. All v0.1.2 work (CLAUDE.md, impl, bump) lives on the branch; main stays at the previous tag until PR merge.
1. **CLAUDE.md thin pointer** (5 lines, points to `AGENTS.md`); add to `package.json` `files` for symmetry with AGENTS.md
2. **v0.1.2 implementation (TDD)** — design discussed in this session, no separate spec needed:
   - Helper: `formatTruncationHint(rawCount, limit, narrowingFlags?): string | null` in `src/output/format.ts`. Fires when `rawCount >= limit`; returns `null` otherwise. `narrowingFlags` appends "or narrow with ..." suffix when provided.
   - `printListResult` options gain `truncation?: { limit, rawCount?, narrowingFlags? }`; helper runs in human mode only.
   - Apply to 9 paginated list commands with per-command narrowingFlags (`--before/--after` on time-filtered commands; omitted on commands without server-side narrowing; client-side filters like `--event`/`--method` do NOT count as narrowing)
   - Client-side filter commands (`contract events`, `contract txs --method`) expose pre-filter `rawCount` from their fetch helpers so truncation is judged on the raw page size, not the post-filter count.
   - `account tokens` conditionally passes truncation only when `allTokens.length > limit` (fetchAccountTokens returns the complete set).
   - `fetchInternalTxs` returns `{ rows, rawCount }` (pre-slice) so internals commands carry truncation signal despite the over-fetch heuristic.
   - JSON mode unaffected (agents compare items.length vs limit themselves)
3. **Bump 0.1.2 commit** — edit `package.json` + `src/version.ts`, commit **without** Co-Reviewed-By, **do not tag yet**.
4. **Self-review pass** (per `meta/AGENTS.md §3` Cross-Agent Review): read the full branch diff as a reviewer, not as implementer. Checklist: decision points, edge cases / boundaries, pattern check (same bug elsewhere?), semantic check (docs/flags actually describe behavior?). Fix findings on branch before firing codex.
5. **Cross-model review** (two layers):
   - **Per-feature** — `codex review --commit <impl-SHA>` on a substantive v0.1.2 implementation commit
   - **Per-release** — `codex review --base v0.1.1` for the full v0.1.1→v0.1.2 diff
   - Any High/Medium finding → fix with new commit(s), then rerun the affected review layer until clean.
6. **Stamp Co-Reviewed-By** — once both layers are clean, amend the final commit of the branch (the commit that will be tagged) to add `Co-Reviewed-By: GPT-5.4 via codex review <noreply@openai.com>`.
7. **Tag + push + PR + merge** — `git tag v0.1.2` on the stamped commit, push branch + tag, open PR, merge to main. Merge strategy: `--no-ff` (solo flow; keeps branch history visible).
8. **Publish + release** — `npm publish` interactively (user handles 2FA web auth), then `gh release create v0.1.2 --generate-notes`. Same flow as v0.1.1 until OIDC lands (see next step).
9. **v0.1.3 — npm Trusted Publishing (OIDC) setup**, infra-only patch (repeats Steps 0–8 with these deltas):
   - Create `.github/workflows/publish.yml` triggering on `v*` tag push, with `permissions: id-token: write`, runs `bun install + bun run build + npm publish --provenance`
   - In npm UI: Package settings → Trusted Publisher → configure GitHub Actions (org `dongzhenye`, repo `trongrid-cli`, workflow filename `publish.yml`)
   - Tag push auto-publishes → Step 8 collapses to just `gh release create`
   - Verify `npm view trongrid-cli@0.1.3` shows `provenance: true` ✓ badge
   - From v0.1.3 onward: ALL publishes via OIDC; Trusted Publishing replaces manual 2FA dance permanently
   - Optional: re-enable npm 2FA "Require for write actions" since OIDC bypasses it
   - Setup time: ~30-60 min one-time
10. **handoff.md update**: mark Phase G fully ✅ (v0.1.0–v0.1.3), advance active phase to H = Governance + stats, refresh test count

User wants user-visible patch (Steps 0–8 for v0.1.2) shipped quickly; execute in tight sequence. Step 9 (Trusted Publishing) is infra and may defer 1–2 days if needed.

---

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
- Human display conventions: thousands separators (US comma), address truncation 6+6, timestamps UTC → [`docs/designs/human-display.md`](./designs/human-display.md)
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
- ANSI-aware column alignment: `visibleLength()` strips escape codes before measuring → `src/output/columns.ts`
- Human display conventions: comprehensive living doc covering null display, number formatting by field type (token exact / USD 2dp floor), extreme values (uint256.max → scientific notation + warning), column alignment by type, sort indicators (↓/↑), client-side sort warning, filtering principles, field projection (inclusive replacement) → [`docs/designs/human-display.md`](./designs/human-display.md)
- Transfer list display design: unify centered/uncentered to from/to + muting; fields table with sortable/filterable matrix; P0–P3 priority → [`docs/designs/transfer-list-display.md`](./designs/transfer-list-display.md)
- Transfer list display P0: unified `renderTransferList(rows, subjectAddress?)` + `TransferRow` retire centered/uncentered split; subject-address muting, header row, thousands separators, token symbol in Amount column; `formatListTimestamp` consolidated into `src/output/format.ts` → [`docs/designs/transfer-list-display.md`](./designs/transfer-list-display.md)

**Phase G implementation (first npm publish, v0.1.0):**
- npm package name `trongrid-cli` (canonical bin `trongrid`); `trongrid` was taken by TRON-US official `trongrid-js` SDK → [`docs/designs/phase-g-first-publish.md`](./designs/phase-g-first-publish.md)
- `applySort` numeric sort: `SortConfig.fieldTypes` map adds `bigint`/`number` variants; lex compare preserved as default for backward compat → `src/utils/sort.ts`
- Extreme value display: `formatExtremeIfNeeded` returns scientific notation for `value_major` integer part > 16 digits; `⚠ ` warning prefix when raw value === uint256.max → `src/output/format.ts`
- README rewritten for v0.1.0 (humans + agents framing) → `README.md`
- Parity matrix shipped with per-resource coverage + endpoint mapping vs TronGrid MCP / TronScan MCP → [`docs/designs/competitor-parity.md`](./designs/competitor-parity.md)
- LICENSE = MIT; author = personal (Zhenye Dong)
- Future Phase O opt-in bin alias TODO recorded (config `bin_alias` for second symlink, default off, suggested `tron`); decided during publish prep — keeps `trongrid` as canonical, alias as opt-in convenience → [`docs/roadmap.md`](./roadmap.md) Phase O
- Patch v0.1.1 (~90 min after v0.1.0): User-Agent header on all API requests for TronGrid telemetry; origin: early-user feedback after v0.1.0 publish → `src/api/client.ts`, `src/version.ts` (new — single source of truth for VERSION, used by both `--version` flag and User-Agent)
- v0.1.2 patch (planned — see Next-Session Checklist): list truncation hint (`Showing first N items, use --limit M for more`) when `items.length >= --limit`. Origin: early-user feedback after v0.1.0. Decomposition decision: hint suffices for now; real cursor pagination becomes deferred (no dedicated phase) until hint proves inadequate.
- v0.1.3 patch (planned — see Next-Session Checklist Step 6): npm Trusted Publishing (OIDC) setup via GitHub Actions. Replaces manual `npm publish` (2FA dance) for all future releases. Auto-generates provenance attestations (npm page shows ✓ verified). Brought forward from Phase L because manual publish friction hurts patch cadence (Phase G already has v0.1.0/0.1.1/0.1.2/0.1.3 in 4 days).
- CI fixes (2026-04-20): biome lint auto-fix + workflow build-before-test order (integration tests in `tests/cli/bare-invoke.test.ts` exec `node dist/index.js`, so `dist/` must exist) → `f7b526e`, `ddb1ea4`. CI green from this point.

**Open items** (not decisions — tracked in [`docs/roadmap.md`](./roadmap.md)):
- TRON-eco vs TronGrid-only positioning (each phase generates evidence)
- Token symbol map refresh cadence
- TRX holders / TRX network-wide transfers (blocked on positioning decision)
- **Real cursor / page-token pagination** — deferred under Phase G follow-up (not a phase yet); promote to phase if/when truncation hint (v0.1.2) proves insufficient
- CI: 10 non-blocking biome warnings; Node.js 20 deprecation in `actions/checkout@v4` (deadline 2026-09)

---

## Cold-start reading order

1. **This doc** — state + decisions + pointers
2. [`docs/roadmap.md`](./roadmap.md) — phase list, what's next, deferred items
3. [`docs/designs/commands.md`](./designs/commands.md) — target command surface (Part II)
4. [`docs/designs/units.md`](./designs/units.md) — JSON unit shape contract
5. [`AGENTS.md`](../AGENTS.md) — contribution constraints
6. [`docs/architecture.md`](./architecture.md) — tech decisions
7. Active-phase spec/plan under `docs/designs/` and `docs/plans/`
