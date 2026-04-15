# Status — rolling session handoff

**Living doc.** Last updated: 2026-04-15 (Phase C merged, Phase D brainstorm in flight, phase convention regularized).

**Next-session one-liner**: `读 docs/plans/status.md 继续当前 phase`

That line is self-contained — this doc briefs a cold agent on state, locked-in decisions, the current active phase, and which reference docs to load.

> **Convention update 2026-04-15.** This repo now follows the flat-phase convention in [`meta/WORKFLOW.md §2`](https://github.com/dongzhenye/meta): one-level phase letters (A, B, C, …), no sub-phases or waves, git tags cut only on code-changing phases from Phase I (first npm publish) onward. For the full cross-walk from pre-2026-04-15 labels (`Phase A+` / `Phase B Wave 1` / `Phase C Expand` / etc.) see the top of [`docs/roadmap.md`](../roadmap.md).

---

## State at last update

| | |
|---|---|
| `main` tip | `6a5aaf9` — merge Phase C (ex-Wave-1) |
| Latest tagged release | none — first tag is Phase I (v0.1.0) |
| Active phase | **Phase D** — Account list family + Phase-C trial plumbing (brainstorm → spec → plan → implement) |
| Tests | 169/169 passing (102 baseline + 67 new from Phase C) |
| Working tree | clean |
| Prod deps | 1 — `commander` |
| Shipped public commands | 10 commands / 6 resources |
| Phase D target | 3 new commands + 1 consistency pass + 8 plumbing fixes |
| Phase B target surface | ~48 commands / 13 resources across Phases D–I |

---

## Current phase progress

### Phase D — Account list family + Phase-C trial plumbing ⏳

**Brainstorm in flight** (2026-04-15). Design decisions settled so far:

- **Plan structure**: two-PR split — **D-prep** (cross-cutting plumbing fixes on existing files, must land first) → **D-main** (three new list commands + `account resources` consistency pass).
- **`account approvals` deferred**: TronGrid v1 has no native approvals endpoint; event-log-scan approach is viable but blocked on the open [TRON-eco vs TronGrid-only positioning](memory) question. Tracked as a named deferral, not lost.
- **`account permissions` shape**: structured render (`owner` / `active[]` / `witness?`), not flat list. Skips `applySort` deliberately — multi-sig audit wants the grouped view, not a sortable key table. `--sort-by` / `--reverse` rejected on this command with a hint.
- **Pagination convention**: `--before <ts|date>` / `--after <ts|date>` (timestamp range only). `fingerprint` cursor deliberately not exposed — 95% of users ask time-range questions, cursor is implementation detail. Re-evaluate if a later phase needs true cursor paging.
- **`account resources` optional address**: folded into Phase D-prep (one-line `resolveAddress` swap + regression test). Closes the last account command still requiring a positional address.

**Pending design questions**: [to be written into `docs/plans/phase-d.md` at brainstorm close].

### Phase C — Block view + Account txs + Token view ✅ merged (PR #5, 2026-04-15)

- 3 commands, 23 commits, 67 new tests (102 → 169 passing)
- Plumbing introduced (reused by Phase D): global `--confirmed` / `-r` / `--sort-by`, `applySort`, `block-identifier`, `token-identifier`, `STATIC_SYMBOL_TO_ADDRESS`, `UsageError` (partial adoption)
- Detailed plan + execution log preserved at [`phase-c.md`](./phase-c.md)
- Trial walkthrough surfaced 11 items → distributed across Phases D/E/L (see `roadmap.md`)

### Phase B — Post-Foundation Improvements ✅ merged

- Code-quality fixes + design research + feature additions (default address, MCP/Skills review)
- Detailed plan at [`phase-b.md`](./phase-b.md)

### Phase A — Foundation ✅ merged

- 10 foundation commands across 6 resources
- Detailed plan at [`phase-a.md`](./phase-a.md)

---

## Decision ledger — do NOT re-litigate

Pre-Phase-C decisions (still binding):

- **Command grammar**: action-first positional (`account tokens <address>`, not `account <address> tokens`). Six-reason rationale in `docs/design/commands.md` Part I §2.
- **`--network` (not `--env`)**: flag stays as-is. Rationale in `docs/design/cli-best-practices.md` §3.
- **JSON unit shape S1** (TRX): `balance` + `balance_unit: "sun"` + `decimals: 6` + `balance_trx`.
- **JSON unit shape S2** (TRC-20/10): `balance` + `decimals` + `balance_major`. Head word `balance` per TIP-20/EIP-20.
- **Exit code scheme**: `0` success, `1` general, `2` usage, `3` network / auth.
- **Credential priority**: `--api-key` > `TRONGRID_API_KEY` env > config file > unauth 3 QPS.
- **One production dependency** (`commander`). Adding a second requires updating `docs/architecture.md` §Dependencies.
- **Semantic color tokens** from `src/output/colors.ts` are the only acceptable color API.
- **Error path discipline**: action catch blocks use `reportErrorAndExit(err, { json, verbose, hint })`.

Phase-C prerequisite decisions (from MCP/Skills review):

- **`--confirmed` default off** (Q1). Latest-state reads by default (3s lag, ~0.01% reorg risk); opt-in for high-stakes scenarios.
- **`account approvals <owner>`** (Q2). New account-scoped command. +1 to total target surface. Default sort: allowance amount desc. **Deferred in Phase D** pending positioning decision.
- **Sort UX** (Q3). Per-command default + `--reverse`/`-r` to flip + `--sort-by <field>` to override. `--order asc|desc` explicitly rejected as redundant. Multi-key sort deferred to `--json | jq`.
- **Token identifier auto-detection** (Q4). `token view` accepts `<id|address|symbol>`; dispatches by input shape; `--type trc10|trc20|trc721|trc1155` override.
- **Stake default V2** (Q5). `account resources` defaults to Stake 2.0; `--stake-v1` for legacy.
- **No MCP server façade** (user decision 2026-04-14, pre-Phase-C). CLI + `--json` + `AGENTS.md` is the integration surface. Re-evaluate only if LLM callers surface CLI-unsolvable pain.

Phase-D regularization decisions (2026-04-15):

- **Flat phase letters** per `meta/WORKFLOW.md §2`. Wave / sub-phase hierarchy retired. Historical plan files renamed (`phase-a-plus.md` → `phase-b.md`, `phase-b-wave-1.md` → `phase-c.md`, session-handoff doc → `status.md`).
- **No retro git tags for pre-publish phases.** First tag cut at Phase I (first npm publish) as `v0.1.0` — SemVer-conventional "first release of a new package". Phases A–H track by letter only; Phase J onward cuts sequential `v0.2.0`, `v0.3.0`, … minor bumps.
- **Phase I stays as one combined phase** — parity matrix + README + publish are the heterogeneous but tightly-coupled "ship the release" bundle. No further splitting.

Open items (not decisions, tracked in `docs/roadmap.md`):

- npm package name — `trongrid` taken (TRON-US `trongrid-js` SDK, inactive since 2022-05); `tron-grid` + `trongrid-cli` available. Final choice at Phase I.
- Token symbol static map seed + refresh cadence (TronScan verified-token 加V list, few times/year).
- **TRON-eco vs TronGrid-only positioning**. Open. Blocks `account approvals`, `token price`, potentially more. See `project_tron_eco_positioning` memory.

---

## Reference docs (read in this order on cold start)

1. **This doc** — you're here.
2. `docs/roadmap.md` — flat phase list + cross-walk from old labels.
3. `docs/design/mcp-skills-review.md` — §4 has Q1–Q5 resolutions with rationale.
4. `docs/design/commands.md` — Part II is the full target command surface.
5. `docs/design/units.md` — JSON unit shape contract. Any new quantity field must conform.
6. `AGENTS.md` (repo root) — contribution constraints (all commits must follow).
7. `docs/architecture.md` — tech decisions and the "Defaults & conventions" table.
8. `docs/design/cli-best-practices.md` — scorecard for "what's done vs pending".
9. `docs/plans/phase-d.md` — active-phase implementation plan (post-brainstorm).
10. `docs/plans/phase-c.md` — reference for command-level task structure and TDD pattern.

## Continuity note

Repo is public-facing open-source. Keep employer / insider context out of commits, code, public docs. See memory `feedback_open_source_privacy` and `project_confluence_workspace` for scope. Local copies of TronGrid upstream docs live under `~/projects/trongrid/` — read from, never reference by path.

Branches going forward follow the `feat/phase-X-<theme>` convention (e.g., `feat/phase-d-account-list`), not the retired `feat/phase-b-wave-N` form.
