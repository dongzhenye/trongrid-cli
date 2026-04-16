# Transaction List Display Design

Human-mode rendering rules for `account txs` and `contract txs`. JSON output is unaffected — this doc governs the human-readable table layout only.

## Column Order

```
TX | Time (UTC) | [Confirmed] | Type/Method | From → To | Amount | [Fee] | [Result]
```

Brackets denote conditional columns — see §Status Columns below.

## Column Definitions

### TX (always)

Truncated transaction hash, 4+4 chars. First column — serves as row identifier.

### Time (UTC) (always)

Formatted timestamp. UTC label is in the column header, not repeated per value.

Format: `YYYY-MM-DD HH:MM` (no seconds, no "UTC" suffix per row).

Future: configurable local time display. Default remains UTC.

### Confirmed (conditional)

Only shown when at least one transaction in the batch is unconfirmed.

| State | Symbol | Color |
|-------|--------|-------|
| Unconfirmed | `⌛` (U+231B) | default |
| Confirmed | `✓` | green (`pass`) |

### Type/Method (always)

Merged column for transaction type and smart contract method.

**Mapping rules (human mode only — JSON keeps raw `contract_type`):**

| Chain type | Has call data | Display | Case |
|------------|--------------|---------|------|
| TriggerSmartContract | Method name resolved from ABI | `transfer`, `approve`, ... | lowercase |
| TriggerSmartContract | Method unknown, has data | `0xa9059cbb` (4-byte selector) | — |
| TriggerSmartContract | No data | `Contract Call` | title case |
| TransferContract | — | `Transfer` | title case |
| TransferAssetContract | — | `Token Transfer` | title case |
| FreezeBalanceV2Contract | — | `Freeze` | title case |
| UnfreezeBalanceV2Contract | — | `Unfreeze` | title case |
| DelegateResourceContract | — | `Delegate` | title case |
| UndelegateResourceContract | — | `Undelegate` | title case |
| VoteWitnessContract | — | `Vote` | title case |
| AccountCreateContract | — | `Activate` | title case |
| Other | — | Strip `Contract` suffix | title case |

**Visual distinction:** ABI-resolved method names are lowercase (`transfer`), chain type names are title case (`Transfer`). Two sources are distinguishable at a glance.

**Method resolution for `contract txs`:** When `--method` filter is used, ABI is already fetched. For unfiltered listing, method resolution requires an additional `getcontract` call — this is opt-in via the merged Type/Method column.

**Configurable mapping:** The type mapping table is maintained as a static map in source code (`src/output/tx-type-map.ts`). New chain types can be added without touching rendering logic.

### From → To (always)

Two address columns separated by `→`. Both always shown.

**Muting rule:** If a "subject address" is known (the address being queried), any occurrence of that address in From or To is rendered with `muted()` color. The other address (counterparty) renders in default color. When no subject address is known, both render normally.

- `account txs TKHu...`: `TKHu...` is the subject, muted wherever it appears
- `contract txs TR7N...`: `TR7N...` is the subject, muted wherever it appears
- Both From and To can be muted (e.g., Freeze to self)

No parentheses — muting is achieved purely through color.

### Amount (always)

TRX value transferred with the transaction (`call_value` for TriggerSmartContract, `amount` for TransferContract). S1 unit shape (sun → TRX). Right-aligned with thousands separators.

Note: for TRC-20 operations (transfer, approve), this is typically `0 TRX` because token amounts live in event logs, not in the transaction value field. This is correct and expected — the Amount column shows the native TRX value.

### Fee (conditional)

Transaction fee in TRX. Right-aligned with thousands separators.

**Priority:** Amount column takes precedence. If terminal width is constrained, Fee column is omitted before Amount. Implementation: always render Fee for now; terminal-width-aware omission is a future enhancement.

### Result (conditional)

Only shown when at least one transaction in the batch has a non-success result (`contractRet !== "SUCCESS"`).

| State | Symbol | Color |
|-------|--------|-------|
| Success | `✓` | green (`pass`) |
| Failed | `✗` | red (`fail`) |

## Status Column Logic

Both Confirmed and Result columns are **batch-adaptive**: they only appear when the batch contains at least one non-default-state entry. This keeps the common case (all confirmed + all success) clean and compact.

```
Batch state               → Columns shown
All confirmed, all success → TX, Time, Type/Method, From→To, Amount, Fee
Has unconfirmed            → + Confirmed (after Time)
Has failed                 → + Result (at end)
Both                       → + Confirmed + Result
```

## Renderer Reuse

`renderTxs` accepts an optional `subjectAddress` parameter for muting. Both `account txs` and `contract txs` pass their queried address. The renderer is shared — no separate contract-specific renderer needed.

## JSON Output

JSON output is unaffected by this design. All fields are present regardless of human-mode column visibility:

```json
{
  "tx_id": "...",
  "block_number": 12345,
  "timestamp": 1776315840000,
  "contract_type": "TriggerSmartContract",
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

## References

- Column alignment rules: `src/output/columns.ts`, memory `feedback_human_render_alignment`
- Centered vs uncentered transfer lists: memory `feedback_transfer_list_two_styles`
- Terminology glossary: `docs/designs/glossary.md`
- Human display conventions: [`docs/designs/human-display.md`](./human-display.md)
