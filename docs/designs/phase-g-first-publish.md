<!-- lifecycle: frozen -->
# Phase G — First npm publish (v0.1.0)

> Spec for the first tagged release. Brings the read-side CLI (Phases A–F, 31 commands) to the public npm registry, ahead of the originally planned Phase I slot.

## Background

Originally, npm publish was Phase I in the roadmap, sequenced after Phase G (Governance + stats) and Phase H (Write-side). The release timing brought it forward — A–F already deliver a usable read-only CLI; later phases enrich the surface but don't gate first publish.

Roadmap reshuffle (2026-04-17):

| Old phase | New phase | Theme |
|-----------|-----------|-------|
| G — Governance + stats | **H** | shifts back one |
| H — Write-side TBD | **I** | shifts back one |
| I — npm publish | **G** (this spec) | brought forward |
| J–O | unchanged letters | version numbers shift +2 |

A–F remain frozen.

## Goal

Ship `trongrid@0.1.0` to npm with:
- Read-side CLI surface from Phases A–F (31 commands across 7 resources)
- Two pre-publish bug fixes addressing high-visibility correctness/UX issues
- README sufficient for first-time install + agent integration
- Parity matrix giving prospective users (human and AI) a transparent comparison vs TronGrid official MCP and TronScan MCP
- Git tag `v0.1.0` + GitHub Release

## Scope

**In scope** — 8 tasks, position = priority:

1. Fix `applySort` numeric sort
2. Handle extreme values in transfer list display
3. Write README
4. Write parity matrix (`docs/designs/competitor-parity.md`)
5. Finalize `package.json`
6. Pre-publish dry-run + local install test
7. `npm publish`
8. Git tag `v0.1.0` + GitHub Release

**Out of scope** (deferred):

- Governance + stats commands → new Phase H
- Write-side commands → new Phase I
- Other deferred display items (`account view` thousands sep, `account delegations` column header, holders/internals/events list redesigns) — land during their respective list-display redesigns
- Other deferred bugs (`--fields` human mode no-op, composite filter keys silent `{}`, network error auto-retry) — addressed when they bottleneck specific work
- TRON-eco vs TronGrid-only positioning — remains open across phases

## Task details

### Task 1 — Fix `applySort` numeric sort

**Problem:** `applySort` compares values as strings via `String.prototype.localeCompare` (or similar). For numeric fields stored as decimal strings (e.g. `value` in `TransferRow`, where API returns raw token amounts as strings to preserve precision), this gives lexicographic order — `"100"` sorts BEFORE `"99"` for unequal-width numbers.

Surfaced by E2E during P0: a user running `trongrid token transfers USDT --sort-by value` gets visibly wrong order when amounts span different magnitudes.

**Fix:** Add a `fieldTypes: Partial<Record<keyof T, "string" | "number" | "bigint">>` map to `SortConfig<T>`. Default missing entries to `"string"` (current behavior). For `"number"` fields, parse with `Number()` before compare. For `"bigint"` fields, parse with `BigInt()` before compare. Use `"bigint"` for token amounts (preserves precision), `"number"` for block numbers / timestamps (always safe-integer range).

**Migration:** Update sort configs across the codebase to declare types where relevant. Conservative — only fields actually used as numeric sort targets need entries; the rest fall through as string compare.

| Sort config | Fields needing types |
|-------------|---------------------|
| `account/transfers.ts` `TRANSFERS_SORT_CONFIG` | `block_number`: number, `block_timestamp`: number, `value`: bigint |
| `token/transfers.ts` `TOKEN_TRANSFERS_SORT_CONFIG` | `block_number`: number, `block_timestamp`: number, `value`: bigint |
| `account/txs.ts` `TXS_SORT_CONFIG` | `block_number`: number, `timestamp`: number, `amount`: number, `fee`: number |
| Other configs | Audit during implementation |

**Tests:** Add unit test covering numeric vs string sort behavior for unequal-width values. E.g., values `["100", "99", "1000"]` sorted desc must yield `["1000", "100", "99"]`, not `["99", "1000", "100"]`.

### Task 2 — Handle extreme values in transfer list display

**Problem:** Scam tokens emit `Transfer` events with `value = uint256.max` (`2^256 - 1` ≈ 1.16e77). When `formatMajor` converts this with token decimals, `value_major` is an 80+ character decimal string. The `addThousandsSep` adds commas, and the result blows up `renderTransferList`'s Amount column. Subsequent rows misalign because `numWidth` is derived from this outlier.

Per `docs/designs/human-display.md` §2.3:

| Context | Value | Display |
|---------|-------|---------|
| Transfer amount | `> 10^15` (abnormally large) | Scientific notation: `1.15e+59 USDT` |
| Transfer amount | `== uint256.max` | `⚠ 1.15e+59 USDT` + warning |

**Fix:** Add `formatExtremeIfNeeded(valueMajor: string, opts: { uint256MaxRaw?: string }): string` helper, applied in `renderTransferList` (and any other list renderer with a major-unit amount column). The helper:
- If integer part length > 16 (i.e., > 10^15): convert to `{significand}e+{exponent}` with 2 sig digits in significand
- If raw value === `2^256 - 1`: prepend `⚠` (U+26A0) followed by a single space
- Otherwise: return unchanged

The `uint256MaxRaw` detection requires plumbing the raw `value` (not just `value_major`) into the comparison. `TransferRow.value` already carries it.

**JSON mode unaffected** — raw string values always present.

**Tests:** 3 cases minimum:
- Normal value → unchanged
- `value_major` integer part > 16 digits → scientific notation
- `value === "115792089237316195423570985008687907853269984665640564039457584007913129639935"` → warning-prefix + scientific notation (e.g. `⚠ 1.15e+59 USDT`)

### Task 3 — Write README

**Audience:** First-time visitors on npmjs.com and GitHub. Two personas:
- Human developers wanting a TRON CLI for terminal use
- AI agent operators wanting a structured TronGrid wrapper

**Sections (order = priority):**

1. **Tagline** — one-line "TRON CLI built on TronGrid, designed for humans and AI agents"
2. **Install** — `npm i -g trongrid` (or `bun add -g`); requires Node ≥ 22
3. **Quick start** — `trongrid auth login` (manual key entry for v0.1.0); `trongrid account view <addr>`
4. **5 usage examples** — illustrate range:
   - `account view <addr>` — single-value lookup
   - `account transfers <addr> --limit 10` — list with column display
   - `token balance USDT <addr> --json` — machine output
   - `tx view <hash>` — detail view
   - `block latest --confirmed` — flag illustration
5. **Agent integration** — link to `AGENTS.md`; mention `--json` is the machine surface; show `trongrid <cmd> --help` flow
6. **Parity matrix link** — to `docs/designs/competitor-parity.md` for "what does this give me vs the official MCPs?"
7. **Contributing** — link to `AGENTS.md` (which already covers dev setup, conventions)
8. **License** — MIT

**Tone:** Professional, concise, agent-friendly (structured headings, short examples, no marketing fluff).

**Constraint:** Public-facing English. Per `feedback_open_source_privacy` memory, no employer/team/insider framing. Independent community project.

### Task 4 — Write parity matrix

**File:** `docs/designs/competitor-parity.md`

**Structure:**

1. **Why this exists** — Help users (human + AI) decide between `trongrid-cli`, TronGrid official MCP, and TronScan MCP. Transparency over salesmanship.
2. **Subjects compared** — `trongrid-cli` (this), `trongrid-mcp` (official), `tronscan-mcp` (community)
3. **Per-resource command matrix** — for each resource (account, block, contract, token, tx), table showing which CLI/MCP supports which operation.
4. **Endpoint mapping** — for trongrid-cli, list which TronGrid REST endpoint each command uses (audit trail; lets users verify scope).
5. **Strength/gap summary** — short bullets per subject, no "winner declaration".

**Living doc** — `<!-- lifecycle: living -->` at top. Will accumulate updates as competitors evolve and as new commands ship.

### Task 5 — Finalize `package.json`

**Required fields to verify/set:**

```json
{
  "name": "trongrid",                     // see availability check below
  "version": "0.1.0",
  "description": "TRON CLI built on TronGrid — for humans and AI agents",
  "keywords": ["tron", "trongrid", "blockchain", "cli", "agent", "mcp"],
  "homepage": "https://github.com/dongzhenye/trongrid-cli",
  "repository": { "type": "git", "url": "git+https://github.com/dongzhenye/trongrid-cli.git" },
  "bugs": { "url": "https://github.com/dongzhenye/trongrid-cli/issues" },
  "license": "MIT",
  "author": "Zhenye Dong <dongzhenye@gmail.com>",
  "bin": { "trongrid": "dist/index.js" },
  "engines": { "node": ">=22" },
  "files": ["dist", "README.md", "AGENTS.md", "LICENSE"],
  "type": "module"
}
```

**npm name resolution (do this first in the task):**

1. Check `npm view trongrid` — if 404, claim is available
2. If taken: try `trongrid-cli` next; if also taken, `@dongzhenye/trongrid` (scoped). Document the decision in `naming.md` if changed.

**Author/identity:** Ship as personal (`Zhenye Dong`). Per `npm Name & Org` memory, ownership transfer is a separate decision; v0.1.0 publish doesn't depend on it.

**LICENSE file:** Add MIT LICENSE if not already present at repo root.

### Task 6 — Pre-publish dry-run + local install test

**Steps:**

1. `npm pack --dry-run` — inspect contents (should be `dist/`, README, AGENTS, LICENSE, package.json; nothing else)
2. `npm pack` — produce `trongrid-0.1.0.tgz`
3. Fresh shell, separate dir: `npm install -g ./trongrid-0.1.0.tgz`
4. Smoke test:
   - `trongrid --version` → `0.1.0`
   - `trongrid --help` → top-level help renders
   - `trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json` → valid JSON
   - `trongrid account transfers TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --limit 3` → list renders
5. Uninstall: `npm uninstall -g trongrid`

**Goal:** Catch packaging issues (missing files, broken bin shebang, dependency holes) before public publish.

### Task 7 — `npm publish`

**Steps:**

1. Verify `npm whoami` matches expected publisher account. Run `npm login` if needed.
2. `npm publish --access public` (explicit `--access public` for scoped packages; harmless for unscoped)
3. Verify `npm view trongrid version` returns `0.1.0`
4. Visit `https://www.npmjs.com/package/trongrid` to confirm README rendered correctly

### Task 8 — Git tag v0.1.0 + GitHub Release

**Steps:**

1. From `main` (post-merge of this phase): `git tag -a v0.1.0 -m "v0.1.0 — first public release"`
2. `git push origin v0.1.0`
3. `gh release create v0.1.0 --generate-notes --title "v0.1.0 — first public release"` — auto-generates notes from PR list
4. Edit release notes to add a top section summarizing the release: command count, network support, agent integration, install instructions

## Open items resolution within this phase

| Item | Resolution |
|------|------------|
| **npm package name availability** | Check `npm view trongrid` first task in Task 5. Fallback chain: `trongrid` → `trongrid-cli` → `@dongzhenye/trongrid`. |
| **TRON-eco vs TronGrid-only positioning** | README uses neutral framing: "built on TronGrid; selected commands may use other endpoints in future based on user need". Strategic decision remains open across phases. |
| **Author/identity org handoff** | v0.1.0 ships as personal. Ownership transfer is a separate, post-launch concern. |
| **Token symbol map refresh** | Optional refresh during README writing (Task 3) — let examples use current verified tokens. Don't expand the map significantly in this phase. |

## Exit criteria

- [ ] `applySort` numeric sort fix shipped, tests cover unequal-width numeric values
- [ ] `renderTransferList` extreme-value handling shipped, scam-token transfers render readably
- [ ] README renders correctly on npmjs.com
- [ ] `docs/designs/competitor-parity.md` exists with at least account/block/contract/token/tx tables
- [ ] `package.json` finalized; npm name claimed
- [ ] `npm view trongrid version` (or chosen name) returns `0.1.0`
- [ ] Git tag `v0.1.0` pushed; GitHub Release created with notes
- [ ] All pre-existing tests still pass; no regressions

## References

- Plan: `docs/plans/phase-g-first-publish.md` (will be created via writing-plans skill)
- Parent: [`docs/roadmap.md`](../roadmap.md) Phase G section
- Display conventions: [`docs/designs/human-display.md`](./human-display.md) §2.3 (extreme values)
- Project conventions: [`meta/WORKFLOW.md`](https://github.com/dongzhenye/meta/blob/main/WORKFLOW.md) §3 (commits, branches, releases)
- Memory: `project_npm_name_and_org`, `project_tron_eco_positioning`, `project_token_symbol_source`
