# Roadmap

> **Convention update 2026-04-15.** This roadmap follows the flat-phase convention in [`meta/WORKFLOW.md §2`](https://github.com/dongzhenye/meta). Phase letters are continuous across project lifetime; waves / sub-phases are explicitly not used. Git tags are only cut on code-changing phases **after** the first npm publish (Phase I) — prior phases are marked ✅ without a tag.
>
> Cross-walk from the pre-2026-04-15 labels:
>
> | Old label | New phase | Theme |
> |---|---|---|
> | Phase A | **Phase A** | Foundation |
> | Phase A+ | **Phase B** | Post-Foundation Improvements |
> | Phase B Wave 1 | **Phase C** | `block view` + `account txs` + `token view` |
> | Phase B Wave 2 | **Phase D** | Account list family + Phase-C trial plumbing |
> | Phase B Wave 3 | **Phase E** | Token family polish |
> | Phase B Wave 4 | **Phase F** | Contract family |
> | Phase B Wave 5 | **Phase G** | Governance + stats |
> | Phase B Wave 6 | **Phase H** | Write-side (scope TBD) |
> | Phase B Wave N | **Phase I** | Parity matrix + README + first npm publish |
> | Phase C (Expand) P0 | **Phase J** | OAuth auth UX |
> | Phase C (Expand) P1 distribution | **Phase K** | Homebrew + GH Releases binaries |
> | Phase C (Expand) P1 gap commands | **Phase L** | `token price` / `account tags` / `contract creator` |
> | Phase C (Expand) P2 dynamic symbols | **Phase M** | Runtime verified-token resolution |
> | Phase C (Expand) P2 advanced | **Phase N** | Schema introspection, aliases, completions |
> | Phase C (Expand) P3 | **Phase O** | Plugin marketplace, MCP server mode (conditional) |

## Overview

```
Phase A–C  (pre-publish, merged)       Architecture validation
Phase D–H  (pre-publish, in flight)    Command surface fill-out
Phase I    (FIRST npm publish, v0.1.0) Distribution begins
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

Not included: no npm publish. Architecture validation only. Plan details: [`plans/phase-a.md`](./plans/phase-a.md).

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

Plan details: [`plans/phase-b.md`](./plans/phase-b.md).

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

Plan details: [`plans/phase-c.md`](./plans/phase-c.md).

## Phase D — Account list family + Phase-C trial plumbing (in flight)

**Goal**: Land the cross-cutting plumbing fixes from Phase C trial walkthrough, then ship three new account list commands on top of the cleaned foundation. `account approvals` deferred pending TRON-eco-vs-TronGrid-only positioning decision.

**Shape**: two logical PRs — Phase D-prep (plumbing only, touches existing files) then Phase D-main (three new commands + `account resources` consistency pass).

**Plumbing pre-pass** (from Phase C trial items #3–#11, Wave-2-tagged):

- [ ] `--fields` thread `key` through `humanPairs` so it applies symmetrically to `--json` and human output (was silent no-op in human mode) — must land first before more commands bake the 2-tuple shape
- [ ] Error / Hint redundancy audit: `hintForX` helpers + `addressErrorHint` rebalanced so `Error:` and `Hint:` lines carry distinct information
- [ ] List headers: fix `Found 1 tokens` / `Found 1 transactions` plural hardcoding; shared helper if a third caller lands
- [ ] `applySort` stable tie-breaker: `tieBreakField` per `SortConfig`
- [ ] `UsageError` sweep: `validateAddress`, `detectBlockIdentifier`, `detectTokenIdentifier`, and any other bad-user-input validator throws `UsageError` (exit code 2, not 1)
- [ ] Sub-command help retains `helpGroup` categories (investigation: check if commander.js supports it on sub-command containers)
- [ ] Bare `trongrid` (no command) renders full help instead of truncated options-only
- [ ] `renderTxs` export + test coverage parity with `renderTokenList`

**Commands**:

- [ ] `account transfers <address>` — TRC-10/20 token transfer history via `/v1/accounts/:address/transferrecords`; timestamp range flags (`--before` / `--after`) as new pagination convention
- [ ] `account delegations <address>` — Stake 2.0 delegations in + out via `/wallet/getdelegatedresourcev2` family
- [ ] `account permissions <address>` — multi-sig owner / active / witness keys via `/wallet/getaccount` (structured render, not `applySort` — permissions are grouped by role, not a flat list)
- [x] ~~`account resources` optional-address consistency pass~~ — already shipped in Phase B; source review during Phase D plan writing confirmed both code (`src/commands/account/resources.ts:41`) and test coverage (`tests/commands/account-resources.test.ts:78`) are already in place. Item closed without code change.

**Deferred**:

- [ ] `account approvals <owner>` — pending TRON-eco-vs-TronGrid-only positioning decision; event-log scan approach documented but not executed
- [ ] composite filter keys (e.g. `energy` / `bandwidth` on `account resources`) work in human mode but silently return `{}` in `--json` mode because the JSON object has no such top-level field. Either (a) split display rows to match JSON fields, (b) document the human-only key surface, or (c) expose derived nested objects on the response shape. Surfaced during Phase D P2 code review.
- [ ] `printListResult` does not apply `--fields` in human mode — only the JSON branch filters. List commands (`account transfers`, `account tokens`, `account txs`, and future list commands) silently ignore `--fields` when rendering human output. Surfaced during Phase D M1.3. Fix requires either a per-row field-projection hook on the renderer callback, or a parallel `HumanPair`-style mechanism for list-item display pairs.
- [ ] `applySort` string-compares primitive values — numeric fields stored as decimal strings (e.g. `amount` in `CenteredTransferRow`) will sort lexicographically and give wrong results for mixed-width values ("100" < "99"). Current consumers get away with it because fixtures use equal-width strings; real TRC-20 transfer amounts will not. Fix: declare field types in `SortConfig` (`"number" | "string" | "bigint"`) and cast per-field inside the comparator. Surfaced during Phase D M1.3.

**Exit criteria**: all plumbing items ✅, three new commands functional on mainnet + shasta, `account resources` accepts optional address, `tsc` build + lint clean, all tests passing.

Spec: [`specs/phase-d.md`](./specs/phase-d.md) (brainstorming output — goal, architecture, file map, exit criteria). Plan: [`plans/phase-d.md`](./plans/phase-d.md) (step-level implementation detail — produced from the spec by `superpowers:writing-plans`; pending at time of Phase D open).

## Phase E — Token family polish

**Goal**: Ship the remaining `token` subcommands and close the token-display trial items from Phase C.

- [ ] `token holders <id|address|symbol>` — top holders + distribution
- [ ] `token transfers <id|address|symbol>` — transfer history of a single token
- [ ] `token balance <token> <address>` — specific-token balance check
- [ ] `token allowance <token> <owner> <spender>` — one-pair approval lookup
- [ ] `account tokens` default display shows resolved symbol as primary identifier (Phase C trial #1); address moves to secondary; on-chain `symbol()` fallback batched with existing `decimals()` call
- [ ] `account tokens` lookup-failure entries keep unit context with a `[?]` / `(decimals unresolved)` marker (trial #6)
- [ ] `account tokens` suppress redundant `(raw N)` when major equals raw (trial #7)

## Phase F — Contract family

- [ ] `contract view <address>` — ABI, bytecode, runtime info
- [ ] `contract call <address> <method> [args]` — read-only call
- [ ] `contract estimate <address> <method> [args]` — energy estimation
- [ ] `contract events <address>` — recent event logs
- [ ] `contract history <address>` — transaction history

## Phase G — Governance + stats

- [ ] `sr list` / `sr view <address>` — Super Representatives
- [ ] `proposal list` / `proposal view <id>` — governance proposals
- [ ] `param list` / `param view <name>` — chain parameters
- [ ] `energy price` / `energy calc <amount>` — energy resource pricing
- [ ] `bandwidth price` — bandwidth pricing
- [ ] `network status` / `network maintenance` / `network burn` — node + chain status

## Phase H — Write-side (scope TBD)

**Open question**: does the first public release include write-side (`tx broadcast`, freeze/unfreeze, delegate, vote, etc.) or stay read-only? Decision blockers: `--yes` / `--confirm` UX, SIGINT handling, actor tracking, and secret-key workflow. Scope locks at Phase G close.

## Phase I — Parity matrix + README + first npm publish (will release as v0.1.0)

**Goal**: Ship the live competitor parity matrix, finalize README, and cut the first tagged release to npm.

- [ ] `docs/design/competitor-parity.md` — live structured command-by-command / endpoint-by-endpoint mapping (`trongrid-cli ↔ TronGrid MCP ↔ TronScan MCP`); source-of-truth for README strengths + gap-tracking
- [ ] README — installation + auth + 5 usage examples + link to `AGENTS.md`
- [ ] `package.json` name + author + keywords finalized (see [npm Name & Org](memory) open item)
- [ ] Dry-run publish + local install test (`npx trongrid@latest`)
- [ ] `npm publish`
- [ ] First `git tag v0.2.0` + GitHub Release
- [ ] Announce

**This is the first tagged release.** Phases A–H ship behavior-complete but untagged because there is no distribution contract to honor pre-publish (empty-diff tags would pollute the eventual registry).

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
- [ ] Command aliases and shortcuts
- [ ] Pipe-friendly defaults (auto-detect non-TTY → JSON)
- [ ] Completion scripts (bash/zsh/fish)

## Phase O — Ecosystem integration

- [ ] Agent platform plugins — publish to plugin marketplaces (Claude Code plugins first, others as they mature); wraps CLI + AGENTS.md as a unified entry point; marketplace review is gated
- [ ] MCP server mode — conditional; only if CLI + AGENTS.md surface leaves LLM callers with CLI-unsolvable pain

## Version Strategy

Following [SemVer](https://semver.org/). Conservative versioning — stay in `0.x.y` indefinitely.

| Version | Milestone |
|---------|-----------|
| (untagged) | Phases A–H — pre-publish, behavior-complete on each phase close |
| 0.1.0 | **Phase I — first npm publish** (parity matrix + README + tag) |
| 0.2.0+ | Phase J onward — each code-changing phase cuts a minor bump |

Pre-publish phases don't consume version space — the first tagged release begins at `0.1.0`, the SemVer convention for a new package. Phases J–O cut sequential minor bumps as code-changing phases close. No `1.0.0` — there is no reason to promise backward compatibility for a CLI that should stay free to evolve.
