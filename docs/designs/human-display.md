<!-- lifecycle: living -->
# Human Display Conventions

Rules for human-mode output. `--json` mode is unaffected — JSON fields keep raw values (machine contract per `AGENTS.md` §4).

> Extracted from [`research/cli-best-practices.md`](../research/cli-best-practices.md) §7 — that file retains the Google CLI article analysis and scorecard; this file is the living design authority for display rules.

---

## Numbers — thousands separators

All balance / amount / quantity values in human mode use US-convention thousands separators: comma for thousands, period for decimal.

| Raw | Human |
|-----|-------|
| `16809182.347903` | `16,809,182.347903` |
| `42` | `42` |
| `-1234567.89` | `-1,234,567.89` |

Utility: `addThousandsSep()` in `src/output/columns.ts`. Applied at the renderer layer, not in `formatMajor()` (which is shared with JSON).

## Addresses — truncation minimums

Truncated address display must show at least **first 6 + last 6** characters to prevent address spoofing attacks (attacker creates addresses matching visible prefix/suffix).

| Form | Example | Use case |
|------|---------|----------|
| Full (34 chars) | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | Single-value views, few-column tables |
| Truncated (6+6) | `TR7NHq...gjLj6t` | List columns with space constraints |
| TX hash (4+4 OK) | `abc1...cdef` | TX hashes are not spoofable |

Utility: `truncateAddress()` in `src/output/columns.ts`, default (6, 6).

## Timestamps

UTC always. Format: `YYYY-MM-DD HH:MM:SS UTC` (detail views) or `YYYY-MM-DD HH:MM` (list columns, when UTC is in the column header). No local time (cross-machine reproducibility). Utility: `formatTimestamp()` in `src/output/format.ts`.

## Empty / missing values

Human mode: display `–` (en-dash, U+2013) or `-` (hyphen) for absent values. Never leave a column cell visually empty — it breaks alignment scanning and is ambiguous (empty string vs missing data). Render the placeholder with `muted()` color.

JSON mode: use `null` or omit the field per the unit shape contract. Never use `"-"` strings in JSON.

## Column headers for list commands

All list commands must have a header row by default. The header is rendered with `muted()` color, data rows are plain. Omit headers only when the layout is self-evident (e.g., single-column output).

See also:
- [`tx-list-display.md`](./tx-list-display.md) — transaction list column design (conditional columns, subject-address muting, Type/Method mapping)
- [`units.md`](./units.md) — JSON output unit shape contract (the machine-side counterpart to this doc's human-side rules)
