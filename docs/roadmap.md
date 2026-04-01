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
| `account tokens`: add `token_decimals` + `balance_major` to JSON output | High | Medium — needs static decimals map for top tokens or secondary API call |
| `config set`: validate key against known config fields, reject typos | High | Small |
| API client: wrap network errors (offline/DNS) with friendly message | Medium | Small |
| Eliminate `as unknown as Record<string, unknown>` casts in commands | Medium | Small — make `printResult` generic or data interfaces extend Record |
| Extract `printListResult` for array-returning commands (`account tokens`) | Medium | Small — generalize when Phase B adds more list commands |

### Design research

| Item | Priority | Notes |
|------|----------|-------|
| Competitor CLI analysis (solana-cli, cast/foundry, sui, aptos) | High | Learn proven UX patterns, avoid reinventing |
| TronScan + TronGrid MCP/Skills review (4 products) | High | Critique weaknesses, absorb strengths |
| Google CLI design best practices article review | Medium | User has a specific article to review against our code |
| Command argument ordering: `account tokens <addr>` vs `account <addr> tokens` | Medium | UX decision — research how other CLIs handle this |
| MCP optimization sync (address defaults, etc.) | Medium | Port applicable MCP improvements to CLI |

## Phase B: First Release

**Goal**: Feature-complete release. ~47 commands across 13 resources.

**Work**:
1. Implement remaining commands (all resources from command map)
2. Polish human output formatting (alignment, colors, unit conversion)
3. Error messages with upstream detail and actionable hints
4. README with usage examples
5. `npm publish` — package name `trongrid`
6. Announce release

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
- Claude Code Plugin (bundles CLI + MCP + Skills as unified entry point)
- MCP server mode (if demand emerges — a TronGrid MCP server already exists)

## Version Strategy

Following [SemVer](https://semver.org/). Conservative versioning — stay in `0.x.y` indefinitely.

| Version | Milestone |
|---------|-----------|
| 0.1.x | Phase A — foundation |
| 0.2.x | Phase B — first release |
| 0.3.x | Phase C — expansion |

Minor version (`0.x`) bumps per phase. Patch version (`0.x.y`) bumps for fixes and incremental additions within a phase. No `1.0.0` — there is no reason to promise backward compatibility for a CLI tool that should stay free to evolve.
