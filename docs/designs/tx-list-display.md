<!-- lifecycle: living -->
# Transaction List Display Design

Component-specific display rules for `account txs` and `contract txs`.

> **Parent conventions:** [`human-display.md`](./human-display.md) governs shared rules (null display, number formatting, address truncation, alignment, sorting framework, filtering principles, field projection). This doc only defines transaction-list-specific decisions.

---

## Column Order

```
TX | Time (UTC) ↓ | [Confirmed] | Type/Method | From → To | Amount | Fee | [Result]
```

Brackets denote conditional columns — see §Status Columns below. `↓` indicates default sort direction (per [`human-display.md` §6.1](./human-display.md#61-default-sort)).

## Column Definitions

### TX

Truncated transaction hash, 4+4 chars.

### Time (UTC)

`YYYY-MM-DD HH:MM` — UTC label in header, not per row.

### Confirmed (conditional)

Only shown when at least one transaction in the batch is unconfirmed.

| State | Symbol | Color |
|-------|--------|-------|
| Unconfirmed | `⌛` (U+231B) | default |
| Confirmed | `✓` | `pass` |

### Type/Method

Merged column. Mapping rules (human mode only — JSON keeps raw `contract_type`):

| Chain type | Has call data | Display | Case |
|------------|--------------|---------|------|
| TriggerSmartContract | Method name from ABI | `transfer`, `approve`, ... | lowercase |
| TriggerSmartContract | Unknown, has data | `0xa9059cbb` (4-byte selector) | — |
| TriggerSmartContract | No data | `Contract Call` | title case |
| TransferContract | — | `Transfer` | title case |
| TransferAssetContract | — | `TRC-10 Send` | title case |
| FreezeBalanceV2Contract | — | `Freeze` | title case |
| UnfreezeBalanceV2Contract | — | `Unfreeze` | title case |
| DelegateResourceContract | — | `Delegate` | title case |
| UnDelegateResourceContract | — | `Undelegate` | title case |
| VoteWitnessContract | — | `Vote` | title case |
| WithdrawBalanceContract | — | `Claim Reward` | title case |
| AccountCreateContract | — | `Activate` | title case |
| Other | — | Strip `Contract` suffix | title case |

ABI-resolved names are lowercase; chain types are title case — visually distinguishable.

Configurable: `src/output/tx-type-map.ts`.

### From → To

Two address columns separated by `→`. Subject-address muting per [`human-display.md` §8.4](./human-display.md#84-design-decisions).

| Command | Subject address |
|---------|----------------|
| `account txs <addr>` | `<addr>` — muted wherever it appears |
| `contract txs <addr>` | `<addr>` — contract usually in To |

### Amount

Native TRX value (`call_value` or `amount`). S1 unit shape. For TriggerSmartContract, typically `0 TRX` (token amounts are in events). Formatting per [`human-display.md` §2.2](./human-display.md#22-formatting-by-field-type) (TRX amount type). Extreme values per §2.3.

### Fee

Transaction fee in TRX. Same formatting as Amount.

### Result (conditional)

Only shown when at least one transaction has a non-success result.

| State | Symbol | Color |
|-------|--------|-------|
| Success | `✓` | `pass` |
| Failed | `✗` | `fail` |

## Status Column Logic

Both Confirmed and Result are **batch-adaptive**:

| Batch state | Extra columns |
|-------------|---------------|
| All confirmed + all success | None |
| Has unconfirmed | + Confirmed (after Time) |
| Has failed | + Result (at end) |
| Both | + Confirmed + Result |

---

## Fields

| Field | JSON key | Default column | Sortable | Filterable |
|-------|----------|---------------|----------|------------|
| TX hash | `tx_id` | ✓ | — | — |
| Timestamp | `timestamp` | ✓ | ✓ (**default**, desc) | ✓ `--before`/`--after` |
| Type/Method | `type_display` | ✓ | — | ✓ `--method` (contract txs only) |
| Method selector | `method_selector` | hidden | — | ✓ `--method` (by 4-byte hex) |
| From | `from` | ✓ | — | ✓ `--from` (planned) |
| To | `to` | ✓ | — | ✓ `--to` (planned) |
| Amount | `amount` / `amount_trx` | ✓ | ✓ (desc) | ✓ `--min-amount`/`--max-amount` (planned) |
| Fee | `fee` / `fee_trx` | ✓ | ✓ (desc) | — |
| Block number | `block_number` | hidden | ✓ (desc) | ✓ `--min-block`/`--max-block` (planned) |
| Direction | `direction` | hidden | ✓ (planned) | ✓ `--direction in\|out` (planned) |
| Status | `status` | conditional | — | — |
| Confirmed | `confirmed` | conditional | — | — |
| Contract type | `contract_type` | hidden | — | — |
| Method name | `method` | hidden | — | — |

Hidden fields follow [`human-display.md` §8.3](./human-display.md#83-hidden-fields) — fully sortable/filterable/projectable, just not in default human columns.

---

## Sorting

**Default:** `timestamp` desc.

Client-side sort warning applies per [`human-display.md` §6.3](./human-display.md#63-client-side-sort-warning) when `--sort-by` overrides the default on a paginated result.

---

## Filtering

### Implemented

| Filter | Flag | Server/Client |
|--------|------|---------------|
| Time range | `--before`/`--after` | Server (API params) |
| Confirmation | `--confirmed` | Server (API param) |
| Method (contract txs) | `--method <name\|selector>` | Client (ABI lookup + data matching) |

### Planned

| Filter | Flag | Server/Client |
|--------|------|---------------|
| Sender | `--from <address>` | Client |
| Recipient | `--to <address>` | Client |
| Direction | `--direction in\|out` | Client (requires subject address) |
| Amount range | `--min-amount`/`--max-amount` | Client |
| Block range | `--min-block`/`--max-block` | Client |

Filter interaction with `--limit` per [`human-display.md` §7.4](./human-display.md#74-filter-interaction-with---limit).

---

## Renderer

`renderTxs(items, subjectAddress?)` — shared by `account txs` and `contract txs`. Both pass their queried address for muting.

---

## JSON Output

All fields present regardless of human-mode column visibility:

```json
{
  "tx_id": "...",
  "block_number": 12345,
  "timestamp": 1776315840000,
  "contract_type": "TriggerSmartContract",
  "type_display": "transfer",
  "method": "transfer",
  "method_selector": "0xa9059cbb",
  "from": "TKHuVq...",
  "to": "TR7NHq...",
  "amount": 0,
  "amount_unit": "sun",
  "decimals": 6,
  "amount_trx": "0",
  "fee": 345000,
  "fee_unit": "sun",
  "fee_trx": "0.345",
  "status": "SUCCESS",
  "confirmed": true
}
```

---

## References

- Parent conventions: [`human-display.md`](./human-display.md)
- Type mapping source: `src/output/tx-type-map.ts`
- Renderer: `src/commands/account/txs.ts`
- Column primitives: `src/output/columns.ts`
