# Phase B: First Release — Kickoff

Session handoff written at Phase A+ close (2026-04-12). This is a **kickoff / starting point** for Phase B, not a full implementation plan. The Phase B surface (~47 commands across 13 resources) is too large to plan in one sitting; this doc captures the state at Phase A+ close, names the first unblocking actions, and lists the open questions that need user input before command expansion begins.

Next session: read this file first, then the "Reference docs" list at the bottom in order.

---

## State at handoff

| | |
|---|---|
| `main` tip | `c17d608` — Merge pull request #2 from dongzhenye/feat/phase-a-plus |
| Tests | 102/102 passing, 0 failures |
| Lint | Biome clean on touched files (pre-existing drift in a few old test files is known and deferred) |
| Branch | `main`, working tree clean |
| Prod deps | 1 — `commander` |
| Public surface | 7 commands across 5 resources (`block latest`, `account view/tokens/resources`, `tx view`, `auth login/logout/status`, `config set/get/list`) |

## What Phase A+ shipped (one-liners)

- **Default address feature** — `[address]` optional via `config set default_address`. New `src/utils/resolve-address.ts`. Wired into all three `account` read commands.
- **Scalable-token decimals** — `account tokens --json` emits `decimals` + `balance_major` for both TRC-20 (hybrid static map + on-chain `decimals()` fallback) and TRC-10 (asset metadata `precision`). New `src/utils/tokens.ts` with parallel resolvers.
- **Unit-shape contract (new SSOT)** — `docs/design/units.md` codifies deductive P1–P7 principles + S1–S5 scenarios. Supersedes the ad-hoc "class A/B/C/D" framing from earlier MCP work.
- **CLI best-practices alignment** — `docs/design/cli-best-practices.md` audits against the Google CLI design article. All pre-B gaps closed: `AGENTS.md` at repo root, grouped help + examples, entry-point hints, `Hint:` in errors, exit codes 0/1/2/3, semantic color tokens, `--api-key` flag.
- **Docs reorg** — `docs/design/` subdirectory holds normative specs + research. `commands.md` merged design + reference into one live doc.

## First blocking action for Phase B: MCP/Skills review

TronScan and TronGrid have each shipped MCP servers and Skills products (four artifacts total). Deferred from Phase A+ because the goal is to identify API conventions / UX patterns in these competitor products **before** committing to our own for ~40 more commands. Doing this research up front is cheaper than discovering mid-Phase-B that we've re-invented (or diverged from) a convention.

**Inputs available:**

- TronGrid MCP docs: https://developers.tron.network/reference/mcp-api
- TronGrid Skills docs: https://developers.tron.network/reference/skills
- TronScan MCP + Skills: links provided in earlier session history (check scrollback or ask user)
- Local copies of the TronGrid docs exist under the user's separate `~/projects/trongrid/` tree — may be slightly stale but close to latest. Prefer reading from local copies over repeated WebFetch (cheaper, avoids auth friction).

**First-session action plan for the review:**

1. Ask user to confirm local copies are up to date (or to re-fetch from upstream).
2. Read all four products. Extract: API shape, parameter conventions, field-naming style, error handling, auth model, entity coverage.
3. Produce `docs/design/mcp-skills-review.md` with three sections: **Adopt** (patterns we should match), **Avoid** (anti-patterns to sidestep), **Open questions** (requires user decision).
4. Cross-reference against `docs/design/units.md` S2 shape and `docs/design/commands.md` Part I grammar. Flag any divergence as an open question — do not silently align.
5. Land findings as a single doc commit. Any decisions that emerge become committed entries in `architecture.md` + `roadmap.md`.

**Privacy boundary:** the `~/projects/trongrid/` tree is a separate (employer-related) repo. Do not reference it by path or name in any `trongrid-cli` commit, code, or public doc. Read from it locally, cite the public doc URLs in any review artifact.

## Decisions already committed — do NOT re-litigate

The following are load-bearing and frozen unless a specific new force emerges:

- **Command grammar**: action-first positional (`account tokens <address>`, not `account <address> tokens`). Six-reason rationale in `docs/design/commands.md` Part I §2.
- **`--network` (not `--env`)**: flag stays as-is. Rationale in `docs/design/cli-best-practices.md` §3 — all four `--env` benefits listed by the Google article do not currently exist for `trongrid-cli`.
- **JSON unit shape S1** (TRX amounts): `balance` + `balance_unit: "sun"` + `decimals: 6` + `balance_trx`.
- **JSON unit shape S2** (TRC-20 / TRC-10): `balance` + `decimals` + `balance_major`. Head word is `balance` (not `amount`) per TIP-20 / EIP-20 `balanceOf(address) returns (uint256 balance)`.
- **Exit code scheme**: `0` success, `1` general, `2` usage, `3` network / auth.
- **Credential priority**: `--api-key` flag > `TRONGRID_API_KEY` env > config file > unauth 3 QPS free tier.
- **One production dependency** (`commander`). Adding a second requires updating `docs/architecture.md` §Dependencies and should have explicit justification.
- **Semantic color tokens** from `src/output/colors.ts` are the only acceptable color API. New raw `styleText(...)` calls are a review-blocker per `AGENTS.md`.
- **Error path discipline**: command action catch blocks use `reportErrorAndExit(err, { json, verbose, hint })` from `src/output/format.ts`, not inline `printError(...); process.exit(1)`.

## Phase B target surface

Target command map per `docs/design/commands.md` Part II. Shipped commands marked `✅`:

- **`account`** — view ✅, tokens ✅, resources ✅, **txs, transfers, delegations, permissions** (new)
- **`tx`** — view ✅, **decode, internals, transfers, broadcast, pending** (new)
- **`block`** — latest ✅, **view, stats, range, events** (new)
- **`token`** — **view, holders, transfers, balance, allowance** (new)
- **`contract`** — **view, call, estimate, events, history** (new)
- **`sr`** — **list, view** (new)
- **`proposal`** — **list, view** (new)
- **`param`** — **list, view** (new)
- **`energy`** — **price, calc** (new)
- **`bandwidth`** — **price** (new)
- **`network`** — **status, maintenance, burn** (new)

Total new: ~38 commands. Plus eventually write-side: `account transfer`, `tx broadcast`, stake ops — write side brings its own pre-B concerns (`--yes` / `--confirm`, SIGINT, actor tracking), all tracked in `cli-best-practices.md` §Phase B scope.

## Suggested first implementation sessions (post MCP/Skills review)

These are suggestions, not commitments. Adjust based on what the MCP/Skills review surfaces.

**Session 1:** MCP/Skills review + `docs/design/mcp-skills-review.md`. Zero code.

**Session 2:** Phase B first-wave planning. Write `docs/plans/phase-b-wave-1.md` selecting 3–5 commands to ship together. Suggested picks (high user value, reuse existing patterns, no new dependencies):

- `block view <number|hash>` — natural complement to `block latest`, minimal new API surface
- `account txs <address>` — "what did this address do recently" is one of the most common agent queries
- `token view <address|symbol>` — exercises the symbol resolution that the command map hints at but Phase A never shipped

**Session 3 onward:** execute Wave 1 task-by-task via `superpowers:subagent-driven-development` (the same skill used for Phase A+). Each task is its own implementer + spec review + code quality review per the established pattern.

## Open questions requiring user input at Phase B head

These are not blockers for starting the MCP/Skills review (Session 1), but they will become blockers before Session 3:

1. **Token symbol resolution** — `docs/design/commands.md` mentions a curated ~20-token static map for `trongrid token view USDT`. Where does the list come from? TronScan verified token list was the seed for the TRC-20 decimals map — reuse that, or build a different one?
2. **Pre-sort policy for list commands** — `cli-best-practices.md` §2 recommends sorting `account tokens` by `balance_major` desc. Is this the right default? Add `--order raw` opt-out? Applies to `account txs`, `contract events`, `sr list` also.
3. **Write-side Phase B scope** — which write commands land in Phase B first-release vs defer to Phase C? This determines when SIGINT / actor-tracking / confirmation-prompt preconditions become blocking. Options: (A) Phase B is read-only, (B) Phase B ships `account transfer` + `tx broadcast` + Stake 2.0 ops, (C) Phase B ships all writes in the command map.
4. **npm package name** — Phase B exit criterion mentions `npx trongrid` must work. `trongrid` may already be taken on npm — check and reserve early, or pick an alternative. This affects the `name` field in `package.json`.
5. **MCP server for trongrid-cli itself?** — Phase C item, but worth flagging: if trongrid-cli grows to 47 commands, an LLM-friendly MCP server layer over the CLI is one option. The alternative (LLM calls the CLI directly with `--json` and follows `AGENTS.md`) is what the Google article recommends. Decision impacts whether `AGENTS.md` stays the canonical integration surface or we build an MCP façade.

## Deferred / tracked items from Phase A+

See `docs/roadmap.md` for the full list. Summary:

- **Phase A+ ⚠️ partial** items (still open): context-window safety (truncate/mask), reserve-color-for-state beyond current usage, whitespace-over-color systematic application. All become relevant as the command surface grows; revisit in Phase B during each new command's output design.
- **Phase A+ ❌ deferred** items: `skills/` directory (only if `AGENTS.md` proves insufficient), pre-sort by importance (see open question #2), adaptive light/dark palette audit. All Phase B.
- **Phase C**: update notifications from npm, `[APP]_NO_TUI` env var (only if TUIs land).

## Reference docs (read in this order for fast orientation)

1. [`docs/design/cli-best-practices.md`](../design/cli-best-practices.md) — scorecard is the fastest "what's done vs pending" view.
2. [`AGENTS.md`](../../AGENTS.md) — one-page contributor + invocation spec. The Contribution rules section lists the coding constraints that apply to all new Phase B code.
3. [`docs/design/commands.md`](../design/commands.md) — Part I (design decisions) + Part II (full reference). Target surface for Phase B is Part II minus the ✅ items.
4. [`docs/design/units.md`](../design/units.md) — JSON unit shape contract. Any new quantity field must follow this.
5. [`docs/design/competitors.md`](../design/competitors.md) — four-tool CLI research (cast / solana / wallet-cli / aptos). Reference for "what does the ecosystem do here" during any new command decision.
6. [`docs/architecture.md`](../architecture.md) — tech decisions summary.
7. [`docs/roadmap.md`](../roadmap.md) Phase B section — tracked items and exit criteria.
8. [`docs/plans/phase-a-plus.md`](./phase-a-plus.md) — previous phase implementation plan; reference for task structure and TDD pattern.

## Continuity note

Do NOT start writing new Phase B commands until the MCP/Skills review (Session 1) is done. That review may surface conventions worth adopting before we ship more commands. Starting to code around a gap we haven't identified yet is exactly the kind of Phase-B rework the review exists to prevent.

The repo is public-facing open-source. Keep employer / insider context out of commits, code, and public docs. See `meta/PROFILE.md` (user's private) for the user's general contextual preferences and `~/.claude/projects/-Users-dongzhenye-projects-trongrid-cli/memory/` for this project's accumulated session memory.
