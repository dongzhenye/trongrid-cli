<!-- lifecycle: frozen -->
# Phase E — Token family polish

> **For agentic workers:** this document is the Phase E **spec** (brainstorming output, human-facing) — it defines goal, architecture, file map, task outline, and exit criteria, and it stays stable as the "what and why". Its sibling **plan** (step-level implementation detail, agent-facing) lives at [`../plans/phase-e.md`](../plans/phase-e.md) and is produced from this spec by the `superpowers:writing-plans` skill; the plan iterates as the "how".
>
> **Phase E ships as a single PR** on branch `feat/phase-e-token-family`, structured in two logical sections: E-prep (plumbing, no new commands) then E-main (four new commands). Unlike Phase D's two-PR split, the plumbing surface is smaller here and the dependency is tighter — batch token info utility is consumed immediately by both the `account tokens` fixes and the new commands.

**Goal.** Ship the four remaining `token` subcommands (`holders`, `transfers`, `balance`, `allowance`) and close the three `account tokens` display trial items from Phase C. Token type support: TRX + TRC-20 required; TRC-10 / TRC-721 / TRC-1155 emit "not yet supported" `UsageError` with forward-looking hint.

## Strategic context: the positioning tension

Every Phase surfaces instances where TronGrid's API cannot serve a user need that an indexer (TronScan) could — token holders for TRX, network-wide TRX transfers, address tags, contract creator lookups. These are symptoms of an unresolved product positioning question:

| Framing | Constraint | Implication |
|---------|-----------|-------------|
| **TronGrid API wrapper CLI** | TronGrid endpoints only | Gaps documented as API feature requests; scope stays narrow |
| **TRON ecosystem user CLI** (by the TronGrid team) | TronScan + other APIs allowed | Richer coverage; multiple API dependencies; may absorb tronscan-cli scope |

This decision is intentionally deferred — it is not a Phase E blocker. Phase E stays on the TronGrid-only side. Each deferred item (TRX holders, TRX transfers, address tags, contract creator) is evidence that will inform the positioning decision when it is made. The deferred items are tracked in `docs/roadmap.md`.

## Architecture

### New utilities (E-prep)

**1. Batch token info client** (`src/api/token-info.ts`)

Wraps `GET /v1/trc20/info?contract_list={addresses}` — resolves symbol, name, decimals, type, and totalSupply for up to 20 TRC-20 tokens in one HTTP call.

```typescript
interface Trc20Info {
  contract_address: string;
  name: string;
  symbol: string;
  decimals: number;
  type: string;           // "trc20", "trc721", "trc1155"
  total_supply: string;   // raw integer string
}

async function fetchBatchTrc20Info(
  client: ApiClient,
  addresses: string[],
): Promise<Map<string, Trc20Info>>
```

- Max 20 addresses per call (API limit). Callers with more addresses chunk and fan out.
- Returns a `Map<contractAddress, Trc20Info>` for O(1) lookup.
- Graceful degradation: on batch failure, callers fall back to individual `triggerConstantContract` calls (existing path).
- Used by: `account tokens` (replacing per-token RPC), `token holders` (decimals + totalSupply for share %), `token transfers` (decimals for value_major), `token balance` (decimals + symbol for display).

**2. Hex-to-Base58 address conversion** (added to `src/utils/address.ts`)

The `/v1/contracts/{addr}/events` endpoint returns EVM hex addresses (`0x...`). Conversion to TRON Base58Check:

1. Strip `0x` prefix
2. Prepend `41` (TRON address prefix byte)
3. Double SHA256 → first 4 bytes = checksum
4. Base58 encode (`41` + 20 bytes + 4 checksum bytes)

Uses Node.js built-in `crypto` module for SHA256 + a ~30-line Base58 encoder. Zero new dependencies. Note: this utility is for internal event-result parsing; accepting `0x` addresses as CLI input (currently rejected — `token-identifier.ts:47`) is deferred to a future phase.

**3. Token identifier dispatch update** (`src/utils/token-identifier.ts`)

- Rename discriminator field: `kind` → `type` across the union and all consumers.
- Add `TRX` as a special-case symbol: `{ type: "trx" }`.
- Widen the union to include `{ type: "trc10" }`, `{ type: "trc721" }`, `{ type: "trc1155" }` (these were previously thrown as errors at detection time; now they return a typed result so each command can decide its own support level).
- Update `TokenTypeOverride` to include `"trx"`.

New type:

```typescript
export type TokenIdentifier =
  | { type: "trx" }
  | { type: "trc10"; assetId: string }
  | { type: "trc20"; address: string }
  | { type: "trc721"; address: string }
  | { type: "trc1155"; address: string };
```

Each command checks `id.type` and throws `UsageError` for unsupported types with a forward-looking hint: `"TRC-10 tokens are not yet supported for this command. Support is planned for a future release."`

**4. Uncentered transfer list renderer** (added to `src/output/transfers.ts`)

Per memory `feedback_transfer_list_two_styles`: centered lists have a `direction` column (used by `account transfers`); uncentered lists show `from` and `to` as peers (used by `token transfers`, future `tx transfers`, `block transfers`).

```typescript
export interface UncenteredTransferRow {
  tx_id: string;
  block_timestamp: number;     // unix ms
  from: string;
  to: string;
  value: string;               // raw
  decimals: number;
  value_major: string;
}

export function renderUncenteredTransferList(rows: UncenteredTransferRow[]): void
```

Column order: `time | from | → | to | value_major | tx_id`. Right-aligns value column; truncates addresses and tx_id.

### `account tokens` improvements (E-prep)

Three items from Phase C trial feedback, all touching `src/commands/account/tokens.ts` and its renderer:

**Trial #1 �� Symbol as primary identifier.** Replace the current `[TYPE] contract(truncated) balance` display with `[TYPE] SYMBOL (contract) balance`. Key columns first (symbol as friendly name + contract as unique ID, grouped together), then metric column (balance). Token metadata comes from the new batch token info utility. Fallback when batch fails: truncated contract address as before.

The `TokenBalance` interface gains optional `symbol?: string` and `name?: string` fields. `fetchAccountTokens` calls `fetchBatchTrc20Info` for all TRC-20 addresses in one shot, then maps results onto each `TokenBalance`.

**Trial #6 — Lookup-failure marker.** When `decimals` is undefined (batch + fallback both failed), the human renderer shows:

```
  [TRC20] [?] (TXyz...4321)  1234567890 (decimals unresolved)
```

The `[?]` prefix and `(decimals unresolved)` suffix replace the current silent raw-only fallback, giving the user context on why the balance looks odd.

**Trial #7 — Suppress redundant raw.** When `balance_major === balance` (true when decimals is 0 — common for old TRC-10 tokens), skip the `(raw N)` annotation. The information is identical; showing both is noise.

## Commands (E-main)

### `token holders <id|address|symbol>`

**Endpoint:** `GET /v1/contracts/{addr}/tokens?limit=N&order_by=balance,desc`

**Supported types:** TRC-20. TRX → `UsageError` "TRX holder ranking is not available on TronGrid. Support depends on a future product decision." TRC-10 / TRC-721 / TRC-1155 → "not yet supported" hint.

**Response parsing:** The endpoint returns `{holderAddress: rawBalance}` single-entry maps. Parse into `HolderRow[]`:

```typescript
interface HolderRow {
  rank: number;
  address: string;
  balance: string;          // raw
  decimals: number;
  balance_major: string;
  share_pct: string;        // "15.25" — percentage of total supply
}
```

`decimals` and `total_supply` come from `fetchBatchTrc20Info` (single call for the token contract). `share_pct` = `holderBalance / totalSupply * 100`, computed via BigInt arithmetic to avoid float precision loss.

**Human output:**

```
Top 20 holders of USDT (TR7N...Lj6t):

   #   Address         Balance              Share
   1   TKHu...QgFs     1,317,713,193.08     15.25%
   2   TWd4...5jwb       800,000,000.00      9.26%
   3   TDqS...d197       775,541,318.93      8.98%
```

Rank right-aligned, balance right-aligned, share right-aligned. Token name + address in header from batch token info.

**Default sort:** balance desc (server-side). `--reverse` flips. `--sort-by` supports `balance`, `rank` (same axis, different direction). `--before`/`--after` not applicable (snapshot, not time-series).

**JSON:** S2 shape array. Each element: `{ rank, address, balance, decimals, balance_major, share_pct }`.

### `token transfers <id|address|symbol>`

**Endpoint:** `GET /v1/contracts/{addr}/events?event_name=Transfer&order_by=block_timestamp,desc&limit=N`

**Supported types:** TRC-20. TRX → `UsageError` "Network-wide TRX transfer history is not available on TronGrid. For per-account TRX transfers, use `account txs`. Support depends on a future product decision." TRC-10 / TRC-721 / TRC-1155 → "not yet supported" hint.

**Response parsing:** Event `result.from` / `result.to` are EVM hex addresses → convert to Base58 via the new hex-to-Base58 utility. `result.value` → raw balance string. Decimals from `fetchBatchTrc20Info`.

**Renderer:** `renderUncenteredTransferList` — `from` and `to` as peers, no direction column.

**Global flags:**
- `--before` / `--after` → `max_block_timestamp` / `min_block_timestamp` (reuse existing `parseTimeRange`)
- `--confirmed` → `only_confirmed=true`
- `--limit` → `limit` query param

**Default sort:** timestamp desc (server-side). `--reverse` → `order_by=block_timestamp,asc`. `--sort-by` supports `timestamp`, `value` (value requires client-side re-sort).

**JSON:** Array of `{ from, to, value, decimals, value_major, transaction_id, block_timestamp }`. S2 shape for value fields.

### `token balance <token> [address]`

**Two paths based on token type:**

| Type | Endpoint | Unit shape |
|------|----------|-----------|
| TRX | `GET /v1/accounts/{addr}` → `balance` field | S1 (sun → TRX, decimals 6) |
| TRC-20 | `GET /v1/accounts/{addr}/trc20/balance?contract_address={tokenAddr}` | S2 (raw → major) |

TRC-10 / TRC-721 / TRC-1155 → "not yet supported" hint.

**Address:** Optional `[address]` with `default_address` fallback via `resolveAddress`.

**Token metadata:** From `fetchBatchTrc20Info` for TRC-20 (symbol, name, decimals). TRX uses hardcoded `{ symbol: "TRX", name: "Tronix", decimals: 6 }`.

**Human output (single-value view via `printResult`):**

```
Token     USDT (Tether USD)
Contract  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
Address   TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs
Balance   1,317,713,193.083827 USDT
```

**JSON:** Single object. TRX path: S1 shape `{ token, address, balance, balance_unit: "sun", decimals: 6, balance_trx }`. TRC-20 path: S2 shape `{ token, token_address, address, balance, decimals, balance_major }`.

### `token allowance <token> <owner> <spender>`

**Endpoint:** `POST /wallet/triggerConstantContract` with ABI call `allowance(address,address)`.

**Supported types:** TRC-20 only. TRX → `UsageError` "TRX has no allowance mechanism (allowance is a TRC-20 concept)." TRC-10 / TRC-721 / TRC-1155 → "not yet supported" hint.

**Parameter encoding:** `owner` and `spender` are TRON Base58 addresses passed to the contract call. Both are required positional arguments (no default_address fallback — the semantic roles are distinct and cannot be inferred).

**Token metadata:** From `fetchBatchTrc20Info` (symbol, name, decimals).

**Human output (single-value view):**

```
Token      USDT (Tether USD)
Contract   TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
Owner      TKHu...QgFs
Spender    TDqS...d197
Allowance  1,000,000.0 USDT
```

**JSON:** S2 shape single object `{ token, token_address, owner, spender, allowance, decimals, allowance_major }`.

## Spec references (authoritative)

- [`docs/design/commands.md`](./commands.md) Part II — `token` section; token identifier auto-detection; global flags
- [`docs/design/units.md`](./units.md) — S1 (TRX) + S2 (TRC-20) unit shapes
- [`docs/design/mcp-skills-review.md`](../research/mcp-skills.md) §4 — Q2 (approvals), Q4 (token identifier)
- [`docs/designs/phase-d.md`](./phase-d.md) — three-layer output architecture, column primitives, centered transfer list
- [`docs/architecture.md`](../architecture.md) — one-prod-dep constraint, defaults & conventions
- [`AGENTS.md`](../../AGENTS.md) — contribution rules, JSON unit-shape contract
- Memory `feedback_human_render_alignment` — column alignment rules
- Memory `feedback_transfer_list_two_styles` — centered vs uncentered transfer lists
- Memory `feedback_commit_rhythm` — atomic 3-commits-per-command rhythm
- Memory `feedback_open_source_privacy` — no insider references in commits/tests
- Memory `project_tron_eco_positioning` — the positioning question this phase generates evidence for

## File map

### E-prep (plumbing)

| File | Change | Item |
|------|--------|------|
| `src/utils/token-identifier.ts` | Rename `kind` → `type`; widen union to include `trx` / `trc721` / `trc1155`; `TRX` symbol special-case; 0x hex still rejected (acceptance deferred — see out of scope) | P1 |
| All consumers of `TokenIdentifier.kind` (`src/commands/token/view.ts`, tests) | Mechanical rename `kind` → `type` | P1 |
| `src/utils/address.ts` | Add `hexToBase58(evmHex: string): string` + `base58Encode` + SHA256 checksum helpers using `node:crypto` | P2 |
| `tests/utils/address.test.ts` | +5 cases: known USDT holder hex→Base58 round-trip, 0x-prefixed, 41-prefixed, invalid hex, edge cases | P2 |
| **`src/api/token-info.ts`** | **new** — `fetchBatchTrc20Info(client, addresses)` wrapping `GET /v1/trc20/info?contract_list=...` | P3 |
| `tests/api/token-info.test.ts` | **new** — batch fetch, single address, empty response, >20 chunking, failure fallback | P3 |
| `src/commands/account/tokens.ts` | Use `fetchBatchTrc20Info` for TRC-20 metadata; add `symbol?` + `name?` to `TokenBalance`; renderer: symbol primary, `[?]` marker, suppress redundant raw | P4 |
| `tests/commands/account-tokens.test.ts` | Update snapshots; +3 cases: symbol display, `[?]` marker, redundant raw suppression | P4 |
| `src/output/transfers.ts` | Add `UncenteredTransferRow` interface + `renderUncenteredTransferList` function | P5 |
| `tests/output/transfers.test.ts` | +3 cases: uncentered list snapshot, empty state, single row | P5 |

### E-main (commands)

| File | Change | Task |
|------|--------|------|
| **`src/commands/token/holders.ts`** | **new** — `HolderRow`, `fetchTokenHolders`, `registerTokenHoldersCommand`, share % BigInt calc | M1 |
| `tests/commands/token-holders.test.ts` | **new** — ~10 cases: fetch + parse, sort, reverse, share %, TRX rejection, TRC-10 rejection, empty, JSON fields | M1 |
| **`src/commands/token/transfers.ts`** | **new** — `TokenTransferRow`, `fetchTokenTransfers`, hex→Base58 parse, `registerTokenTransfersCommand` | M2 |
| `tests/commands/token-transfers.test.ts` | **new** — ~10 cases: event parse, hex conversion, --before/--after, --confirmed, sort, TRX rejection, empty, JSON | M2 |
| **`src/commands/token/balance.ts`** | **new** — TRX path + TRC-20 path, `fetchTokenBalance`, `registerTokenBalanceCommand` | M3 |
| `tests/commands/token-balance.test.ts` | **new** — ~10 cases: TRX balance, TRC-20 balance, default_address fallback, symbol lookup, TRC-10 rejection, JSON S1 vs S2 | M3 |
| **`src/commands/token/allowance.ts`** | **new** — ABI encoding for `allowance(address,address)`, `fetchTokenAllowance`, `registerTokenAllowanceCommand` | M4 |
| `tests/commands/token-allowance.test.ts` | **new** — ~8 cases: allowance call, decode result, TRX rejection, TRC-10 rejection, JSON shape, zero allowance | M4 |
| `src/commands/token/view.ts` | Update `registerTokenCommands` to wire all four new subcommands; update error messages ("Wave 1" → "not yet supported" standardized) | M5 |
| `src/index.ts` | No change needed — token parent already registered; new commands wire through `registerTokenCommands` | — |
| `docs/roadmap.md` | Phase E items all `- [x]`; heading marked ✅ | M6 |
| `docs/plans/handoff.md` | Update state table, decision ledger, test count | M6 |

## Task outline

### E-prep (5 commits)

- **P1** — `refactor: rename TokenIdentifier.kind to type and widen union`
  Rename + add `trx` / `trc721` / `trc1155` variants. Mechanical consumer sweep. 0x hex input remains rejected (acceptance deferred to out-of-scope item); the hex-to-Base58 utility (P2) is for parsing event results, not CLI input.

- **P2** — `feat: add hexToBase58 address conversion utility`
  `src/utils/address.ts` gains `hexToBase58`. Uses `node:crypto` for SHA256. Tests verify known address round-trips.

- **P3** — `feat: add batch TRC-20 token info client`
  `src/api/token-info.ts` + tests. Pure utility — no command changes yet.

- **P4** — `refactor: account tokens uses batch token info, symbol primary display`
  Closes Phase C trial #1, #6, #7. `fetchAccountTokens` calls `fetchBatchTrc20Info`. Renderer updated. Snapshot tests refreshed.

- **P5** — `feat: add renderUncenteredTransferList to transfers.ts`
  The second renderer variant. Tests with synthetic rows.

- **P1+P2 ordering note:** P1 (identifier rename) and P2 (hex conversion) are independent and can land in either order. P3 (batch info) is independent of both. P4 (account tokens fix) depends on P3. P5 (uncentered renderer) is independent.

### E-main (5 commits, following 1-commit-per-command rhythm)

Phase E commands are simpler than Phase D's (single-endpoint, no parallel fan-out, no two-section renderers), so the 3-commit-per-command rhythm collapses to 1 commit per command (scaffold + endpoint + register in one step). If any command proves complex enough during implementation, it can be split.

- **M1** — `feat: add token holders command`
- **M2** — `feat: add token transfers command`
- **M3** — `feat: add token balance command`
- **M4** — `feat: add token allowance command`
- **M5** — `refactor: wire new commands + standardize token error messages`
  Update `registerTokenCommands` to wire M1–M4. Standardize "Wave 1" references to "not yet supported" language.
- **M6** — `docs: update roadmap and handoff for Phase E close`

## Exit criteria

- [ ] All commits landed on `feat/phase-e-token-family`
- [ ] `bun test` green (expected ~340 passing; +60 over Phase D baseline of 280)
- [ ] `bun run lint` + `bun run build` clean
- [ ] `trongrid token holders USDT` shows top holders with share percentages
- [ ] `trongrid token transfers USDT --before 2026-04-01` shows filtered transfer list
- [ ] `trongrid token balance USDT` (no address) uses default_address
- [ ] `trongrid token balance TRX <addr>` returns S1 shape TRX balance
- [ ] `trongrid token allowance USDT <owner> <spender> --json` returns S2 shape
- [ ] `trongrid token holders TRX` exits with code 2 and positioning-aware hint
- [ ] `trongrid token holders 1002000` exits with code 2 and "not yet supported" hint
- [ ] `trongrid account tokens <addr>` shows resolved symbols as primary identifier
- [ ] `trongrid account tokens` lookup-failure entries show `[?]` marker
- [ ] Human-mode output on all new commands vertically aligns per `feedback_human_render_alignment`
- [ ] No new production dependencies (still 1 — `commander`)
- [ ] PR opened: "Phase E: token family polish"
- [ ] PR review completed, merged to `main`

## PR body template

```
## Summary

Phase E: token family polish — 4 new token commands + 3 account-tokens UX fixes.

**New commands:**
- `token holders <id|address|symbol>` — top holders with share %
  (TRC-20 via /v1/contracts/{addr}/tokens)
- `token transfers <id|address|symbol>` — transfer history via contract events
  (TRC-20 via /v1/contracts/{addr}/events?event_name=Transfer)
- `token balance <token> [address]` — single-token balance check
  (TRX via /v1/accounts/{addr}, TRC-20 via /v1/accounts/{addr}/trc20/balance)
- `token allowance <token> <owner> <spender>` — approval lookup
  (TRC-20 via triggerConstantContract)

**Plumbing:**
- Batch TRC-20 token info via /v1/trc20/info (replaces per-token RPC calls)
- Hex-to-Base58 address conversion for event log parsing
- TokenIdentifier.kind → type rename + TRX/TRC-721/TRC-1155 union variants
- Uncentered transfer list renderer (from/to as peers, no direction column)

**account tokens UX fixes (Phase C trial #1, #6, #7):**
- Symbol as primary identifier (batch resolved)
- [?] marker + "(decimals unresolved)" on lookup failure
- Suppress redundant "(raw N)" when major equals raw

**Token type support:** TRX + TRC-20. TRC-10/721/1155 → "not yet supported"
hint. TRX holders/transfers → positioning-decision-aware deferral message.

## Test plan

- [x] bun test (~340 passing, +60 over Phase D baseline)
- [x] bun run lint + build
- [x] manual: token holders USDT (top holders, share %)
- [x] manual: token transfers USDT --before/--after range
- [x] manual: token balance TRX <addr> (S1 shape) + USDT (S2 shape)
- [x] manual: token balance USDT (no addr, default_address fallback)
- [x] manual: token allowance USDT <owner> <spender> --json
- [x] manual: token holders TRX → exit 2 with positioning hint
- [x] manual: token holders 1002000 → exit 2 with "not yet supported"
- [x] manual: account tokens — symbol display, [?] marker, no redundant raw
- [x] manual: column alignment spot-check per feedback_human_render_alignment
```

## Out of scope (tracked for later phases)

- `token holders TRX` / `token transfers TRX` — deferred to positioning decision (roadmap Phase L or earlier if positioning resolves)
- TRC-10 / TRC-721 / TRC-1155 support for holders / transfers / balance / allowance — roadmap TBD
- `--cursor` / fingerprint pagination — `--before` / `--after` covers the 95% need
- Multi-address `token balance` — future `--addresses` flag or separate `token compare` command
- 0x hex address input acceptance — enabled by P2 hex conversion, but full rollout deferred (needs testing across all commands)
- Write-side anything — Phase H
