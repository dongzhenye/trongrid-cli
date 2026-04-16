<!-- lifecycle: living -->
# Human Display Conventions

Cross-cutting rules for human-mode output. `--json` mode is unaffected — JSON fields keep raw values (machine contract per `AGENTS.md` §4).

> Extracted from [`research/cli-best-practices.md`](../research/cli-best-practices.md) §7. Component-specific display rules live in their own design docs:
> - [`tx-list-display.md`](./tx-list-display.md) — transaction list
> - [`transfer-list-display.md`](./transfer-list-display.md) — transfer list

---

## 1. Null / Empty Values

Human mode: display `-` (hyphen) for absent values, rendered with `muted()` color. Never leave a column cell visually empty — it breaks alignment scanning and is ambiguous (empty string vs missing data).

JSON mode: use `null` or omit the field per the unit shape contract. Never use `"-"` strings in JSON.

---

## 2. Number Formatting

### 2.1 General: thousands separators

All numeric values in human mode use US-convention thousands separators: comma for thousands, period for decimal.

| Raw | Human |
|-----|-------|
| `16809182.347903` | `16,809,182.347903` |
| `42` | `42` |
| `-1234567.89` | `-1,234,567.89` |

Utility: `addThousandsSep()` in `src/output/columns.ts`. Applied at the renderer layer, not in `formatMajor()` (which is shared with JSON).

### 2.2 Formatting by field type

Different field types have different precision and display rules. The table below maps field type to its formatting characteristics:

| Field type | Precision | Trailing zeros | Rounding | Unit | Example |
|------------|-----------|---------------|----------|------|---------|
| **Token amount** (TRC-20/10) | Full — show all significant digits | No padding, no trimming | None — exact value | Symbol appended: `1,000.0 USDT` | `38927318000.083827 USDT` |
| **TRX amount** (native) | 6 decimals max (sun precision) | No trailing zeros | None — exact value | `TRX` appended | `5.889752 TRX` |
| **USD value** | 2 decimal places, always | Yes — `$1,000.00` | Floor (conservative) | `$` prefix | `$1,000.00` |
| **Percentage** | 2 decimal places | Yes — `15.25%` | Standard rounding | `%` suffix | `15.25%` |
| **Count / integer** | 0 decimals | N/A | N/A | Context-dependent | `1,234` |
| **Fee** (TRX) | Same as TRX amount | Same as TRX | Same as TRX | `TRX` appended | `0.345 TRX` |

**Key principles:**

- **Token amounts are exact, never abbreviated.** Tokens have varying decimals (0–18). After applying `formatMajor`, show all significant digits. Use string arithmetic (not float) to avoid precision loss. The raw balance is a string in JSON for this reason.
- **USD values are financial.** Two decimals, floor-rounded (showing $999.99 instead of $1,000.00 is safer than the reverse), `$` prefix, thousands separator. Follows financial industry convention.
- **Unit placement:** numeric value right-aligned for decimal stacking, unit left-aligned adjacent (1-space gap). In combined columns (`1,000.0 USDT`), the number is right-aligned and unit follows.

### 2.3 Extreme values

Values near or at storage limits (e.g., `2^256 - 1 = uint256.max`) need special handling:

| Context | Value | Display | Rationale |
|---------|-------|---------|-----------|
| Token allowance | `== uint256.max` | `Unlimited` | Convention: max approval = infinite allowance |
| Token allowance | `> 10^30` (abnormally large) | Scientific notation: `1.15e+59 USDT` | Readability |
| Transfer amount | `== uint256.max` | `⚠ 1.15e+59 USDT` + warning | Likely scam/phishing token |
| Transfer amount | `> 10^15` (abnormally large) | Scientific notation | Readability; above this threshold, exact digits are not actionable |
| Any amount | Normal range | Full precision per §2.2 | Default |

**Scientific notation format:** `{significand}e+{exponent}` with 2 significant digits in the significand. Example: `115792089237...` → `1.15e+59`.

**JSON mode:** unaffected. Raw string values always present regardless of human display treatment.

**Warning for suspicious values:** When a transfer amount equals `uint256.max` or is astronomically large in a non-allowance context, prepend `⚠` (U+26A0) in human mode. This alerts users to potential scam/phishing tokens without hiding the data.

---

## 3. Addresses

### 3.1 Truncation minimums

| Form | Example | Use case |
|------|---------|----------|
| Full (34 chars) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | Single-value views, few-column tables |
| Truncated (6+6) | `TR7NHq...gjLj6t` | List columns with space constraints |
| TX hash (4+4 OK) | `abc1...cdef` | TX hashes are not spoofable |

Minimum 6+6 for addresses to prevent spoofing attacks. TX hashes can use shorter truncation.

Utility: `truncateAddress()` in `src/output/columns.ts`, default (6, 6).

### 3.2 Address format

Always Base58Check (TRON native format, starting with `T`). API responses returning hex addresses (41-prefixed) must be converted via `hexToBase58()` before display.

---

## 4. Timestamps

UTC always. Two formats depending on context:

| Context | Format | Example |
|---------|--------|---------|
| Detail views | `YYYY-MM-DD HH:MM:SS UTC` | `2026-04-16 12:34:56 UTC` |
| List columns | `YYYY-MM-DD HH:MM` | `2026-04-16 12:34` |

List columns put `(UTC)` in the column header to avoid repeating per row.

Future: configurable local time display. Default remains UTC.

Utility: `formatTimestamp()` in `src/output/format.ts`.

---

## 5. Column Headers & Alignment

### 5.1 Headers required

All list commands must have a header row. Header rendered with `muted()` color, data rows plain. Omit headers only when the layout is self-evident (e.g., single-column output).

### 5.2 Alignment rules by column type

| Column type | Alignment | Rationale |
|-------------|-----------|-----------|
| **Text** (type, status, labels) | Left | Natural reading direction |
| **Address** | Left | `T` prefix vertically aligned; in monospace fonts, character positions are visually comparable |
| **TX hash** | Left | Same as address |
| **Numeric** (amount, fee, count) | Right | Decimal points stack vertically; magnitude readable at a glance |
| **Timestamp** | Left | Fixed-width format already self-aligns |
| **Symbol/unit** | Left, adjacent to number | 1-space gap from right-aligned number |
| **Arrow** (`→`) | Center (single char) | Visual separator between From and To |

### 5.3 Inter-column separator

2 spaces (distinguishes from in-column 1-space gaps). Per memory `feedback_human_render_alignment`.

### 5.4 ANSI-aware width

All width computation uses `visibleLength()` (strips ANSI escape codes) so that color codes (e.g., from `muted()`) don't inflate column widths. Utility in `src/output/columns.ts`.

---

## 6. Sorting

### 6.1 Default sort

Every list command has a **default sort** — the order most users expect without any flags. The default is chosen at design time per command and documented in its help text.

**Sort direction indicator:** The current sort field's column header shows `↓` (desc) or `↑` (asc) to make the active sort visible:

```
  TX           Time (UTC) ↓     Type/Method  From                To                Amount
  4070...5f82  2026-04-16 08:45  Transfer    ...
```

### 6.2 Custom sort

`--sort-by <field>` switches the sort field. `--reverse` / `-r` flips direction. Each field has an inherent default direction (e.g., timestamp desc, amount desc, name asc).

**Principle:** support all fields users reasonably want to sort by. If the API doesn't support server-side sorting on a field, implement client-side. Don't remove CLI sort options because the API lacks them — track API capability gaps separately.

### 6.3 Client-side sort warning

When sorting is performed client-side on a paginated result (i.e., the CLI fetched `--limit N` items and re-sorted), the sorted result is NOT globally sorted — it's sorted within the fetched page only. The smallest value in the result is not necessarily the global smallest.

**Mandatory warning** (both human and JSON modes):

Human mode:
```
⚠ Sorted by amount within fetched page (20 items). Results may not reflect global ordering.
```

JSON mode — add to response envelope:
```json
{
  "warning": "Sorted by amount within fetched page (20 items). Results may not reflect global ordering.",
  "data": [...]
}
```

This warning fires when ALL of these conditions are true:
1. `--sort-by` overrides the default sort field
2. The sort is performed client-side (not by the API)
3. The result set is limited (`--limit` applied)

### 6.4 Multi-field sort (future)

Single-field only for now. Multi-field sort (`--sort-by timestamp,amount`) is a future enhancement for high-demand list commands. Deferred until clear user need emerges.

---

## 7. Filtering

### 7.1 General principles

- Multiple filters combine with AND logic
- Each filter is a separate flag (not a query language)
- Filters that the API supports natively use server-side params; others filter client-side
- Client-side filtering on paginated results has the same page-only caveat as client-side sorting (§6.3)

### 7.2 Time range filters

`--before <ts|date>` and `--after <ts|date>` accept either unix-seconds timestamps or ISO-8601 date strings.

**API capability limits:** Some endpoints have maximum time range restrictions. When known, enforce them with `UsageError` and a clear message, rather than silently returning incomplete results. Document per-endpoint limits in the command's help text.

### 7.3 Numeric range filters

Pattern: `--min-<field> <N>` / `--max-<field> <N>` for range filtering. Single-bound is natural (`--min-amount 1000` = "at least 1000"). Double-bound for interval: `--min-amount 100 --max-amount 1000`.

### 7.4 Filter interaction with `--limit`

`--limit` applies at the API fetch level, before client-side filters. This means `--limit 20 --from TXyz...` fetches 20 items then filters — may return fewer than 20 results. This is acceptable for now; over-fetch + re-page is a future enhancement.

---

## 8. Field Projection

### 8.1 `--fields` — inclusive replacement

`--fields a,b,c` selects specific fields. Unlisted fields are omitted. This is the **replacement** model — you specify exactly what you want.

```bash
trongrid account transfers TR... --json --fields from,to,amount_major
```

### 8.2 Convention reference

| Tool | Model | Syntax |
|------|-------|--------|
| SQL | Inclusive (SELECT) | `SELECT col1, col2 FROM ...` |
| `gh` | Inclusive replacement | `--json field1,field2` |
| `kubectl` | Inclusive replacement | `-o custom-columns=NAME:.metadata.name` |
| `jq` | Inclusive selection | `.data[] \| {from, to}` |
| `gcloud` | Format string | `--format='table(name, status)'` |
| AWS CLI | JMESPath query | `--query 'Reservations[].Instances[].InstanceId'` |

**Industry consensus:** inclusive replacement is the dominant pattern. No major CLI uses a two-flag include/exclude model. SQL's `SELECT` is the original inclusive model.

### 8.3 Hidden fields

Some fields exist in JSON but are not in the human-mode default columns (e.g., `block_number`, `token_address`, `direction`). "Hidden" means **not in the default human column set** — nothing else is restricted:

| Capability | Hidden fields | Default fields |
|------------|--------------|----------------|
| JSON output | Always included | Always included |
| `--fields` projection | Selectable | Selectable |
| `--sort-by` | Sortable | Sortable |
| Filters (`--direction`, etc.) | Filterable | Filterable |
| Human default display | **Not shown** | Shown |

In other words, hidden fields participate fully in sorting, filtering, and field projection — they are only absent from the default human column layout. Making them displayable in human mode via `--fields` is deferred (requires renderer changes across all list commands).

### 8.4 Design decisions

- **No `--hide`/`--exclude` flag.** Exclusive selection (`--hide field1`) is rare enough that `--json | jq 'del(.field)'` covers it. Two flags create ambiguity.
- **Direction as a virtual field.** `direction` (`in`/`out`) is computable from subject address + from/to. Not a default human column (from/to + muting conveys direction visually), but fully participates in sorting (`--sort-by direction`), filtering (`--direction in|out`), and field projection (`--fields direction`).

---

## References

- Source: [`research/cli-best-practices.md`](../research/cli-best-practices.md) — Google CLI article analysis
- Sibling design docs: [`tx-list-display.md`](./tx-list-display.md), [`transfer-list-display.md`](./transfer-list-display.md)
- Unit shape contract: [`units.md`](./units.md)
- Column primitives: `src/output/columns.ts`
- Color tokens: `src/output/colors.ts`
