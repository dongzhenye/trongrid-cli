<!-- lifecycle: draft -->
# Transfer List Display Design

Human-mode rendering and query capabilities for transfer lists across all commands.

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

---

## Column Order

```
TX | Time (UTC) | From → To | Amount | [Value]
```

- All base columns always present.
- **Value** column: planned, dependent on price feed source decision (see §Value Column below).

## Column Definitions

### TX

Truncated transaction hash, 4+4 chars.

### Time (UTC)

`YYYY-MM-DD HH:MM` format. UTC label in column header.

### From → To

Two address columns separated by `→`. Subject-address muting: the queried address is rendered with `muted()` color, counterparty in default color.

| Command | Subject address | Typical pattern |
|---------|----------------|-----------------|
| `account transfers <addr>` | `<addr>` | Subject appears as From (out) or To (in) |
| `token transfers <token>` | none | No muting — both addresses are peers |
| `contract transfers <addr>` | `<addr>` | Subject (contract) usually in To |

### Amount

Token amount in major units (S2 shape) + token symbol as unit. Right-aligned number, unit appended: `1,000.0 USDT`.

No separate Token column — the symbol in Amount is sufficient. For unknown tokens, show truncated contract address as unit: `1,000.0 TXyz...4321`.

**Large number handling (deferred):** uint256.max scam amounts render as 80+ char strings. Fix tracked in roadmap.

### Value (planned)

USD-denominated estimated value. Conditional column — only shown when price feed is available.

- Dependent on price feed source decision (roadmap Phase L)
- When available: `$1,000.00` for priced tokens, `-` (muted) for unpriced
- When unavailable: entire column hidden

---

## Sorting

**Default:** `timestamp` desc (newest first).

**Supported fields:** `timestamp`, `amount`, `block_number`.

**Mechanism:** `--sort-by <field>` + `--reverse` (existing framework via `applySort`).

---

## Filtering

Transfer lists support a rich set of filters. Each filter is a flag that narrows the result set. Multiple filters combine with AND logic.

### Supported now

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--before <ts\|date>` | Only items before this timestamp | Server-side (`max_timestamp` param) |
| `--after <ts\|date>` | Only items after this timestamp | Server-side (`min_timestamp` param) |
| `--confirmed` | Only confirmed (irreversible) transfers | Server-side (`only_confirmed` param) |
| `--limit <N>` | Max items returned | Server-side (`limit` param) |

### Planned — address & direction

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--from <address>` | Filter by sender address | Client-side filter on `from` field |
| `--to <address>` | Filter by recipient address | Client-side filter on `to` field |
| `--direction in\|out` | Filter by direction relative to subject address | Client-side: `in` = subject in `to`, `out` = subject in `from`. Only meaningful when a subject address exists (`account transfers`, `contract transfers`). `UsageError` on `token transfers` (no subject). |

### Planned — token

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--token <symbol\|id\|address>` | Filter by token identifier | Client-side filter on `token_address` / `token_symbol`. Uses existing `detectTokenIdentifier` for input parsing. Primarily useful for `account transfers` (which returns all tokens); redundant for `token transfers` (already scoped to one token). |

### Planned — amount range

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--min-amount <N>` | Minimum amount (major units, inclusive) | Client-side BigInt comparison on raw `amount` |
| `--max-amount <N>` | Maximum amount (major units, inclusive) | Client-side BigInt comparison on raw `amount` |

Single-bound ranges are natural: `--min-amount 1000` means "at least 1000". Double-bound: `--min-amount 100 --max-amount 1000`.

### Planned — block height

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--min-block <N>` | Minimum block number (inclusive) | Client-side filter on `block_number` |
| `--max-block <N>` | Maximum block number (inclusive) | Client-side filter on `block_number` |

### Planned — value range (dependent on price feed)

| Flag | Description | Implementation |
|------|-------------|----------------|
| `--min-value <USD>` | Minimum USD value (inclusive) | Client-side, requires price feed |
| `--max-value <USD>` | Maximum USD value (inclusive) | Client-side, requires price feed |

### Filter interaction with `--limit`

`--limit` applies to the API fetch, BEFORE client-side filters. This means:
- `--limit 20 --from TXyz...` fetches 20 transfers, then filters — may return < 20 results
- For now this is acceptable. Future: over-fetch and re-page if needed.

---

## Field Projection

### Current: `--fields` (inclusive, JSON only)

`--fields a,b,c` selects specific fields from JSON output. Unlisted fields are omitted. This is the **replacement** model — you specify exactly what you want.

```bash
trongrid account transfers TR... --json --fields from,to,amount_major
```

Human mode: `--fields` is currently a no-op for list commands (tracked as deferred).

### Convention analysis

| Tool | Approach | Syntax |
|------|----------|--------|
| `gh` | Inclusive replacement | `--json field1,field2` |
| `kubectl` | Inclusive replacement | `-o custom-columns=NAME:.metadata.name` |
| `jq` | Inclusive selection | `.data[] \| {from, to}` |
| `gcloud` | Format string | `--format='table(name, status)'` |
| AWS CLI | JMESPath query | `--query 'Reservations[].Instances[].InstanceId'` |

**Industry consensus:** inclusive replacement is the dominant pattern. No major CLI uses a two-flag include/exclude model.

### Design decision

Keep `--fields` as inclusive replacement (current behavior). No `--hide` or `--exclude` flag.

**Rationale:**
- Agents (primary `--fields` users) always know which fields they need — inclusive is natural
- Exclusive ("hide this one field") is rare enough that `--json | jq 'del(.field)'` covers it
- Two flags (`--fields` + `--hide`) create ambiguity when both are specified

### Hidden fields

Some fields exist in JSON but are not shown in human-mode default columns (e.g., `block_number`, `token_address`). `--fields` in JSON mode already exposes them. For human mode, enabling `--fields` to control column visibility is deferred (requires renderer changes across all list commands — not transfer-specific).

---

## Migration from Centered/Uncentered

### What changes

| Aspect | Before (centered) | After |
|--------|-------------------|-------|
| Token column | Separate column | Removed — unit in Amount suffices |
| Direction column | `in` / `out` | Removed — direction is implicit from muted address position; filterable via `--direction` |
| Counterparty column | Single column | Split to From + To |
| Arrow | `←` / `→` (direction-dependent) | Always `→` (from → to) |
| Header row | Missing | Added |
| Thousands separators | Missing | Added |
| Subject muting | Not implemented | Muted color on queried address |

### What stays the same

- API endpoint and fetch logic unchanged
- JSON output fields unchanged (new fields additive)
- Sort config framework unchanged
- `--before`/`--after`, `--confirmed`, `--limit`, `--reverse`, `--sort-by` all unchanged

### Implementation notes

- `CenteredTransferRow` interface retired → unified `TransferRow` with `from`, `to`, `token_symbol`, `token_address`
- `UncenteredTransferRow` already close to target shape
- Single `renderTransferList(rows, subjectAddress?)` replaces both renderers
- `account transfers` fetch populates `from`/`to` directly (currently computes `direction`/`counterparty`)

---

## Preview

**`account transfers TKHuVq...QgFs`:**

```
Found 5 transfers:

  TX           Time (UTC)        From                To                      Amount
  4070...5f82  2026-04-16 08:45  TKHuVq...QgFs    →  TWd4WN...5jwb      1,000.0 USDT
  bdf8...d93b  2026-04-16 08:44  TPnbhM...x9zC4   →  TKHuVq...QgFs        500.0 USDT
  7f3e...1f07  2026-04-16 08:30  TKHuVq...QgFs    →  TDqSmK...d197     10,000.0 WTRX
  31c7...8463  2026-04-16 08:15  TEmvon...uFZV1A   →  TKHuVq...QgFs    250,000.0 JST
  e8fe...cd77  2026-04-16 07:45  TKHuVq...QgFs    →  TKzxdS...Mg2Ax        50.0 USDT
```

Subject `TKHuVq...QgFs` muted wherever it appears. Amount right-aligned, unit follows.

**`token transfers USDT`:**

```
Found 3 transfers:

  TX           Time (UTC)        From                To                      Amount
  a0bf...5298  2026-04-16 08:44  TEG23N...ABqCp6  →  TMSUPh...GmhXkd   50,000.0 USDT
  db60...ca96  2026-04-16 08:44  TEmvon...uFZV1A  →  TRNwAg...mtMGqq    3,100.0 USDT
  d4bd...ee68  2026-04-16 08:44  TJjnhd...p1zPt9  →  TDtu6j...Hphc11    1,117.0 USDT
```

No muting — `token transfers` has no subject address.

**`account transfers TKHuVq...QgFs --direction out`:**

```
Found 3 transfers:

  TX           Time (UTC)        From                To                      Amount
  4070...5f82  2026-04-16 08:45  TKHuVq...QgFs    →  TWd4WN...5jwb      1,000.0 USDT
  7f3e...1f07  2026-04-16 08:30  TKHuVq...QgFs    →  TDqSmK...d197     10,000.0 WTRX
  e8fe...cd77  2026-04-16 07:45  TKHuVq...QgFs    →  TKzxdS...Mg2Ax        50.0 USDT
```

Direction filter applied client-side. Only outgoing transfers shown.

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

P0 is the display unification. P1 are the most-requested filters. P2/P3 are nice-to-haves.

---

## References

- Global display conventions: [`human-display.md`](./human-display.md)
- Transaction list design (sibling): [`tx-list-display.md`](./tx-list-display.md)
- ANSI-aware alignment: `visibleLength()` in `src/output/columns.ts`
- Transfer row types: `src/output/transfers.ts`
- Centered → uncentered decision: memory `feedback_transfer_list_two_styles`
