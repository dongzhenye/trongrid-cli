# Roadmap

## Overview

```
Phase A (Foundation)  →  Phase B (Release)  →  Phase C (Expand)
   5-10 commands           ~47 commands          New channels + features
   Validate arch           First public release  Community growth
```

## Phase A: Foundation

**Goal**: Validate architecture, core data flow, and output formatting.

**Scope**: 5-10 core commands covering the most common workflows.

| Command | Why First |
|---------|-----------|
| `account view` | Most frequent query — validates data flow end to end |
| `account tokens` | TRC20 balance — validates multi-API aggregation |
| `account resources` | Energy/bandwidth — validates resource formatting |
| `tx view` | Transaction lookup — validates hash-based query |
| `block latest` | Chain head — simplest command, validates connectivity |
| `auth login/status` | Auth — validates credential flow |
| `config set/get` | Config — validates persistence |

**Exit criteria**:
- All commands work on mainnet + shasta
- `--json` output is stable and parseable
- Auth flow works (manual key entry)
- CI passes (lint + test + build)

**Not included**: No npm publish. Architecture validation only.

## Phase A+ : Post-Foundation Improvements

**Goal**: Address code review findings and design research before expanding to Phase B.

### Code quality fixes

| Item | Priority | Effort |
|------|----------|--------|
| `account tokens`: add `decimals` + `balance_major` to JSON output (TRC-20 + TRC-10, per scenario S2 of [`design/units.md`](./design/units.md)) | High | Medium — hybrid strategy (static map for top TRC-20s + on-chain `decimals()` fallback; TRC-10 via `/wallet/getassetissuebyid.precision`). Rationale in [`design/competitors.md`](./design/competitors.md#decision-2-token-decimals-strategy). |
| `config set`: validate key against known config fields, reject typos | High | Small |
| API client: wrap network errors (offline/DNS) with friendly message | Medium | Small |
| Eliminate `as unknown as Record<string, unknown>` casts in commands | Medium | Small — make `printResult` generic or data interfaces extend Record |
| Extract `printListResult` for array-returning commands (`account tokens`) | Medium | Small — generalize when Phase B adds more list commands |
| Wire `--no-color` flag through `preAction` (currently a no-op) | Medium | Small — read `opts.color` in the pre-action hook and set `process.env.NO_COLOR = "1"` when false. `styleText` already auto-strips ANSI on non-TTY but does not respect the explicit flag in a real TTY. |
| Add snapshot test for `account tokens` human-output rendering (`<major> (raw <raw>)` vs raw-only fallback) | Low | Small — mock `console.log`, assert captured string. Covers the conditional display branch added for scenario S2 and its fallback when decimals lookup fails. |

### Feature additions

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Default address in config (`trongrid config set default_address <addr>`) | High | Small–Medium | Makes `<address>` positional optional across `account` / `tx` commands. Architectural dependency of the action-first ordering decision in [`architecture.md`](./architecture.md#positional-argument-ordering). Also resolves the MCP optimization sync item below. |

### Design research

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Competitor CLI analysis (cast, solana, wallet-cli, aptos) | High | ✅ Done (2026-04-10) | See [`design/competitors.md`](./design/competitors.md). `sui` dropped in favor of aptos; `wallet-cli` added as TRON ecosystem incumbent. |
| Command argument ordering | Medium | ✅ Decided (2026-04-10) | Action-first (Option B). See [`architecture.md`](./architecture.md#positional-argument-ordering). |
| MCP optimization sync (address defaults, etc.) | Medium | 🟡 Partially resolved | Default address committed under Feature additions above. Any remaining MCP→CLI items TBD after MCP/Skills review. |
| TronScan + TronGrid MCP/Skills review (4 products) | High | Pending | User has provided 2 of 4 links (TronScan MCP + Skills). TronGrid MCP + Skills links still needed. |
| Google CLI design best practices article review | Medium | Pending | User has a specific article to review against our code. |

### Follow-ups after Phase A+ docs reorg

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| Extract commands design decisions + latest commands list into an independent doc | Medium | ✅ Done (2026-04-11) | Merged into `docs/design/commands.md` as Part I (Design) + Part II (Reference). `architecture.md` §Command Structure slimmed to a 20-line summary with a link. |

## Phase B: First Release

**Goal**: Feature-complete release. ~47 commands across 13 resources.

**Work**:
1. Implement remaining commands (all resources from command map)
2. Polish human output formatting (alignment, colors, unit conversion). **Writing guideline**: help text and docs phrase commands possessively ("show the tokens of `<address>`") even though grammar is action-first — see [`architecture.md` §Coupled decisions](./architecture.md#coupled-decisions).
3. Error messages with upstream detail and actionable hints (aptos-style: name the fix, not just the problem)
4. **Smart identifier routing**: `trongrid <addr|hash|number>` without subcommand auto-routes to `account view` / `tx view` / `block view`. Compensates for action-first grammar; gives tronscan-URL shortcut for power users. See [`architecture.md` §Coupled decisions](./architecture.md#coupled-decisions).
5. README with usage examples
6. `npm publish` — package name `trongrid`
7. Announce release

**Exit criteria**:
- All ~47 commands functional
- `npx trongrid` works zero-install
- README covers installation + auth + 5 usage examples
- Users can use it productively

**Launch bar**: This is the minimum viable public release. Not Phase A.

## Phase C: Expand

**Priority order**:

### P0: Auth UX upgrade
- OAuth/device flow for `trongrid auth login`
- Requires TronGrid platform to support the auth flow
- Eliminates "copy key from dashboard" friction

### P1: Distribution channels
- Homebrew formula (covers non-Node.js macOS users)
- Binary download via GitHub Releases (universal fallback)

### P1: Gap commands
- `token price` — when price feed API is available
- `account tags` — when address tagging API exists
- `contract creator` — when creator endpoint is built

### P2: Dynamic token symbol resolution
- Replace the static verified token map (~20 tokens) with runtime fetch from TronScan's verified token list
- Local cache with TTL to avoid repeated API calls
- Handle symbol collisions (multiple tokens with the same symbol — prompt user to disambiguate)

### P2: Advanced features
- Schema introspection (`trongrid schema <command>` — machine-readable command schema, per Google principle #2)
- `--fields` field masks for context window discipline (e.g., `--fields address,balance`)
- Command aliases and shortcuts
- Pipe-friendly defaults (auto-detect non-TTY → JSON)
- Completion scripts (bash/zsh/fish)

### P3: Ecosystem integration
- Agent platform plugins — publish to plugin marketplaces (Claude Code plugins first, others as they mature) that wrap the CLI for one-step install and usage. Analogous to how `gh` CLI is exposed via GitHub plugins, or how tools get surfaced through MCP. Bundles CLI + MCP + Skills as a unified entry point. Caveat: marketplace review is gated and approval is uncertain — worth trying, but not a blocker.
- MCP server mode (if demand emerges — a TronGrid MCP server already exists)

## Version Strategy

Following [SemVer](https://semver.org/). Conservative versioning — stay in `0.x.y` indefinitely.

| Version | Milestone |
|---------|-----------|
| 0.1.x | Phase A — foundation |
| 0.2.x | Phase B — first release |
| 0.3.x | Phase C — expansion |

Minor version (`0.x`) bumps per phase. Patch version (`0.x.y`) bumps for fixes and incremental additions within a phase. No `1.0.0` — there is no reason to promise backward compatibility for a CLI tool that should stay free to evolve.
