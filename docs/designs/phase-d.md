<!-- lifecycle: frozen -->
# Phase D — Account list family + Phase-C trial plumbing

> **For agentic workers:** this document is the Phase D **spec** (brainstorming output, human-facing) — it defines goal, architecture, file map, task outline, and exit criteria, and it stays stable as the "what and why". Its sibling **plan** (step-level implementation detail, agent-facing) lives at [`../plans/phase-d.md`](../plans/phase-d.md) and is produced from this spec by the `superpowers:writing-plans` skill; the plan iterates as the "how". Execution runs on the plan via `superpowers:subagent-driven-development` one task at a time — same rhythm as the historical [`../plans/phase-c.md`](../plans/phase-c.md) (which predates the spec/plan split and is plan-level only).
>
> **Phase D is split across two PRs** on branch `feat/phase-d-account-list`:
>
> - **D-prep** — cross-cutting plumbing fixes from the Phase C trial walkthrough. No new commands. Lands first, merges, then —
> - **D-main** — three new account list commands + `account resources` consistency pass + phase-close doc updates. Builds on the cleaned foundation.

**Goal.** Land the 9 plumbing items from the Phase C trial feedback walkthrough (so the `humanPairs` 3-tuple shape, `applySort` tie-breaker, `UsageError` discipline, and column-alignment helper are all in place), then ship three new account list commands (`account transfers`, `account delegations`, `account permissions`) on top of the cleaned foundation.

> **Scope correction 2026-04-15 (post-brainstorm, pre-plan).** The original Session 3 plan listed an `account resources` optional-address consistency pass as the fourth D-main deliverable. Source review during plan writing confirmed both the code (`src/commands/account/resources.ts:41` uses `[address]` + `resolveAddress`) and the test (`tests/commands/account-resources.test.ts:78` exercises default-address fallback) already ship the intended state — it was shipped during Phase B (ex-Phase-A+) and the Session 3 note was stale. The consistency pass is dropped from Phase D scope as already-done. All downstream references in this spec were removed in the same commit that surfaced the finding.

**Architecture.** Two PRs on the same branch, sequenced so D-prep lands first (because item P1 widens `humanPairs` from 2-tuple to 3-tuple, and baking the 2-tuple into three new commands would be a waste). Each command in D-main follows the same pattern: one new file under `src/commands/account/`, one endpoint per command (or parallel fan-out for delegations), client-side sort via the existing `applySort` utility (except `permissions` which uses a structured renderer), and a custom human-mode renderer that composes the new `src/output/columns.ts` atomic primitives.

**Tech Stack.** TypeScript strict mode, commander.js, Bun test. Native `fetch` via existing `src/api/client.ts`. Zero new production dependencies (one dev-only addition if any — flagged per item).

**Spec references (authoritative):**

- [`docs/designs/commands.md`](./commands.md) Part II — `account` section; `--before` / `--after` global flags (new in this plan)
- [`docs/designs/units.md`](./units.md) — S1 (TRX) + S2 (TRC-10/20) + the "intentional deviation" note for `account permissions`
- [`docs/research/mcp-skills.md`](../research/mcp-skills.md) §4 — Q2 (approvals as a command, deferred), Q5 (Stake 2.0 default) resolutions
- [`docs/plans/phase-c.md`](../plans/phase-c.md) — task-level structure and commit rhythm template; read this to understand the "scaffold → endpoint → register" 3-commit-per-command pattern and the `superpowers:subagent-driven-development` triad
- [`docs/architecture.md`](../architecture.md) — "Defaults & conventions" decision table
- [`docs/roadmap.md`](../roadmap.md) — Phase D checklist + cross-walk from old labels
- [`AGENTS.md`](../../AGENTS.md) — contribution rules (one prod dep, semantic colors, `reportErrorAndExit`, `--json` on every data command)
- [`docs/plans/status.md`](../plans/status.md) — rolling session state; update at each PR close
- Memory `feedback_human_render_alignment` — column alignment rules (number right-align, unit left-align adjacent, 2-space inter-column gap, both-ends truncated address)
- Memory `feedback_transfer_list_two_styles` — centered vs uncentered transfer lists; why `account transfers` has `direction` and future `token transfers` won't
- Memory `feedback_commit_rhythm` — atomic 3-commits-per-command rhythm + docs-only commits for investigations
- Memory `project_tron_eco_positioning` — why `account approvals` is deferred from Phase D

**Out of scope for Phase D (tracked for later phases):**

- `account approvals <owner>` — deferred pending the TRON-eco-vs-TronGrid-only positioning decision. Tracked as a named deferral in `status.md` decision ledger + memory `project_tron_eco_positioning`; Phase E or later revisits.
- `--cursor` / `fingerprint` pagination — `--before` / `--after` timestamp range covers the 95% need; cursor path re-evaluates if a later phase hits a paging wall.
- Any new top-level resource or global flag besides `--before` / `--after`.
- Write-side anything (freeze, unfreeze, delegate, vote, approve, broadcast) — Phase H.
- Phase C trial items tagged for Phase E:
  - #1 `account tokens` default display shows resolved symbol as primary identifier
  - #6 `account tokens` lookup-failure unit-context marker
  - #7 `account tokens` suppress redundant `(raw N)` when major equals raw
- Phase C trial items blocked upstream (price feed, tagging) — Phase L.
- `src/output/columns.ts` atomic primitives **are** in Phase D scope; a `src/output/lists/` subfolder split is **not** (current flat `src/output/` layout stays until a second list-essence file demands the split — likely Phase E).

---

## D-prep PR — Plumbing fixes

Nine items, all touching existing files. Zero new commands. Ordered so the dependency (P1 must precede P2) is honored, then atomic independent items follow.

### File map (D-prep)

| File | Change | Item |
|------|--------|------|
| `src/output/format.ts` | `HumanPairs` type widens `[string, string][]` → `[key: string, label: string, value: string][]`; `printHuman` filters by `key` when `--fields` is set | P1 |
| `tests/output/fields-human.test.ts` | **new** — covers full fields / subset / empty subset / unknown key / JSON mode unaffected / case sensitivity / trailing spaces in fields flag / multi-command snapshot | P1 |
| `src/commands/account/view.ts`, `account/tokens.ts`, `account/resources.ts`, `block/latest.ts`, `block/view.ts`, `tx/view.ts`, `token/view.ts`, `auth/status.ts`, `config/list.ts` | Migrate `humanPairs` call sites from 2-tuple to 3-tuple literal | P2 |
| `tests/commands/*.test.ts` (9 files) | Snapshot updates from the 3-tuple shape migration (mechanical) | P2 |
| `src/utils/sort.ts` | `SortConfig<T>` gains optional `tieBreakField: keyof T & string`; `applySort` applies secondary comparator when primary is 0 | P3 |
| `tests/utils/sort.test.ts` | +3 cases: tie-break applied, tieBreakField absent falls back to input order, tieBreakField equal to primary field is ignored | P3 |
| `src/commands/account/txs.ts` | Declare `tieBreakField: "timestamp"` in `TXS_SORT_CONFIG` | P3 |
| `tests/commands/account-txs.test.ts` | Verify tie-break ordering (two txs with equal `fee`, expect `timestamp desc` as tiebreaker) | P3 |
| `src/utils/address.ts` (`validateAddress`), `src/utils/block-identifier.ts` (`detectBlockIdentifier`), `src/utils/token-identifier.ts` (`detectTokenIdentifier`), `src/utils/resolve-address.ts` (`resolveAddress`) | Swap `throw new Error(...)` for `throw new UsageError(...)` | P4 |
| `tests/utils/address.test.ts`, `block-identifier.test.ts`, `token-identifier.test.ts`, `resolve-address.test.ts` | Assertions updated to `instanceof UsageError`; +1 "exit code 2" spy test per validator | P4 |
| `src/utils/resolve-address.ts` (`addressErrorHint`), `src/utils/block-identifier.ts` (if it has a hint helper), `src/utils/token-identifier.ts` (phishing-symbol hint), `src/commands/account/view.ts` / `tokens.ts` / `txs.ts` / `block/view.ts` / `token/view.ts` | Rewrite hint messages so they carry information distinct from the error (follow the `tx view <missing-hash>` good pattern) | P5 |
| Existing error-path tests | Update expected hint strings + add "hint ≠ error" literal inequality assertion | P5 |
| **`src/output/columns.ts`** | **new** — atomic alignment primitives: `alignNumber(value, width)`, `alignText(value, width, side)`, `truncateAddress(addr, head, tail)`, `renderColumns(rows, widths, separator)`, `computeColumnWidths(rows)` | P6a |
| `tests/output/columns.test.ts` | **new** — per-primitive unit tests + integration test rendering a synthetic 3-row table | P6a |
| **`src/output/transfers.ts`** | **new** — Layer-2 list-essence renderer: `renderCenteredTransferList(rows, opts)` consuming Layer-1 primitives. Deliberately named `transfers.ts` (not `centered-transfers.ts`) so Phase E can add `renderUncenteredTransferList` in the same file without moving anything. File header contains the forward-pointing note referencing `feedback_transfer_list_two_styles`. | P6b |
| `src/commands/account/txs.ts` | `renderTxs` migrated to use `columns.ts` primitives directly (not via `transfers.ts` — `account txs` is a tx list, not a transfer list, different essence); plural fix `Found 1 transaction` / `Found N transactions` (closes Phase C trial #5) | P6b |
| `src/commands/account/tokens.ts` | `renderTokenList` migrated to use `columns.ts` primitives; plural fix `Found 1 token` / `Found N tokens` | P6b |
| `tests/output/transfers.test.ts` | **new** — centered transfer list snapshot (synthetic rows + expected aligned output) | P6b |
| `tests/commands/account-txs.test.ts`, `tests/commands/account-tokens.test.ts` | Snapshot updates from column migration (mechanical) + n=0/n=1/n=2 plural coverage | P6b |
| `src/commands/account/txs.ts` | `export` keyword added to `renderTxs` (was file-private) | P7 |
| `tests/commands/account-txs.test.ts` | **new** section — render snapshot test invoking the exported `renderTxs` directly (parity with `renderTokenList` which already had this) | P7 |
| `src/index.ts` | Root command default action renders full help when no subcommand is given | P8 |
| `tests/cli/bare-invoke.test.ts` | **new** — verifies `trongrid` (no args) output equals `trongrid --help` output modulo trailing whitespace | P8 |
| **`docs/designs/notes/commander-helpgroup-investigation.md`** | **new** — investigation record of whether commander.js `.helpGroup()` applies to sub-command containers. Lands as a `docs:` commit regardless of outcome (per memory `feedback_commit_rhythm`). If supported, an additional code commit follows applying `.helpGroup()` to each parent (`account`, `block`, `token`, `tx`, `auth`, `config`). | P9 |

### Task outline (D-prep, 10 commits)

Each task below becomes one commit unless noted. Commit subjects follow Conventional Commits; no `wip:` / `chore: progress` entries allowed.

- **P1** — `refactor: widen humanPairs to 3-tuple (key, label, value)`
  Touches only `src/output/format.ts` + `tests/output/fields-human.test.ts`. No command files migrated yet. Type change is the blocker for everything else; isolating it in its own commit makes the follow-up command migrations strictly mechanical.

- **P2** — `refactor: migrate commands to 3-tuple humanPairs and update snapshots`
  Mechanical sweep over 9 command files + their snapshot tests. Kept separate from P1 because the diff volume is large (~hundreds of lines of snapshot updates) and mixing type-change rationale with mechanical migration makes review harder.

- **P3** — `feat: add stable tie-breaker to applySort`
  `sort.ts` type widens, `applySort` gains secondary comparator. Phase C `account txs` opts in immediately (`TXS_SORT_CONFIG.tieBreakField = "timestamp"`); D-main commands adopt as they land. This commit is also the first D-main dependency — without it, `account transfers` ties on `fee` or `amount` fields would look arbitrary.

- **P4** — `refactor: throw UsageError from validators for exit code 2`
  Mechanical sweep over four validator files. `exitCodeFor` in `format.ts` already maps `UsageError → 2`, so no behavior change in the happy path — this is purely wiring remaining validators into the existing exit-code contract.

- **P5** — `refactor: rebalance error vs hint across validators`
  Editorial. Each hint message is rewritten so `Error:` states the symptom tersely and `Hint:` adds a *distinct* actionable insight — not a rephrase. Tests gain a literal-inequality assertion (`expect(hint).not.toBe(error)`) per validator to lock the rule in.

- **P6a** — `feat: extract columns.ts with atomic alignment primitives`
  Pure Layer-1 extraction. `src/output/columns.ts` + `tests/output/columns.test.ts`. No command files touched yet; this commit can be reviewed as a standalone utility addition.

- **P6b** — `refactor: extract renderCenteredTransferList and migrate existing renderers`
  Layer-2 `src/output/transfers.ts` added with only `renderCenteredTransferList`. `renderTxs` and `renderTokenList` migrated to use Layer-1 primitives directly (they're not transfer lists so they do **not** go through the Layer-2 helper). Plural fix (Phase C trial #5) folds in here since both files are touched. The forward-pointing note about Phase E `renderUncenteredTransferList` lives in the `transfers.ts` file header.

- **P7** — `refactor: export renderTxs and add render snapshot test`
  Visibility change + test parity with `renderTokenList`. No behavior change. Closes the Phase C code-review minor finding.

- **P8** — `feat: render full help when invoked without a subcommand`
  `src/index.ts` root action + `tests/cli/bare-invoke.test.ts`. Closes Phase C trial #9 (bare `trongrid` truncated help).

- **P9** — `docs: investigation — commander.js helpGroup on sub-command containers`
  Investigation record. Lands as a `docs:` commit regardless of outcome (per `feedback_commit_rhythm`). If the investigation finds support, a second commit follows:
  - **P9-impl** (contingent) — `feat: propagate helpGroup to account/block/token/tx/auth/config parents`

  If unsupported, P9 is the only commit and `docs/designs/notes/commander-helpgroup-investigation.md` records the negative finding + points at the upstream issue/PR that would unblock.

### D-prep exit criteria

- [ ] All 10 commits landed on `feat/phase-d-account-list`
- [ ] `bun test` green (expected ~194 passing; +25 over Phase C baseline of 169)
- [ ] `bun run lint` clean
- [ ] `bun run build` clean (`tsc` no errors)
- [ ] `trongrid --help` and `trongrid` (bare) render equivalently
- [ ] `trongrid account view --fields address,balance_trx` (human mode) shows only those two fields — the rest suppressed
- [ ] `trongrid account view NOT_AN_ADDRESS; echo $?` exits with code 2
- [ ] Hint lines on at least 3 error paths read distinctly from their error lines (spot-check)
- [ ] PR opened: "Phase D-prep: plumbing fixes from Phase C trial walkthrough"
- [ ] PR review completed, merged to `main`

### D-prep PR body template

```
## Summary

Phase D-prep: 10 cross-cutting plumbing fixes from the Phase C trial walkthrough.

- P1-P2: --fields threads through human mode (closes trial #3)
- P3: applySort stable tie-breaker (closes trial #10)
- P4: validators throw UsageError for exit code 2 (closes trial #11)
- P5: error vs hint rebalance — distinct information, not restated symptom (closes trial #4)
- P6a-b: extract columns.ts + transfers.ts with atomic and list-essence renderers;
  fold plural fix into the renderer migration (closes trial #5)
- P7: export renderTxs + render snapshot parity (code-review follow-up)
- P8: bare `trongrid` renders full help (closes trial #9)
- P9: commander.js helpGroup investigation (closes trial #8; outcome-dependent impl commit)

No new commands. No new production dependencies.

## Test plan

- [x] bun test (~194 passing, +25 over main)
- [x] bun run lint + build
- [x] manual: trongrid (bare) + trongrid --help parity
- [x] manual: exit code 2 on bad address, bad block id, bad token id
- [x] manual: --fields filtering in human mode on 3+ commands

Phase C trial items addressed: #3, #4, #5, #8, #9, #10, #11 (7 of 8 Wave-2-tagged;
#6 moves to Phase E per roadmap).
```

---

## D-main PR — Three new list commands + consistency pass

Three new commands + phase-close doc updates. Each command follows the Phase C 3-commit rhythm: **scaffold** (types + failing test + file layout) → **endpoint** (real fetch logic + fetch tests) → **register** (action wiring + renderer + integration tests).

### File map (D-main)

| File | Change | Task |
|------|--------|------|
| `src/index.ts` | Register global `--before <ts|date>` / `--after <ts|date>` flags; extend `GlobalOptions` with `before?: string, after?: string` | M1.2 |
| `src/utils/time-range.ts` | **new** — `parseTimeRange(before?: string, after?: string): { minTimestamp?: number, maxTimestamp?: number }`. Accepts unix seconds (1–13 digit decimal string) and ISO-8601 (`2026-04-14T12:00:00Z` or `2026-04-14`). Throws `UsageError` on unparseable input or inverted range. | M1.2 |
| `tests/utils/time-range.test.ts` | **new** — unix seconds / unix ms rejected with hint / ISO date / ISO datetime / mixed / both absent / inverted range error / unparseable error | M1.2 |
| **`src/commands/account/transfers.ts`** | **new** — `AccountTransferRow` type (S2 shape with `direction`), `fetchAccountTransfers(client, address, { limit, minTimestamp, maxTimestamp })` via `/v1/accounts/:address/transactions/trc20`, `TRANSFERS_SORT_CONFIG` with `tieBreakField: "timestamp"`, `registerAccountTransfersCommand(account, parent)` wiring. Render goes through the new `src/output/transfers.ts` `renderCenteredTransferList` from P6b. | M1.1, M1.2, M1.3 |
| `src/index.ts` (under the `account` parent returned by `registerAccountCommands`) | Wire `registerAccountTransfersCommand` | M1.3 |
| `tests/commands/account-transfers.test.ts` | **new** — ~12 cases: fetch + TRC-20 parsing, fetch + TRC-10 parsing, token_info present/absent, default sort + tie-break, --sort-by amount, --reverse, --before unix, --after ISO, inverted range error, default_address fallback, empty result, `--json --fields from,to,amount` | M1.1 + M1.3 |
| **`src/commands/account/delegations.ts`** | **new** — `DelegationRow` type (S1 shape + `direction: "out" \| "in"` + `resource` + `expire_time` dual field), `fetchAccountDelegations(client, address)` runs parallel `/wallet/getdelegatedresourcev2outindex` + `/wallet/getdelegatedresourcev2inindex`, resolves each address via `/wallet/getdelegatedresourcev2`, flattens to `DelegationRow[]`, sorts by `amount desc` default. `registerAccountDelegationsCommand`. Custom human renderer prints two sections (`Delegated out` / `Delegated in`) with empty-section suppression, composed from `columns.ts` primitives. | M2.1, M2.2, M2.3 |
| `src/index.ts` | Wire `registerAccountDelegationsCommand` | M2.3 |
| `tests/commands/account-delegations.test.ts` | **new** — ~10 cases: out-only, in-only, both, all-empty, default sort across directions, `--sort-by expire_time`, section rendering snapshot, JSON stays flat array with `direction`, `default_address` fallback, sort tie-break | M2.1 + M2.3 |
| **`src/commands/account/permissions.ts`** | **new** — `PermissionBlock` type, `AccountPermissions` structured type `{ address, owner, active, witness? }`, `fetchAccountPermissions(client, address)` reuses `/wallet/getaccount` (same endpoint as `account view`), extracts owner/active/witness fields. Custom section renderer — **no `applySort`**, rejects `--sort-by` / `--reverse` with `UsageError`. `registerAccountPermissionsCommand`. Each permission block's keys are internally sorted by `weight desc` inside the renderer (not via `applySort`, not user-controllable). | M3.1, M3.2, M3.3 |
| `src/index.ts` | Wire `registerAccountPermissionsCommand` | M3.3 |
| `tests/commands/account-permissions.test.ts` | **new** — ~10 cases: single-key owner, multi-key owner (2-of-3), multi-active-permission, witness present (SR), witness absent, JSON shape is `{ owner, active, witness? }` (not `Row[]`), human section rendering snapshot (3 forms), `--sort-by weight` → `UsageError` exit 2, `--reverse` → same, `default_address` fallback | M3.1 + M3.3 |
| `docs/plans/status.md` | Phase D close update: active phase → Phase E, Phase D marked ✅ in current-phase table, test count updated | M5 |
| `docs/roadmap.md` | Phase D checklist all `- [x]`; Phase D marked ✅ in the phase heading | M5 |

### Task outline (D-main, 11 commits)

**Command 1 — `account transfers [address]`** (3 commits, Phase C rhythm)

- **M1.1** — `feat: account transfers scaffold + AccountTransferRow type`
  Create `src/commands/account/transfers.ts` with types, empty `fetchAccountTransfers`, sort config declaration, and the first failing test in `tests/commands/account-transfers.test.ts`. No endpoint wiring yet.

- **M1.2** — `feat: parseTimeRange util + --before/--after global flags + fetchAccountTransfers`
  Create `src/utils/time-range.ts` + tests. Extend `src/index.ts` to register the two global flags. Wire the real `fetchAccountTransfers` body. Fetch-level tests pass (fetch → parse → return rows).

- **M1.3** — `feat: register account transfers command with centered render`
  Add the command registration, action wiring, renderer calling `renderCenteredTransferList`, integration tests including sort / reverse / filter / default-address / empty / fields.

**Command 2 — `account delegations [address]`** (3 commits)

- **M2.1** — `feat: account delegations scaffold + DelegationRow type`
  New file + types + empty fetch + first failing test.

- **M2.2** — `feat: fetchAccountDelegations parallel index resolution`
  Real fetch body. Two parallel index calls, per-entry resolution, flattening to `DelegationRow[]`. Fetch-level tests.

- **M2.3** — `feat: register account delegations with two-section render`
  Registration + custom renderer (sections with empty-suppression) + integration tests.

**Command 3 — `account permissions [address]`** (3 commits)

- **M3.1** — `feat: account permissions scaffold + structured types`
  New file + `PermissionBlock` / `AccountPermissions` types + empty fetch + first failing test. This is the command that deviates from the `Row[]` pattern — note in the file header references `units.md` intentional-deviation clause.

- **M3.2** — `feat: fetchAccountPermissions reusing getaccount endpoint`
  Real fetch body reading `owner_permission`, `active_permission`, `witness_permission` from the existing `/wallet/getaccount` call.

- **M3.3** — `feat: register account permissions with structured section render`
  Registration, custom section renderer, `--sort-by` / `--reverse` UsageError rejection, integration tests.

**Phase D close** (2 commits)

- **M5a** — `docs: update status.md with Phase D close state`
  Rolling session doc updated with Phase D merged state, new test count, Phase E as next active.

- **M5b** — `docs: update roadmap.md Phase D checklist to complete`
  All Phase D items marked `- [x]`, Phase D heading gets the ✅ marker.

### D-main exit criteria

- [ ] All 11 commits landed on `feat/phase-d-account-list` (on top of D-prep's 10)
- [ ] `bun test` green (expected ~226 passing; +32 over D-prep's ~194)
- [ ] `bun run lint` + `bun run build` clean
- [ ] `trongrid account transfers` (no address) uses default_address and prints sorted list
- [ ] `trongrid account transfers TR... --before 2026-04-01 --after 2026-03-01` filters by date range
- [ ] `trongrid account delegations TR...` prints "Delegated out" / "Delegated in" sections with empty suppression
- [ ] `trongrid account permissions TR... --json` returns `{ owner, active, witness? }` shape (not an array)
- [ ] `trongrid account permissions TR... --sort-by weight; echo $?` exits with code 2
- [ ] Human-mode output on all three new commands vertically aligns per `feedback_human_render_alignment` rules (manual spot-check)
- [ ] PR opened: "Phase D-main: account transfers / delegations / permissions + resources consistency"
- [ ] PR review completed, merged to `main`

### D-main PR body template

```
## Summary

Phase D-main: three new account list commands built on the Phase D-prep
plumbing. (The originally planned `account resources` consistency pass
was dropped post-source-review — already shipped during Phase B.)

- `account transfers [address]` — centered transfer list with --before/--after
  timestamp range, S2 unit shape, direction field, renderCenteredTransferList
- `account delegations [address]` — Stake 2.0 parallel out+in index fan-out,
  flattened rows with direction discriminator, two-section human render
- `account permissions [address]` — structured multi-sig view (owner/active/
  witness), S-class deviation, --sort-by rejected with UsageError

Deferred: `account approvals <owner>` pending TRON-eco-vs-TronGrid-only
positioning (tracked in status.md decision ledger).

## Test plan

- [x] bun test (~226 passing, +32 over D-prep baseline ~194)
- [x] bun run lint + build
- [x] manual: each new command with a default_address set, with explicit address,
  with --reverse, with --sort-by, with --json, with --fields subset
- [x] manual: `account transfers --before 2026-04-01 --after 2026-03-01` range
- [x] manual: `account permissions --sort-by weight` exits 2
- [x] manual: column alignment spot-check per feedback_human_render_alignment

Dropped: `account resources` consistency pass — verified already shipped
during Phase B (ex-A+); see the scope-correction note near the top of
docs/designs/phase-d.md for the audit trail.
```

---

## Phase D overall exit criteria

- [ ] Both D-prep and D-main PRs merged to `main`
- [ ] Cumulative test count ~226+ passing
- [ ] `docs/plans/status.md` reflects Phase D as ✅; active phase = Phase E
- [ ] `docs/roadmap.md` Phase D section all `- [x]` + heading marked ✅
- [ ] No new production dependencies (still 1 — `commander`)
- [ ] `git log --oneline main..HEAD` (pre-merge) shows ~21 atomic commits with distinct subjects, no `wip:` / `fixup!`
- [ ] All deferred items from Phase D (just `account approvals`) have an explicit roadmap entry pointing to the positioning-decision blocker

---

## Out-of-band notes

**Branch.** This plan is authored on `feat/phase-d-account-list`, which is also the branch both PRs open from. D-prep and D-main can technically share one branch with two PRs targeting `main` sequentially — after D-prep merges, D-main rebases on the updated `main` and opens its PR.

**Memory-driven design decisions.** The following memory entries shape decisions in this plan — any future reviewer should read them before proposing changes:

- `feedback_human_render_alignment` — column alignment (P6b, M1.3, M2.3, M3.3)
- `feedback_transfer_list_two_styles` — why `src/output/transfers.ts` is named generically and reserves space for uncentered variant (P6b, M1.3)
- `feedback_commit_rhythm` — why three commits per command (all M-tasks) and why P9 commits regardless of outcome
- `feedback_needs_driven_design` — why `account approvals` is deferred rather than dropped
- `project_tron_eco_positioning` — the specific blocker on `account approvals`
- `feedback_know_why` — why this spec includes both what and why
- `feedback_open_source_privacy` — why no insider references in any commit / test / renderer strings

**Execution sub-skill.** Once this spec is expanded by `superpowers:writing-plans` into a Step-level executable plan, implementation runs via `superpowers:subagent-driven-development` — one task at a time, one sub-agent per task (implementer → spec reviewer → code reviewer per the Phase C triad). No batch execution.
