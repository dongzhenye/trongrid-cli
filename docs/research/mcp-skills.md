# MCP / Skills Competitor Review

**Date**: 2026-04-14
**Purpose**: Identify conventions and anti-patterns in published TRON-ecosystem MCP servers and Skills before designing the Phase B command surface (~38 new commands across 11 resources).

**Sources reviewed**:

- TronGrid MCP — https://developers.tron.network/reference/mcp-api
- TronGrid Skills — https://developers.tron.network/reference/skills (8 skills)
- TronScan MCP — https://mcpdoc.tronscan.org/en/mcp (~119 tools, 10 categories)
- TronScan Skills — https://mcpdoc.tronscan.org/en/skills (11 skills)

**Method**: extract each product's API shape, parameter/field naming, error model, auth, entity coverage, pagination/sort. Tag each pattern with one of three angles for `trongrid-cli`: **Adopt** (align), **Avoid** (deliberate divergence), **Open question** (decision deferred to user). Cross-reference against [`units.md`](./units.md) S1/S2 and [`commands.md`](./commands.md) Part I grammar; flag divergences rather than silently align.

---

## 1. Source summary at a glance

| Dimension | TronGrid MCP | TronScan MCP |
|---|---|---|
| Surface | 164 tools across 4 namespaces (TronGrid REST, FullNode Wallet, FullNode WalletSolidity, FullNode JSON-RPC) | ~119 tools, flat namespace, 10 documentation categories |
| Tool naming | `camelCase` verb-first (`getAccountInfo`, `listWitnesses`, `broadcastTransaction`); implicit prefix scoping (`solidity*`, `eth*`) | `camelCase` strictly `get`-prefixed (`getBlocks`, `getAccountDetail`, `getTrc20TokenDetail`); plural-vs-singular signals list-vs-detail |
| Parameter style | `snake_case` (`id_or_num`, `include_bytecode`, `visible`) | Mixed; positional integer enums for filter (`show=1|2|3|4`, `type=0..4`); `sort: "-number"` (Mongo-style) |
| Auth | Optional `TRON-PRO-API-KEY` header; free tier ≥ 3 QPS; paid ≥ 1000 QPS | Same header; key optional |
| Unit handling | Published direction: paired-field `_major` / `_trx` / `balance_unit` siblings on raw integers (matches our S1/S2) | Raw integers only; conversion (sun→TRX, ÷10^decimals) is documented in skill prose, caller's job |
| Error envelope | None standardized; upstream strings leak through; recovery hints in prose | Not documented |
| Pagination/sort | Per-tool, inherited from upstream (mix of `limit`/`offset`, timestamp ranges) | `limit` mentioned; sort uses `-field`/`+field` |
| Skills count | 8 | 11 |
| Skill granularity | Task-per-skill (`account-profiling`, `token-scanner`) | Entity-per-skill (`tronscan-account-profiler`, `tronscan-block-info`) with explicit "not my scope; redirect to sibling X" boundaries |
| Skill output | Prose report (formatted text, not JSON) | Prose report; example queries in natural language |
| Write surface | Exposed in MCP (80+ tools), absent from all 8 skills | Effectively read-only |

---

## 2. Adopt — patterns to align with

**A1. Paired-field unit shape (`balance` + `decimals` + `balance_major`).** TronGrid's published direction independently arrived at the same shape as our [`units.md`](./units.md) S2 — same head word (`balance`), same exponent field (`decimals`), same major-unit suffix (`_major`). The TRX flavor (`balance` + `balance_trx` + `balance_unit: "sun"`) matches our S1 with one minor enrichment on our side: we additionally include static `decimals: 6` on TRX (per P4 — "bonus static decimals reduces lookup friction"). Action: keep our shape as-is; add a one-line cross-reference to TronGrid's MCP design in `units.md` §3 head-word rationale.

**A2. Default-strip bulky fields with `--include-X` opt-in.** TronGrid's MCP defaults `include_bytecode=false` for `getContractInfo` (~65K → ~5K). CLI equivalent: `trongrid contract view` strips `bytecode` / `runtimecode` by default; users opt in via `--include-bytecode` or `--full`. Same principle applies to deeply nested account state, large event logs, multi-page receipts.

**A3. Default-filter junk data with explicit escape hatch.** TronGrid forcibly filters `assetV2` zero-value entries (TRC-10 airdrop spam: 250+ → ~5 meaningful rows). CLI `account tokens` should default-hide zero-balance TRC-10/20; add `--include-empty` for auditing. Document the filter in `--help` (transparency requirement).

**A4. Default address format normalization (`visible: true` injection).** TronGrid defaults to Base58 (`T...`) on all output; users opt into hex (`41...`) when needed. We already do this implicitly; codify it: any address-returning JSON field is Base58 by default, with `--address-format hex` global flag for EVM-bridge workflows.

**A5. Skill scope boundaries with sibling redirects.** TronScan's skill prose includes explicit anti-scope ("does not apply to address balance — use `tronscan-account-profiler` for that"). Cheap, prevents LLM misrouting. Action: every command's `--help` description ends with a "Related: `<sibling commands>`" footer when applicable. Adopt for `commands.md` doc template too.

**A6. Verb vocabulary mining.** Both MCPs converge on a verb set: `get`, `list`, `create`, `broadcast`, `trigger`, `vote`, `freeze`/`unfreeze`, `delegate`/`undelegate`, `withdraw`, `approve`, `estimate`. Adopt this vocabulary as our action verbs (mapped to subject-first CLI grammar per [`commands.md`](./commands.md) §1, e.g., `account freeze` not `freezeAccount`).

**A7. `search`-as-resolver for symbol→address.** TronScan ships a standalone `tronscan-search` skill that does name/symbol → contract resolution. Aligns with our planned `token view <symbol>` symbol-resolution feature (seeded from TronScan verified-token list per memory `project_token_symbol_source`). Reuse-friendly: this is a single problem, not two.

**A8. Optional API key, free tier, header-based auth.** Both MCPs match what we already ship via `--api-key` flag + `TRONGRID_API_KEY` env. Direct conformance, no change needed.

---

## 3. Avoid — anti-patterns to deliberately diverge from

**X1. Numeric magic-value enums for filter parameters.** TronScan's `getAccountTokens.show=1|2|4|3` (TRC20/TRC721/TRC1155/All) and `getAccountAnalysis.type=0..4`. Opaque, undocumented at call site, requires a lookup table to read. CLI alternative: string enums (`--asset-type trc20`, `--analysis transfers`). Already idiomatic for `commander.js`.

**X2. Raw integers without conversion siblings.** TronScan returns sun amounts and token raw integers; conversion is the caller's job, documented only in skill prose. This is the exact correctness bug `units.md` was written to prevent. Our shape is a deliberate divergence; a one-line note in `units.md` §3 should explicitly cite the TronScan choice and our reason for non-conformance.

**X3. Flat namespace at scale.** TronGrid (164) and TronScan (119) both keep tools in a flat namespace and rely on prefix conventions (`solidity*`, `eth*`) or out-of-band documentation categories for grouping. Works for MCP (clients search by name); fails for CLI ergonomics. Our two-level `<resource> <action>` nesting per [`commands.md`](./commands.md) §1 is the correct CLI answer; do not flatten to mirror MCP.

**X4. Untyped error responses.** Neither MCP defines a structured error envelope; errors leak as upstream strings. We already define exit codes 0/1/2/3 + `Hint:` in errors per [`cli-best-practices.md`](./cli-best-practices.md); extend on `--json` to a stable `{error: {code, message, hint}}` shape. Map TronGrid's documented error categories (`invalid-address`, `insufficient-balance`, `energy-not-enough`, `bandwidth-not-enough`, `contract-validate-error`) to canonical codes — first-class CLI feature, not an afterthought.

**X5. Per-tool ad-hoc pagination.** TronGrid inherits pagination styles from upstream (some tools use `limit`/`offset`, some use `min_timestamp`/`max_timestamp`, some have no cursor). Define one CLI-wide convention (`--limit`, `--offset` or `--cursor`, plus the sort flags resolved in Q3); adapt per command internally. This is already partially in [`commands.md`](./commands.md) Part II global flags; codify it as a contract before Phase B implementation.

**X6. Naming `getX` at CLI level.** Both MCPs use `get`-prefix verbs. Mirroring as `account get-info` would be noise — CLI verbs don't need the `get` prefix when the action is implicit (`account view`, `block view` already chosen per `commands.md` §4). Skip.

---

## 4. Resolved questions

All five blocking questions resolved 2026-04-14. Original framing kept for decision traceability; resolution stated below each.

**Q1. Confirmed-state surface (`solidity*` mirror).** TronGrid exposes 31 `solidity*` read tools that mirror Wallet reads but return only confirmed (irreversible, ~20 blocks deep) state. CLI options: (a) global flag `--confirmed` on all read commands, (b) parallel subcommand group `trongrid solidity account view ...`, (c) skip confirmed-state entirely.

> **Resolved**: (a) global `--confirmed` flag, **default off** (i.e., default reads from Wallet, includes unconfirmed latest state). Rationale: TRON unconfirmed latency ≈ 3s (single block) vs confirmed ≈ 60s (~19 blocks); a 20× freshness advantage in exchange for a ~0.01% reorg risk is the right default for read workflows. High-stakes use cases (exchange deposit confirmation, settlement, cross-chain bridge events) explicitly opt in via `--confirmed`. The risk note must appear in `--help` text for every read command and in `commands.md` global-flags table.

**Q2. `approval` as a 12th top-level resource?** TronScan ships `getApprovalList` and `getApprovalChangeRecords` as first-class account tools. ERC-20-style allowance auditing is a top safety concern (the "infinite approval" attack class). Currently in our `commands.md` Part II, `token allowance <owner> <spender>` covers this from the token side.

> **Resolved**: yes — add `account approvals <owner>` (lists outgoing allowances across all tokens, sortable by exposure size). The audit workflow starts from "who did I grant?" not "what was granted on this token?". `token allowance <owner> <spender>` stays for the targeted-pair lookup. No new top-level resource needed; lives under `account`. Updates `commands.md` Part II.

**Q3. Sort parameter shape.** Original options: (a) Mongo `--sort -field`, (b) two-flag `--sort-by + --order`, (c) per-command default + (b) for customization. Discussion surfaced a fourth option (d): per-command default + `--reverse`/`-r` to flip + `--sort-by <field>` to override field (each field carries its own inherent direction).

> **Resolved**: (d). Three reasons: (1) Unix muscle memory — `ls -r`, `sort -r`, `du -r` already map to "give me the opposite"; (2) 80% of customization need is just direction-flip, not field-change — `-r` handles it in one keystroke; (3) two flags with independent semantics beat one cryptic prefix syntax for new-user discoverability. `--order asc|desc` is dropped (redundant with `--reverse`). Mongo-style `-field` not adopted despite gcloud precedent — gcloud-alignment scope is grammar nesting, not sort syntax. Multi-key sort deferred to `--json | jq` pipe (rare for blockchain CLI). Per-command default field selection follows memory `reference_ai_usage_sort_design`: each list command independently picks its most-expected default; no global rule.

**Q4. TRC-10 vs TRC-20+ dispatch.** TronScan dispatches by tool choice (`getTrc10TokenDetail` vs `getTrc20TokenDetail`); TronGrid mostly does the same.

> **Resolved**: (b) auto-detection in a single command. Token standard is technical implementation; users care "which coin, what's it worth", not which TIP it conforms to. Auto-detect rules: pure numeric / short string → TRC-10 asset ID; 34-char Base58 / 0x-prefixed 40-hex → TRC-20+ contract address; symbol text → resolve via TronScan verified-token (加V) static map per memory `project_token_symbol_source`. `--type trc10|trc20|trc721|trc1155` override available for ambiguous inputs (e.g., a numeric symbol that collides with an asset ID).

**Q5. Versioned-API coexistence (Stake 1.0 vs 2.0).**

> **Resolved**: (a) default V2, `--stake-v1` flag for legacy escape. Stake 2.0 is default upstream and 1.0 is in active sunset; mirroring legacy as the default would propagate deprecated behavior for years.

**Q6. Skill packaging for `trongrid-cli`?** Out of scope for this review (decision per memory `project_no_mcp_layer`: no MCP server façade). But the skill question is adjacent: do we publish `trongrid-cli`-flavored Skills (orchestration recipes) on ClawHub or similar registries? Defer to Phase B exit / Phase C planning. Both competitors ship 8–11 skills; the entity-per-skill granularity TronScan uses maps cleanly to our 11-resource command map if we want this.

---

## 5. Cross-reference: confirmation of existing decisions

**`units.md` S1 (TRX) and S2 (multi-token)** — independently match TronGrid's published direction. No revision needed; add a citation footnote in §3 noting the convergent design.

**`commands.md` §1 grammar (resource → action → target)** — deliberate CLI-side divergence from MCP flat namespacing. Decision stands; the Phase B surface (38 new commands) makes nesting more valuable, not less.

**`commands.md` §4 verb naming (`view` for single, `list` for many)** — matches TronScan plural-vs-singular signaling at the *semantic* level (different verbs do the same job). No change.

**`commands.md` global flag `--limit` (default 20)** — Q3 resolution adds two companion flags: `--reverse`/`-r` (direction flip) and `--sort-by <field>` (field override). Per-command default sort field is documented inline at each list command in `commands.md` Part II, sourced per memory `reference_ai_usage_sort_design`.

---

## 6. Next actions

Each item below is a separate atomic commit, landed in the order listed.

1. ✅ **This doc** — single doc commit, captures research findings + Q1–Q5 resolutions. (Q6 deferred to Phase C.)
2. **`commands.md` updates** — add `--confirmed` global flag (Q1); add `account approvals <owner>` to account resource (Q2); add sort-flag convention `--reverse`/`-r` + `--sort-by <field>` to global flags table with per-command default sort field documented inline at each list command (Q3); confirm `token view <id|address|symbol>` accepts all three input types with auto-detection + `--type` override (Q4); add `--stake-v1` flag where Stake 2.0 / 1.0 split is observable (Q5).
3. **`units.md` §3 footnote** — cite TronGrid MCP's convergent `_major` / `_trx` / `balance_unit` direction (A1) and TronScan's deliberate raw-integer choice as the contrast we reject (X2).
4. **`architecture.md`** — record the five resolved decisions as entries (each one-liner with link back to this doc's §4).
5. **`roadmap.md` Phase B** — note any new scope items uncovered (e.g., `account approvals` shifts the ~38-command Phase B target by +1).
6. **Phase C plan** (`docs/plans/phase-c-block-account-token.md`, originally titled "Phase B Wave 1" pre-2026-04-15 regularization) — select 3–5 commands to ship together, applying the conventions confirmed here.

No code changes from this review.
