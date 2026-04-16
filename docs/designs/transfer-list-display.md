<!-- lifecycle: draft -->
# Transfer List Display Design

Component-specific display rules for `account transfers`, `token transfers`, `contract transfers`.

> **Parent conventions:** [`human-display.md`](./human-display.md) governs shared rules (null display, number formatting, extreme values, address truncation, alignment, sorting framework, filtering principles, field projection). This doc only defines transfer-list-specific decisions.

---

## Scope

| Command | Current renderer | Target |
|---------|-----------------|--------|
| `account transfers` | `renderCenteredTransferList` (direction + counterparty) | Unified from/to + muting |
| `token transfers` | `renderUncenteredTransferList` (from → to) | Unified from/to (no muting) |
| `contract transfers` | mirror of account transfers | Unified from/to + muting |

**Goal:** Retire the centered (direction + counterparty) pattern. Single `renderTransferList(rows, subjectAddress?)` for all transfer commands.

---

## Column Order

```
TX | Time (UTC) ↓ | From → To | Amount
```

`↓` indicates default sort (timestamp desc). All columns always present. No conditional columns — transfers don't have confirmed/result status at the transfer level.

**Planned:** `Value` column (USD estimate) — conditional, dependent on price feed source (Phase L). See [`human-display.md` §2.2](./human-display.md#22-formatting-by-field-type) for USD formatting rules.

## Column Definitions

### TX

Truncated transaction hash, 4+4 chars.

### Time (UTC)

`YYYY-MM-DD HH:MM` — UTC label in header.

### From → To

Subject-address muting per [`human-display.md` §8.4](./human-display.md#84-design-decisions).

| Command | Subject address |
|---------|----------------|
| `account transfers <addr>` | `<addr>` — muted wherever it appears |
| `token transfers <token>` | none — no muting |
| `contract transfers <addr>` | `<addr>` — contract usually in To |

### Amount

Token amount in major units + symbol: `1,000.0 USDT`. No separate Token column — the unit in Amount suffices. For unknown tokens, truncated contract address as unit: `1,000.0 TXyz...4321`.

Formatting per [`human-display.md` §2.2](./human-display.md#22-formatting-by-field-type) (token amount type). Extreme values (uint256.max scam tokens) per [`human-display.md` §2.3](./human-display.md#23-extreme-values).

---

## Fields

| Field | JSON key | Default column | Sortable | Filterable |
|-------|----------|---------------|----------|------------|
| TX hash | `tx_id` | ✓ | — | — |
| Timestamp | `block_timestamp` | ✓ | ✓ (**default**, desc) | ✓ `--before`/`--after` |
| From | `from` | ✓ | — | ✓ `--from` (planned) |
| To | `to` | ✓ | — | ✓ `--to` (planned) |
| Amount | `value` / `value_major` | ✓ | ✓ (desc) | ✓ `--min-amount`/`--max-amount` (planned) |
| Token symbol | `token_symbol` | hidden (in Amount unit) | — | ✓ `--token` (planned) |
| Token address | `token_address` | hidden | — | ✓ `--token` (planned) |
| Block number | `block_number` | hidden | ✓ (desc) | ✓ `--min-block`/`--max-block` (planned) |
| Direction | `direction` | hidden | ✓ (planned) | ✓ `--direction in\|out` (planned) |
| Decimals | `decimals` | hidden | — | — |
| Value (USD) | `value_usd` | planned | ✓ (planned) | ✓ `--min-value`/`--max-value` (planned) |

Hidden fields per [`human-display.md` §8.3](./human-display.md#83-hidden-fields).

---

## Sorting

**Default:** `block_timestamp` desc.

Client-side sort warning per [`human-display.md` §6.3](./human-display.md#63-client-side-sort-warning).

---

## Filtering

### Implemented

| Filter | Flag | Server/Client |
|--------|------|---------------|
| Time range | `--before`/`--after` | Server (`min_timestamp`/`max_timestamp`) |
| Confirmation | `--confirmed` | Server (`only_confirmed`) |
| Limit | `--limit <N>` | Server (`limit`) |

### Planned

| Filter | Flag | Server/Client | Notes |
|--------|------|---------------|-------|
| Sender | `--from <address>` | Client | |
| Recipient | `--to <address>` | Client | |
| Direction | `--direction in\|out` | Client | Requires subject address; `UsageError` on `token transfers` |
| Token | `--token <symbol\|id\|addr>` | Client | Uses `detectTokenIdentifier`; mainly for `account transfers` |
| Amount range | `--min-amount`/`--max-amount` | Client | Major units, BigInt comparison |
| Block range | `--min-block`/`--max-block` | Client | |
| Value range | `--min-value`/`--max-value` | Client | Depends on price feed (Phase L) |

Filter interaction with `--limit` per [`human-display.md` §7.4](./human-display.md#74-filter-interaction-with---limit).

---

## Migration from Centered/Uncentered

| Aspect | Before (centered) | After |
|--------|-------------------|-------|
| Token column | Separate | Removed — unit in Amount |
| Direction column | `in` / `out` | Removed — muting conveys direction; `--direction` for filtering |
| Counterparty | Single column | Split to From + To |
| Arrow | `←` / `→` (direction-dependent) | Always `→` |
| Header row | Missing | Added |
| Thousands separators | Missing | Added |
| Subject muting | Not implemented | `muted()` color on queried address |

**What stays:** API endpoints, JSON fields (additive only), `--before`/`--after`/`--confirmed`/`--limit`/`--reverse`/`--sort-by`.

**Implementation:** `CenteredTransferRow` retired → unified `TransferRow` with `from`, `to`, `token_symbol`, `token_address`. Single `renderTransferList(rows, subjectAddress?)`.

---

## Preview

**`account transfers TKHuVq...QgFs`:**

```
Found 5 transfers:

  TX           Time (UTC) ↓      From                To                      Amount
  4070...5f82  2026-04-16 08:45  TKHuVq...QgFs    →  TWd4WN...5jwb      1,000.0 USDT
  bdf8...d93b  2026-04-16 08:44  TPnbhM...x9zC4   →  TKHuVq...QgFs        500.0 USDT
  7f3e...1f07  2026-04-16 08:30  TKHuVq...QgFs    →  TDqSmK...d197     10,000.0 WTRX
  31c7...8463  2026-04-16 08:15  TEmvon...uFZV1A   →  TKHuVq...QgFs    250,000.0 JST
  e8fe...cd77  2026-04-16 07:45  TKHuVq...QgFs    →  TKzxdS...Mg2Ax        50.0 USDT
```

**`token transfers USDT`:**

```
Found 3 transfers:

  TX           Time (UTC) ↓      From                To                      Amount
  a0bf...5298  2026-04-16 08:44  TEG23N...ABqCp6  →  TMSUPh...GmhXkd   50,000.0 USDT
  db60...ca96  2026-04-16 08:44  TEmvon...uFZV1A  →  TRNwAg...mtMGqq    3,100.0 USDT
  d4bd...ee68  2026-04-16 08:44  TJjnhd...p1zPt9  →  TDtu6j...Hphc11    1,117.0 USDT
```

**`account transfers TKHuVq...QgFs --direction out`:**

```
Found 3 transfers:

  TX           Time (UTC) ↓      From                To                      Amount
  4070...5f82  2026-04-16 08:45  TKHuVq...QgFs    →  TWd4WN...5jwb      1,000.0 USDT
  7f3e...1f07  2026-04-16 08:30  TKHuVq...QgFs    →  TDqSmK...d197     10,000.0 WTRX
  e8fe...cd77  2026-04-16 07:45  TKHuVq...QgFs    →  TKzxdS...Mg2Ax        50.0 USDT
```

---

## Implementation Priority

| Priority | Item | Depends on |
|----------|------|------------|
| **P0** | Unified renderer + column redesign | — |
| **P1** | `--direction`, `--from`, `--to` filters | P0 |
| **P1** | `--token` filter (for `account transfers`) | P0 |
| **P2** | `--min-amount`, `--max-amount` | P0 |
| **P2** | `--min-block`, `--max-block` | P0 |
| **P3** | Value column + `--min-value`, `--max-value` | Price feed (Phase L) |
| **P3** | `--fields` human-mode support | Cross-cutting (all list commands) |

---

## References

- Parent conventions: [`human-display.md`](./human-display.md)
- Sibling: [`tx-list-display.md`](./tx-list-display.md)
- Transfer row types: `src/output/transfers.ts`
- Column primitives: `src/output/columns.ts`
