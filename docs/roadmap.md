# Roadmap

> **Convention update 2026-04-15.** This roadmap follows the flat-phase convention in [`meta/WORKFLOW.md §2`](https://github.com/dongzhenye/meta). Phase letters are continuous across project lifetime; waves / sub-phases are explicitly not used. Git tags are only cut on code-changing phases **starting at Phase G (first npm publish)** — prior phases (A–F) are marked ✅ without a tag.
>
> **Reshuffle 2026-04-17.** First npm publish (originally planned as Phase I) brought forward to **Phase G** to ship sooner. Old Phase G (Governance + stats) → new **Phase H**; old Phase H (Write-side) → new **Phase I**. J–O letters unchanged; version numbers shift +2 because two previously-untagged phases now sit after a tagged release. Per project convention, open phases are free to shift letters.
>
> Cross-walk from the pre-2026-04-15 labels:
>
> | Old label | 2026-04-15 phase | 2026-04-17 phase | Theme |
> |---|---|---|---|
> | Phase A | Phase A | **Phase A** | Foundation |
> | Phase A+ | Phase B | **Phase B** | Post-Foundation Improvements |
> | Phase B Wave 1 | Phase C | **Phase C** | `block view` + `account txs` + `token view` |
> | Phase B Wave 2 | Phase D | **Phase D** | Account list family + Phase-C trial plumbing |
> | Phase B Wave 3 | Phase E | **Phase E** | Token family polish |
> | Phase B Wave 4 | Phase F | **Phase F** | Contract family |
> | Phase B Wave 5 | Phase G | **Phase H** | Governance + stats |
> | Phase B Wave 6 | Phase H | **Phase I** | Write-side (scope TBD) |
> | Phase B Wave N | Phase I | **Phase G** | First npm publish |
> | Phase C (Expand) P0 | Phase J | **Phase J** | OAuth auth UX |
> | Phase C (Expand) P1 distribution | Phase K | **Phase K** | Homebrew + GH Releases binaries |
> | Phase C (Expand) P1 gap commands | Phase L | **Phase L** | `token price` / `account tags` / `contract creator` |
> | Phase C (Expand) P2 dynamic symbols | Phase M | **Phase M** | Runtime verified-token resolution |
> | Phase C (Expand) P2 advanced | Phase N | **Phase N** | Schema introspection, aliases, completions |
> | Phase C (Expand) P3 | Phase O | **Phase O** | Plugin marketplace, MCP server mode (conditional) |

## Overview

```
Phase A–F  (pre-publish, merged)       Architecture + early command surface
Phase G    (FIRST npm publish, v0.1.0) Distribution begins (read-side CLI)
Phase H–I  (post-publish, command fill-out)  Governance + stats, then write-side
Phase J–O  (expand)                    Auth UX, distribution, gaps, advanced
```

Phases are one-level; tasks inside each phase are a single-level flat checklist. Position encodes priority — open-phase letters are not stable promises.

## Phase A — Foundation ✅ (pre-publish, untagged)

**Goal**: Validate architecture, core data flow, and output formatting through 5–10 core commands.

**Shipped**: `account view`, `account tokens`, `account resources`, `tx view`, `block latest`, `auth login/logout/status`, `config set/get/list`.

- [x] All commands work on mainnet + shasta
- [x] `--json` output stable and parseable
- [x] Auth flow via manual key entry
- [x] CI green (lint + test + build)

Not included: no npm publish. Architecture validation only. Plan details: [`plans/phase-a-foundation.md`](./plans/phase-a-foundation.md).

## Phase B — Post-Foundation Improvements ✅ (pre-publish, untagged)

**Goal**: Address code-review findings and design research before expanding the command surface.

- [x] `account tokens`: `decimals` + `balance_major` JSON (TRC-20 + TRC-10, scenario S2)
- [x] `config set`: validate key against known config fields, reject typos
- [x] API client: wrap network errors (offline/DNS) with friendly message
- [x] Eliminate `as unknown as Record<string, unknown>` casts in commands
- [x] Extract `printListResult` for array-returning commands
- [x] Wire `--no-color` flag through `preAction`
- [x] Snapshot test for `account tokens` human-output rendering
- [x] `AGENTS.md` at repo root
- [x] Grouped help categories + `(typical first step)` hints + examples per leaf command
- [x] `Hint:` line in `printError` + `reportErrorAndExit` helper
- [x] Deterministic exit codes (0 / 1 / 2 / 3)
- [x] Semantic color tokens (`src/output/colors.ts`)
- [x] `--network` vs `--env` decision (kept `--network`)
- [x] Default address in config (`trongrid config set default_address`)
- [x] Competitor CLI analysis (cast, solana, wallet-cli, aptos)
- [x] Command argument ordering decision (action-first)
- [x] MCP optimization sync (address defaults)
- [x] TronScan + TronGrid MCP/Skills review (4 products → 8 Adopt / 6 Avoid patterns)
- [x] Google CLI design best-practices article review
- [x] Extract commands design into Part I (Design) + Part II (Reference)

Plan details: [`plans/phase-b-post-foundation.md`](./plans/phase-b-post-foundation.md).

## Phase C — Block view + Account txs + Token view ✅ (pre-publish, untagged)

**Goal**: Ship three user-confirmed read commands together with global-flag scaffolding (`--confirmed`, `--reverse`/`-r`, `--sort-by`, `--type`) and one new utility module (`token-identifier`).

- [x] `block view <number|hash>` with auto number/hash dispatch + `--confirmed` swap
- [x] `account txs [address]` with `/v1/accounts/:address/transactions`, default-address fallback
- [x] `token view <id|address|symbol>` with TRC-10 / TRC-20 auto-dispatch
- [x] Global `--confirmed` flag (default off, per Q1)
- [x] Global `--reverse` / `-r` + `--sort-by` flags (per Q3)
- [x] `applySort<T>` client-side sort utility with per-field inherent direction
- [x] `block-identifier` + `token-identifier` dispatch utilities
- [x] `STATIC_SYMBOL_TO_ADDRESS` reverse map (7 verified symbols)
- [x] 67 new tests (102 → 169 passing)

**Trial feedback** (uncovered 2026-04-15 during Phase C walkthrough) is distributed across Phases D/E/L below rather than accumulating as a sediment bucket here.

Plan details: [`plans/phase-c-block-account-token.md`](./plans/phase-c-block-account-token.md).

## Phase D — Account list family + Phase-C trial plumbing ✅ (pre-publish, untagged)

**Goal**: Landed the cross-cutting plumbing fixes from Phase C trial walkthrough, then shipped three new account list commands on top of the cleaned foundation. `account approvals` deferred pending TRON-eco-vs-TronGrid-only positioning decision.

**Shape**: two logical PRs — Phase D-prep (plumbing only, touches existing files) then Phase D-main (three new commands). The `account resources` consistency pass originally planned was found already shipped in Phase B and closed without code change.

**Plumbing pre-pass** (from Phase C trial items #3–#11):

- [x] `--fields` thread `key` through `humanPairs` so it applies symmetrically to `--json` and human output (P1 + P2). **Follow-up:** list-mode `--fields` in human branch still a no-op — tracked below under "Deferred".
- [x] Error / Hint redundancy audit: `hintForX` helpers + `addressErrorHint` rebalanced so `Error:` and `Hint:` lines carry distinct information (P5)
- [x] List headers: fixed `Found 1 tokens` / `Found 1 transactions` plural hardcoding; both `renderTxs` and `renderTokenList` now emit singular/plural correctly (P6b)
- [x] `applySort` stable tie-breaker: `tieBreakField` per `SortConfig` (P3). **Follow-up:** string-compare hazard on numeric-string fields tracked below.
- [x] `UsageError` sweep: `validateAddress`, `detectBlockIdentifier`, `detectTokenIdentifier`, `resolveAddress` all throw `UsageError` → exit code 2 (P4)
- [x] Sub-command help retains `helpGroup` categories — supported as of commander v14.0.3, applied to all leaves (P9; investigation in `docs/designs/notes/commander-helpgroup-investigation.md`)
- [x] Bare `trongrid` (no command) renders full help via registered root action (P8)
- [x] `renderTxs` exported + direct-invocation test coverage parity with `renderTokenList` (P6b + P7 subsumed)
- [x] **Bonus (not originally planned):** three-layer output architecture extracted — `src/output/columns.ts` (Layer-1 primitives) + `src/output/transfers.ts` (Layer-2 `renderCenteredTransferList`) — used by `account transfers` and available for Phase E's uncentered transfer list variant (P6a / P6b)

**Commands**:

- [x] `account transfers <address>` — TRC-10/20 token transfer history via `/v1/accounts/:address/transactions/trc20`; `--before <ts|date>` / `--after <ts|date>` shipped as new global pagination convention (M1.1–M1.3)
- [x] `account delegations <address>` — Stake 2.0 delegations in + out via `/wallet/getdelegatedresourceaccountindexv2` + `/wallet/getdelegatedresourcev2` with parallel per-counterparty resolution; two-section human render with empty-side suppression; flat-array `--json` with `direction` discriminator (M2.1–M2.3)
- [x] `account permissions <address>` — multi-sig owner / active / witness keys via `/wallet/getaccount`; structured JSON shape `{owner, active[], witness?}` not a list; `--sort-by` / `--reverse` rejected with `UsageError`; keys sorted by weight desc in the fetch layer so multi-sig audits read top-weighted first (M3.1–M3.3)
- [x] ~~`account resources` optional-address consistency pass~~ — already shipped in Phase B; source review during Phase D plan writing confirmed both code (`src/commands/account/resources.ts:41`) and test coverage (`tests/commands/account-resources.test.ts:78`) are already in place. Item closed without code change.

**Deferred**:

- [ ] `account approvals <owner>` — pending TRON-eco-vs-TronGrid-only positioning decision; event-log scan approach documented but not executed
- [ ] composite filter keys (e.g. `energy` / `bandwidth` on `account resources`) work in human mode but silently return `{}` in `--json` mode because the JSON object has no such top-level field. Either (a) split display rows to match JSON fields, (b) document the human-only key surface, or (c) expose derived nested objects on the response shape. Surfaced during Phase D P2 code review.
- [ ] `printListResult` does not apply `--fields` in human mode — only the JSON branch filters. List commands (`account transfers`, `account tokens`, `account txs`, and future list commands) silently ignore `--fields` when rendering human output. Surfaced during Phase D M1.3. Fix requires either a per-row field-projection hook on the renderer callback, or a parallel `HumanPair`-style mechanism for list-item display pairs.
- [ ] `applySort` string-compares primitive values — numeric fields stored as decimal strings (e.g. `amount` in `CenteredTransferRow`) will sort lexicographically and give wrong results for mixed-width values ("100" < "99"). Current consumers get away with it because fixtures use equal-width strings; real TRC-20 transfer amounts will not. Fix: declare field types in `SortConfig` (`"number" | "string" | "bigint"`) and cast per-field inside the comparator. Surfaced during Phase D M1.3.
- [ ] Network error auto-retry — `src/api/client.ts` currently fails immediately on network errors (status 0). Add 3 retries with exponential backoff for transient network failures (offline, DNS, refused, timeout). Only for retry-meaningful errors; not for 4xx/5xx HTTP responses. Surfaced during Phase E.
- [ ] Column headers for remaining list commands — `account transfers` (centered), `account delegations` still lack header rows. (`account txs` fixed in Phase F tx list redesign.) Surfaced during Phase E header pass.
- [ ] Thousands separators for remaining human output — `account view` (sunToTrx), `account transfers` (centered, amount), `account delegations` (amount) still show raw numbers. (`account txs` fixed in Phase F.) Utility `addThousandsSep` exists in `src/output/columns.ts`. Surfaced during Phase E.

**Exit criteria met**: all plumbing items ✅, three new commands functional, `tsc` build + lint clean, 280 tests passing (+111 over the 169 baseline). 21 atomic commits on `feat/phase-d-account-list` (10 D-prep + 9 D-main code + 2 docs close + 3 follow-up docs).

Spec: [`designs/phase-d-account-list.md`](./designs/phase-d-account-list.md). Plan: [`plans/phase-d-account-list.md`](./plans/phase-d-account-list.md).

## Phase E — Token family polish ✅ (pre-publish, untagged)

**Goal**: Ship the remaining `token` subcommands and close the token-display trial items from Phase C. Token type support: TRX + TRC-20; TRC-10/721/1155 deferred with forward-looking hints.

- [x] `token holders <id|address|symbol>` — top TRC-20 holders with share % via `/v1/contracts/{addr}/tokens`
- [x] `token transfers <id|address|symbol>` — TRC-20 transfer history via `/v1/contracts/{addr}/events?event_name=Transfer`; hex→Base58 conversion; uncentered renderer
- [x] `token balance <token> [address]` — TRX (S1) + TRC-20 (S2) balance; address optional with default_address
- [x] `token allowance <token> <owner> <spender>` — TRC-20 allowance via `triggerConstantContract`; ABI-encoded address params
- [x] `account tokens` default display shows resolved symbol as primary identifier (Phase C trial #1); batch `/v1/trc20/info` replaces per-token RPC
- [x] `account tokens` lookup-failure entries keep unit context with a `[?]` / `(decimals unresolved)` marker (trial #6)
- [x] `account tokens` suppress redundant `(raw N)` when major equals raw (trial #7)

**Plumbing shipped**: batch TRC-20 token info client (`src/api/token-info.ts`), hex-to-Base58 + Base58-to-hex conversion (`src/utils/address.ts`), `TokenIdentifier.kind` → `type` rename with TRX/TRC-721/TRC-1155 union variants, uncentered transfer list renderer (`src/output/transfers.ts`).

**Deferred to positioning decision**: TRX holders, TRX network-wide transfers — requires indexed data not available on TronGrid. See `docs/designs/phase-e-token-family.md` §Strategic context.

Spec: [`designs/phase-e-token-family.md`](./designs/phase-e-token-family.md). Plan: [`plans/phase-e-token-family.md`](./plans/phase-e-token-family.md).

## Phase F — Contract family ✅ (pre-publish, untagged)

**Goal**: Introduce the `contract` resource namespace with contract-specific commands + mirrors of account commands. Establish multi-entry principle and terminology glossary.

**Shipped**: `contract view`, `contract methods`, `contract events`, `contract txs` (with `--method` filter), `contract internals`, `contract transfers` (mirror), `contract tokens` (mirror), `contract resources` (mirror), `contract delegations` (mirror), `account internals`.

- [x] `contract view <address>` — ABI summary, deployer, status, energy model, bytecode length
- [x] `contract methods <address>` — ABI method listing with selectors, `--type read|write` filter
- [x] `contract events <address>` — event logs with `--event` filter (case-insensitive)
- [x] `contract txs <address>` — transaction history with `--method <name|selector>` filter
- [x] `contract internals <address>` — internal transactions (shared impl with account)
- [x] Mirror commands: `contract transfers`, `tokens`, `resources`, `delegations`
- [x] `account internals <address>` — new account-side command
- [x] Keccak-256 utility for function selector computation (zero dependencies)
- [x] Terminology glossary (`docs/designs/glossary.md`)
- [x] Multi-entry principle documented

**Deferred**:

- [ ] `contract call <address> <method> [args]` — requires general-purpose ABI encoder, deferred to post-positioning-decision phase
- [ ] `contract estimate <address> <method> [args]` — same as call
- [ ] `contract permissions <address>` — CA has no practical multi-sig management scenario
- [x] ~~Extremely large numbers (uint256.max) in human mode~~ — moved to **Phase G** (will ship with first publish to avoid scam-token visual breakage on launch)
- [ ] List display design docs — each list type should have a dedicated design document (like [`tx-list-display.md`](./designs/tx-list-display.md)) covering column layout, conditional columns, muting, sort, and human/JSON shape. Pending:
  - [x] ~~Transfer list display~~ — done; see [`transfer-list-display.md`](./designs/transfer-list-display.md) and [`plans/transfer-list-display-p0.md`](./plans/transfer-list-display-p0.md) (merged 2026-04-17)
  - [ ] Token list display (`account tokens` / `contract tokens`)
  - [ ] Delegation list display (`account delegations` — two-section layout)
  - [ ] Event list display (`contract events`)
  - [ ] Internal tx list display (`contract internals` / `account internals`)
  - [ ] Holders list display (`token holders`)

Spec: [`specs/phase-f.md`](./specs/phase-f.md). Plan: [`plans/phase-f.md`](./plans/phase-f.md).

## Phase G — First npm publish (will release as v0.1.0)

**Goal**: Ship `trongrid@0.1.0` to npm with the read-side CLI surface from Phases A–F (31 commands), plus two pre-publish bug fixes that would otherwise embarrass early users. Brought forward from Phase I per release timing.

- [ ] Fix `applySort` numeric sort — give `SortConfig` a `fieldTypes` map; numeric fields (e.g. `value`) compare as `BigInt`/`Number`, not lexicographic string
- [ ] Handle extreme values in transfer list display — scientific notation for `value_major` > 10^15, `⚠ ` prefix for `== uint256.max` per [`human-display.md` §2.3](./designs/human-display.md)
- [ ] README — installation + auth + 5 usage examples + link to `AGENTS.md`
- [ ] `docs/designs/competitor-parity.md` — live command/endpoint mapping vs TronGrid MCP + TronScan MCP
- [ ] Finalize `package.json` — check `trongrid` npm name availability (fallback `trongrid-cli` → `@dongzhenye/trongrid`); add description, keywords, repo, homepage, license, files
- [ ] Pre-publish dry-run + local install test (`npm pack --dry-run`, `npm install -g ./trongrid-0.1.0.tgz`)
- [ ] `npm publish --access public`
- [ ] Git tag `v0.1.0` + GitHub Release with auto-generated notes

**This is the first tagged release.** Phases A–F ship behavior-complete but untagged because there is no distribution contract to honor pre-publish (empty-diff tags would pollute the eventual registry).

Spec: [`designs/phase-g-first-publish.md`](./designs/phase-g-first-publish.md). Plan: forthcoming.

## Phase H — Governance + stats (will release as v0.2.0)

- [ ] `sr list` / `sr view <address>` — Super Representatives
- [ ] `proposal list` / `proposal view <id>` — governance proposals
- [ ] `param list` / `param view <name>` — chain parameters
- [ ] `energy price` / `energy calc <amount>` — energy resource pricing
- [ ] `bandwidth price` — bandwidth pricing
- [ ] `network status` / `network maintenance` / `network burn` — node + chain status

## Phase I — Write-side (will release as v0.3.0, scope TBD)

**Open question**: scope of write-side support (`tx broadcast`, freeze/unfreeze, delegate, vote, etc.). Decision blockers: `--yes` / `--confirm` UX, SIGINT handling, actor tracking, and secret-key workflow. Scope locks at Phase H close.

## Phase J — Auth UX upgrade

**Goal**: Replace manual key entry with OAuth / device-flow login. Blocked on TronGrid platform support.

- [ ] `trongrid auth login` via device flow
- [ ] Refresh-token rotation
- [ ] `trongrid auth status` shows auth provider + expiry

## Phase K — Distribution channels

- [ ] Homebrew formula (covers non-Node.js macOS users)
- [ ] GitHub Releases binaries (universal fallback)

## Phase L — Gap commands

Commands representing identified user needs that depend on endpoints not yet available upstream. Shipped when the underlying API lands.

- [ ] `token price <address>` — price feed API
- [ ] `account tags <address>` — address labels (exchange, scam)
- [ ] `contract creator <address>` — creator address + creation tx
- [ ] `account tokens` sorted by USD value desc (Phase C trial #2, blocked on price feed)

## Phase M — Dynamic token symbol resolution

- [ ] Replace static verified-token map with runtime fetch from TronScan verified token list
- [ ] Local cache with TTL
- [ ] Symbol collision handling (disambiguation prompt)

## Phase N — Advanced UX

- [ ] `trongrid schema <command>` — machine-readable command schema (per Google CLI principle #2)
- [ ] `--fields` field-mask examples in `AGENTS.md`
- [ ] Command aliases and shortcuts — including opt-in second-bin registration via `config set bin_alias <name>` (default off; suggested default value `tron`). Canonical `trongrid` always available; alias registers a separate symlink so users get a shorter daily-use name without losing the stable name. Decided 2026-04-17 during Phase G publish prep — package name `trongrid-cli`, canonical bin `trongrid`, alias as opt-in convenience.
- [ ] Pipe-friendly defaults (auto-detect non-TTY → JSON)
- [ ] Completion scripts (bash/zsh/fish)

## Phase O — Ecosystem integration

- [ ] Agent platform plugins — publish to plugin marketplaces (Claude Code plugins first, others as they mature); wraps CLI + AGENTS.md as a unified entry point; marketplace review is gated
- [ ] MCP server mode — conditional; only if CLI + AGENTS.md surface leaves LLM callers with CLI-unsolvable pain

## Version Strategy

Following [SemVer](https://semver.org/). Conservative versioning — stay in `0.x.y` indefinitely.

| Version | Phase | Milestone |
|---------|-------|-----------|
| (untagged) | A–F | pre-publish, behavior-complete on each phase close |
| 0.1.0 | G | **first npm publish** (read-side CLI + README + parity matrix + bug fixes) |
| 0.2.0 | H | Governance + stats |
| 0.3.0 | I | Write-side (scope TBD) |
| 0.4.0+ | J onward | each code-changing phase cuts a minor bump |

Pre-publish phases don't consume version space — the first tagged release begins at `0.1.0`, the SemVer convention for a new package. Phases H–O cut sequential minor bumps as code-changing phases close. No `1.0.0` — there is no reason to promise backward compatibility for a CLI that should stay free to evolve.
