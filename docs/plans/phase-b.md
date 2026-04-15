# Phase B: First Release — Progress & Plan

**Living doc.** Last updated: 2026-04-15.

**Next-session one-liner**: `读 docs/plans/phase-b.md 继续 Phase B`

That line is self-contained — this doc briefs a cold agent on state, locked-in decisions, the next action, and which reference docs to load.

---

## State at last update

| | |
|---|---|
| Branch tip | `feat/phase-b-wave-1` — 12 commits ahead of `main` (Wave 1 unmerged; open PR pending) |
| Tests | 156/156 passing (102 baseline + 54 new from Wave 1) |
| Working tree | clean |
| Prod deps | 1 — `commander` |
| Shipped public commands | 10 commands / 6 resources — adds `block view`, `account txs`, `token view` (+ `token` resource) on top of Phase A+ surface |
| Phase B target surface | ~48 commands / 13 resources (+1 from Q2 resolution) |

---

## Progress

### Session 1 — MCP/Skills review + decisions (2026-04-14) ✅ merged

Shipped in PR #3:

- `docs/design/mcp-skills-review.md` — 8 Adopt / 6 Avoid patterns extracted from TronGrid MCP+Skills and TronScan MCP+Skills; 5 blocking questions resolved.
- 5 decisions propagated into `commands.md` / `units.md` / `architecture.md` / `roadmap.md`.
- Live competitor parity matrix added to roadmap as Phase B item #8 (distinct artifact from the one-time review; build during Phase B).

### Session 2 — Wave 1 implementation (2026-04-15) ✅ shipped on `feat/phase-b-wave-1`

**Plan**: `docs/plans/phase-b-wave-1.md` — 9 atomic tasks (3 per command) + 2 review-feedback fix-ups + 1 indentation-fix. 12 commits total.

**Commands shipped** (branch `feat/phase-b-wave-1`, PR pending):

1. `block view <number|hash>` — auto-detects number vs hash; `--confirmed` swaps to `/walletsolidity/*`.
2. `account txs [address]` — lists `/v1/accounts/:address/transactions`; default sort `timestamp desc`; `[address]` falls back to `default_address`.
3. `token view <id|address|symbol>` — auto-dispatch TRC-10 (numeric) vs TRC-20 (Base58 / verified symbol); `--type` override; four-way parallel `triggerconstantcontract` for TRC-20 metadata.

**Plumbing introduced** (reusable by later waves):

- Global flags `--confirmed`, `-r, --reverse`, `--sort-by <field>` (defined once, adopted per command).
- `src/utils/block-identifier.ts` — number/hash dispatch util.
- `src/utils/sort.ts` — generic `applySort<T>` with per-field inherent direction; `--reverse` flips; `--sort-by` overrides. Used by `account txs`, available for Wave 2 list commands.
- `src/utils/token-identifier.ts` — TRC-10 / TRC-20 / symbol dispatch with phishing guard on unknown symbols.
- `STATIC_SYMBOL_TO_ADDRESS` reverse map (7 verified symbols: USDT, USDC, WTRX, JST, SUN, WIN, BTT).

**Wave 1 scope rejected** (tracked for later waves):

- 0x-prefixed 40-hex token addresses — needs Base58check conversion (no new deps). Rejected with user-facing hint.
- TRC-721 / TRC-1155 — `--type` parsed but rejected as NYI. Wave 3+.
- `--confirmed` on `account txs` and `token view` — TronGrid v1 endpoints have no `/walletsolidity` mirror. Flag accepted silently; documented via inline `// NOTE:` comments. Follow-up once upstream exposes mirrors or we proxy via FullNode.

**Test growth**: 102 → 156 (+54). Lint clean. `tsc` build clean.

### Session 3 — Wave 2 (next) ⏳

**Focus**: account list family — `transfers`, `delegations`, `permissions`, `approvals` (the last per Q2 resolution). Shared list-command pattern now exists (`applySort` + `resolveAddress` + `printListResult` + `renderFn`); Wave 2 is mostly fetch + sort-config declarations.

**Also in Session 3 scope**:

- Decide whether `account resources` moves to `[address]` optional form (currently required) — consistency pass now that `default_address` fallback is cheap.
- First use of `fingerprint` / timestamp-range pagination (`account transfers` supports `min_timestamp` / `max_timestamp`) — establish the `--before` / `--after` flag convention if needed.
- Review Wave 1 `renderTxs` — export + test coverage parity with `renderTokenList`. Code-quality reviewer flagged this as Minor; rolling into Wave 2 while adjacent files are touched.
- **`--fields` in human mode** (Wave 1 trial feedback item #3 in `roadmap.md`): thread a `key` through `humanPairs` so `--fields` applies symmetrically to both output modes. Land before Wave 2 bakes the 2-tuple shape into more commands.

**Execution model**: unchanged — `superpowers:subagent-driven-development` triad per command.

### Wave sequencing (tentative, reassess at each wave close)

- Wave 2: account list family — `transfers`, `delegations`, `permissions`, `approvals`
- Wave 3: token family polish — `holders`, `transfers`, `balance`, `allowance`
- Wave 4: contract — `view`, `call`, `estimate`, `events`, `history`
- Wave 5: governance + stats — `sr`, `proposal`, `param`, `energy`, `bandwidth`, `network`
- Wave 6: write side (if Phase B scope includes it — see open item below)
- Wave N: live competitor parity matrix (roadmap #8) + npm publish prep + README

---

## Decision ledger — do NOT re-litigate

Pre-Session-1 (Phase A+ legacy):

- **Command grammar**: action-first positional (`account tokens <address>`, not `account <address> tokens`). Six-reason rationale in `docs/design/commands.md` Part I §2.
- **`--network` (not `--env`)**: flag stays as-is. Rationale in `docs/design/cli-best-practices.md` §3.
- **JSON unit shape S1** (TRX): `balance` + `balance_unit: "sun"` + `decimals: 6` + `balance_trx`.
- **JSON unit shape S2** (TRC-20/10): `balance` + `decimals` + `balance_major`. Head word `balance` per TIP-20/EIP-20.
- **Exit code scheme**: `0` success, `1` general, `2` usage, `3` network / auth.
- **Credential priority**: `--api-key` > `TRONGRID_API_KEY` env > config file > unauth 3 QPS.
- **One production dependency** (`commander`). Adding a second requires updating `docs/architecture.md` §Dependencies.
- **Semantic color tokens** from `src/output/colors.ts` are the only acceptable color API.
- **Error path discipline**: action catch blocks use `reportErrorAndExit(err, { json, verbose, hint })`.

Session 1 additions (from MCP/Skills review):

- **`--confirmed` default off** (Q1). Latest-state reads by default (3s lag, ~0.01% reorg risk); opt-in for high-stakes scenarios.
- **`account approvals <owner>`** (Q2). New account-scoped command. +1 to Phase B surface. Default sort: allowance amount desc.
- **Sort UX** (Q3). Per-command default + `--reverse`/`-r` to flip + `--sort-by <field>` to override. `--order asc|desc` explicitly rejected as redundant. Multi-key sort deferred to `--json | jq`.
- **Token identifier auto-detection** (Q4). `token view` accepts `<id|address|symbol>`; dispatches by input shape; `--type trc10|trc20|trc721|trc1155` override.
- **Stake default V2** (Q5). `account resources` defaults to Stake 2.0; `--stake-v1` for legacy.
- **No MCP server façade** (user decision 2026-04-14, pre-Session-1). CLI + `--json` + `AGENTS.md` is the integration surface. Re-evaluate only if LLM callers surface CLI-unsolvable pain.

Non-private open items (not decisions, tracked in `docs/roadmap.md`):

- npm package name — `trongrid` taken (TRON-US `trongrid-js` SDK, inactive since 2022-05); `tron-grid` + `trongrid-cli` available. Final choice + identity/org handoff to be discussed at first-publish task.
- Token symbol static map seed + refresh cadence (TronScan verified-token `加V` list, few times/year).

---

## Reference docs (read in this order on cold start)

1. **This doc** — you're here.
2. `docs/design/mcp-skills-review.md` — Session 1 research output, §4 has Q1–Q5 resolutions with rationale.
3. `docs/design/commands.md` — Part II is the ~48-command target surface. Start here to select Wave 1 scope.
4. `docs/design/units.md` — JSON unit shape contract. Any new quantity field must conform.
5. `AGENTS.md` (repo root) — contribution constraints (all Wave 1 commits must follow).
6. `docs/architecture.md` — tech decisions and the new "Defaults & conventions" table.
7. `docs/design/cli-best-practices.md` — scorecard for "what's done vs pending".
8. `docs/roadmap.md` — Phase B item list including live parity matrix (item #8).
9. `docs/plans/phase-a-plus.md` — reference for task structure and TDD pattern used in Session 1's execution rhythm.

## Continuity note

Repo is public-facing open-source. Keep employer / insider context out of commits, code, public docs. See memory `feedback_open_source_privacy` and `project_confluence_workspace` for scope. Local copies of TronGrid upstream docs live under `~/projects/trongrid/` — read from, never reference by path.
