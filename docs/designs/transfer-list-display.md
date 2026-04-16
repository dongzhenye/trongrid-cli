<!-- lifecycle: draft -->
# Transfer List Display Design

Human-mode rendering rules for transfer lists across all commands. JSON output is unaffected.

> See [`human-display.md`](./human-display.md) for global conventions (truncation, thousands separators, empty values, column headers).
> See [`tx-list-display.md`](./tx-list-display.md) for the sibling transaction list design (same from/to + muting pattern).

---

## Scope

| Command | Current renderer | Current style |
|---------|-----------------|---------------|
| `account transfers` | `renderCenteredTransferList` | direction + counterparty (centered) |
| `token transfers` | `renderUncenteredTransferList` | from → to (uncentered, has headers) |
| `contract transfers` | mirror of account transfers | inherits centered |

**Goal:** Unify all transfer list renderers to a single from/to pattern with subject-address muting — the same principle applied to transaction lists in `tx-list-display.md`. The centered (direction + counterparty) pattern is retired.

## Column Order

```
TX | Time (UTC) | Token | From → To | Amount
```

All columns always present. No conditional columns (transfers don't have confirmed/result status at the transfer level — those belong to the parent transaction).

## Column Definitions

### TX

Truncated transaction hash, 4+4 chars.

### Time (UTC)

`YYYY-MM-DD HH:MM` format. UTC label in column header.

### Token

Token symbol when available (e.g., `USDT`, `WTRX`), truncated contract address otherwise. For `account transfers` (which shows transfers across all tokens), this column distinguishes which token moved. For `token transfers` (filtered to one token), it's uniform but still shown for consistency.

### From → To

Two address columns separated by `→`. Subject-address muting: the queried address is rendered with `muted()` color, counterparty in default color.

| Command | Subject address | Typical pattern |
|---------|----------------|-----------------|
| `account transfers <addr>` | `<addr>` | Subject appears as From (out) or To (in) |
| `token transfers <token>` | none | No muting — both addresses are peers |
| `contract transfers <addr>` | `<addr>` | Subject (contract) usually in To |

### Amount

Token amount in major units (S2 shape: `balance_major`). Right-aligned with thousands separators. Unit (token symbol) appended after the number, similar to `"5.889752 TRX"` pattern in tx list.

**Large number handling (deferred):** uint256.max scam amounts render as 80+ char strings. Fix tracked in `docs/roadmap.md` Phase F deferred items.

## Migration from Centered/Uncentered

### What changes

| Aspect | Before (centered) | After |
|--------|-------------------|-------|
| Direction column | `in` / `out` | Removed — direction is implicit from muted address position |
| Counterparty column | Single column | Split to From + To |
| Arrow | `←` / `→` (direction-dependent) | Always `→` (from → to) |
| Header row | Missing | Added |
| Thousands separators | Missing | Added |
| Subject muting | Not implemented | Muted color on queried address |

### What stays the same

- API endpoint and fetch logic unchanged
- JSON output unchanged (same fields)
- Sort config unchanged (timestamp desc default)
- `--before`/`--after`, `--confirmed`, `--limit`, `--reverse`, `--sort-by` all unchanged

### Implementation notes

- `CenteredTransferRow` interface can be retired or aliased to a unified `TransferRow`
- `UncenteredTransferRow` interface already has `from` + `to` — close to target shape
- Single `renderTransferList(rows, subjectAddress?)` replaces both renderers
- `account transfers` fetch computes `from`/`to` from raw API (currently computes `direction`/`counterparty` instead)

## Preview

**`account transfers TKHuVq...QgFs`:**

```
Found 5 transfers:

  TX           Time (UTC)        Token  From                To                    Amount
  4070...5f82  2026-04-16 08:45  USDT   TKHuVq...QgFs    →  TWd4WN...5jwb    1,000.0 USDT
  bdf8...d93b  2026-04-16 08:44  USDT   TPnbhM...x9zC4   →  TKHuVq...QgFs      500.0 USDT
  7f3e...1f07  2026-04-16 08:30  WTRX   TKHuVq...QgFs    →  TDqSmK...d197   10,000.0 WTRX
  31c7...8463  2026-04-16 08:15  JST    TEmvon...uFZV1A   →  TKHuVq...QgFs  250,000.0 JST
  e8fe...cd77  2026-04-16 07:45  USDT   TKHuVq...QgFs    →  TKzxdS...Mg2Ax      50.0 USDT
```

Subject `TKHuVq...QgFs` muted wherever it appears. Amount right-aligned, unit follows.

**`token transfers USDT`:**

```
Found 5 transfers:

  TX           Time (UTC)        Token  From                To                    Amount
  a0bf...5298  2026-04-16 08:44  USDT   TEG23N...ABqCp6  →  TMSUPh...GmhXkd  50,000.0 USDT
  db60...ca96  2026-04-16 08:44  USDT   TEmvon...uFZV1A  →  TRNwAg...mtMGqq   3,100.0 USDT
  d4bd...ee68  2026-04-16 08:44  USDT   TJjnhd...p1zPt9  →  TDtu6j...Hphc11   1,117.0 USDT
```

No muting — `token transfers` has no subject address.

## References

- Global display conventions: [`human-display.md`](./human-display.md)
- Transaction list design (sibling): [`tx-list-display.md`](./tx-list-display.md)
- ANSI-aware alignment: `visibleLength()` in `src/output/columns.ts`
- Transfer row types: `src/output/transfers.ts`
- Centered → uncentered decision: memory `feedback_transfer_list_two_styles`
