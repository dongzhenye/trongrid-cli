# Phase G — First npm publish (v0.1.0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Two user-confirmation gates** in this plan: (a) after npm name availability check (Task 5 step 2) and (b) before `npm publish` (Task 7 step 1). Stop and confirm — do not auto-proceed.

**Goal:** Ship `trongrid@0.1.0` to npm registry with the read-side CLI surface from Phases A–F (31 commands), two pre-publish bug fixes (`applySort` numeric sort + transfer-list extreme values), README, and parity matrix.

**Architecture:** Two TDD bug fixes first (low risk, isolated changes). Then docs (README rewrite + parity matrix). Then publish workflow with explicit user-confirmation gates at hard-to-reverse decisions (npm name, the publish itself).

**Tech Stack:** TypeScript, bun:test, npm, gh CLI

**Spec:** [`docs/designs/phase-g-first-publish.md`](../designs/phase-g-first-publish.md)

---

## File Map

| File | Action | Task |
|------|--------|------|
| `src/utils/sort.ts` | Add `fieldTypes` to `SortConfig`; type-aware comparison | 1 |
| `tests/utils/sort.test.ts` | Numeric sort regression test | 1 |
| `src/commands/account/transfers.ts` | Add `fieldTypes` declarations | 1 |
| `src/commands/token/transfers.ts` | Add `fieldTypes` declarations | 1 |
| `src/commands/account/txs.ts` | Add `fieldTypes` declarations | 1 |
| `src/commands/token/holders.ts` | Add `fieldTypes`; remove obsolete bug-workaround comment | 1 |
| `src/commands/account/delegations.ts` | Add `fieldTypes` | 1 |
| `src/api/internal-txs.ts` | Add `fieldTypes` | 1 |
| `src/output/format.ts` | Add `formatExtremeIfNeeded` + `toScientific` helpers | 2 |
| `src/output/transfers.ts` | Wire `formatExtremeIfNeeded` into `renderTransferList` | 2 |
| `tests/output/format.test.ts` (new) | Unit tests for the new helpers | 2 |
| `tests/output/transfers.test.ts` | Add extreme-value rendering test | 2 |
| `README.md` | Full rewrite | 3 |
| `docs/designs/competitor-parity.md` (new) | Live parity matrix | 4 |
| `package.json` | Add description/keywords/repo/homepage/files/etc. | 5 |
| `LICENSE` (verify exists, create if missing) | MIT license text | 5 |
| `docs/handoff.md` | Mark Phase G complete; update active phase | 8 |

---

## Task 1: Fix `applySort` numeric sort

**Files:**
- Modify: `src/utils/sort.ts`
- Modify: `tests/utils/sort.test.ts`
- Modify: 6 sort-config files (see file map)

**Goal:** Fields like `value` (raw token amount string) currently sort lexicographically, so `"100"` sorts BEFORE `"99"`. Add a `fieldTypes` map to `SortConfig`; comparator parses values per declared type before comparing.

- [ ] **Step 1: Read existing sort tests**

Run: `cat tests/utils/sort.test.ts`

If the file doesn't exist or has minimal coverage, that's expected — proceed to add new tests.

- [ ] **Step 2: Write failing test for numeric sort**

In `tests/utils/sort.test.ts`, add (or create the file with) this test block. Don't remove existing tests if any.

```typescript
import { describe, expect, it } from "bun:test";
import { applySort, type SortConfig } from "../../src/utils/sort.js";

interface Row {
	id: string;
	value: string;        // raw integer string (variable length)
	count: number;        // safe-integer
	rank: number;         // safe-integer
}

describe("applySort with fieldTypes", () => {
	const items: Row[] = [
		{ id: "a", value: "1000", count: 5, rank: 2 },
		{ id: "b", value: "99",   count: 1, rank: 1 },
		{ id: "c", value: "100",  count: 3, rank: 3 },
	];

	it("bigint sort orders unequal-width numeric strings correctly", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			fieldTypes: { value: "bigint" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["a", "c", "b"]); // 1000 > 100 > 99
	});

	it("number sort orders integers correctly", () => {
		const config: SortConfig<Row> = {
			defaultField: "count",
			fieldDirections: { count: "desc" },
			fieldTypes: { count: "number" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["a", "c", "b"]); // 5, 3, 1
	});

	it("string sort (default) gives lexicographic order — preserved for backward compat", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			// fieldTypes omitted — defaults to string
		};
		const out = applySort(items, config, {});
		// Lex order desc: "99" > "1000" > "100"
		expect(out.map((r) => r.id)).toEqual(["b", "a", "c"]);
	});

	it("bigint sort handles asc direction", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "asc" },
			fieldTypes: { value: "bigint" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["b", "c", "a"]); // 99, 100, 1000
	});

	it("bigint sort falls back to string compare when value is not a valid integer", () => {
		const dirty: Row[] = [
			{ id: "a", value: "not_a_number", count: 0, rank: 0 },
			{ id: "b", value: "100", count: 0, rank: 0 },
		];
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			fieldTypes: { value: "bigint" },
		};
		// Should not throw; fallback to lex compare
		expect(() => applySort(dirty, config, {})).not.toThrow();
	});
});
```

- [ ] **Step 3: Run tests — expect failures**

Run: `bun test tests/utils/sort.test.ts`

Expected: tests fail because `fieldTypes` isn't in `SortConfig` yet, and `compareField` does string comparison.

- [ ] **Step 4: Update `src/utils/sort.ts`**

Replace the entire file content:

```typescript
import { UsageError } from "../output/format.js";

export type SortDirection = "asc" | "desc";
export type FieldType = "string" | "number" | "bigint";

export interface SortConfig<T> {
	/** Field name used when no --sort-by override is given. */
	defaultField: keyof T & string;
	/** Map of field → inherent default direction. */
	fieldDirections: Readonly<Record<string, SortDirection>>;
	/**
	 * Per-field comparison type. Missing entries default to "string"
	 * (lexicographic compare). Use "number" for safe-integer fields
	 * (block_number, timestamp, count). Use "bigint" for arbitrary-
	 * precision fields stored as integer strings (token amounts that
	 * may exceed 2^53). For decimal strings (e.g. "1.5"), bigint parse
	 * fails and the comparator falls back to string compare.
	 */
	fieldTypes?: Readonly<Partial<Record<keyof T & string, FieldType>>>;
	/**
	 * Optional secondary sort field applied when the primary comparator
	 * returns 0. Uses its own inherent direction from `fieldDirections`.
	 * Ignored if it equals the active primary field (would be a no-op).
	 */
	tieBreakField?: keyof T & string;
}

export interface SortOptions {
	/** From global flag. Overrides the command's default field. */
	sortBy?: string;
	/** From global flag. Flips the current direction. */
	reverse?: boolean;
}

/**
 * Client-side sort for fetched list results.
 *
 * Per Q3 resolution in docs/designs/mcp-skills-review.md: each list command
 * declares its default field + per-field inherent directions. --sort-by
 * switches field (using the new field's inherent direction). --reverse
 * flips whatever direction would otherwise apply.
 *
 * Does not mutate `items`. Throws if --sort-by names a field that has no
 * declared direction (prevents silent typo bugs).
 */
export function applySort<T>(items: T[], config: SortConfig<T>, opts: SortOptions): T[] {
	if (items.length === 0) return items;

	const field = (opts.sortBy ?? config.defaultField) as keyof T & string;
	const fieldDir = config.fieldDirections[field];
	if (!fieldDir) {
		const known = Object.keys(config.fieldDirections).join(", ");
		throw new UsageError(
			`Unknown sort field: "${field}". Valid fields for this command: ${known}.`,
		);
	}
	const direction: SortDirection = opts.reverse ? (fieldDir === "asc" ? "desc" : "asc") : fieldDir;
	const fieldType: FieldType = config.fieldTypes?.[field] ?? "string";

	const sorted = [...items].sort((a, b) => {
		const primaryCmp = compareField(a, b, field, direction, fieldType);
		if (primaryCmp !== 0) return primaryCmp;

		const tbField = config.tieBreakField;
		if (!tbField || tbField === field) return 0;
		const tbDir = config.fieldDirections[tbField];
		if (!tbDir) return 0;
		const tbType: FieldType = config.fieldTypes?.[tbField] ?? "string";
		return compareField(a, b, tbField, tbDir, tbType);
	});
	return sorted;
}

function compareField<T>(
	a: T,
	b: T,
	field: keyof T & string,
	direction: SortDirection,
	fieldType: FieldType,
): number {
	const av = a[field];
	const bv = b[field];
	if (av === bv) return 0;
	if (av === undefined || av === null) return 1;
	if (bv === undefined || bv === null) return -1;

	let cmp: number;
	if (fieldType === "number") {
		const an = Number(av);
		const bn = Number(bv);
		cmp = an < bn ? -1 : an > bn ? 1 : 0;
	} else if (fieldType === "bigint") {
		try {
			const ab = BigInt(av as string);
			const bb = BigInt(bv as string);
			cmp = ab < bb ? -1 : ab > bb ? 1 : 0;
		} catch {
			// Value isn't a valid integer string (e.g. has a decimal point or
			// non-digit chars). Fall back to string compare so behavior is
			// well-defined rather than throwing inside .sort().
			cmp = av < bv ? -1 : 1;
		}
	} else {
		cmp = av < bv ? -1 : 1;
	}
	return direction === "asc" ? cmp : -cmp;
}
```

- [ ] **Step 5: Run sort tests — expect pass**

Run: `bun test tests/utils/sort.test.ts`

Expected: all 5 new tests pass.

- [ ] **Step 6: Add `fieldTypes` to all sort configs**

Edit each of the following files. Just add a `fieldTypes:` entry to the existing `SortConfig`. Don't change other parts.

**`src/commands/account/transfers.ts`** (`TRANSFERS_SORT_CONFIG`):

```typescript
const TRANSFERS_SORT_CONFIG: SortConfig<TransferRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		block_number: "desc",
		value: "desc",
	},
	fieldTypes: {
		block_timestamp: "number",
		block_number: "number",
		value: "bigint",
	},
	tieBreakField: "block_timestamp",
};
```

**`src/commands/token/transfers.ts`** (`TOKEN_TRANSFERS_SORT_CONFIG`):

```typescript
const TOKEN_TRANSFERS_SORT_CONFIG: SortConfig<TransferRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		block_number: "desc",
		value: "desc",
	},
	fieldTypes: {
		block_timestamp: "number",
		block_number: "number",
		value: "bigint",
	},
	tieBreakField: "block_timestamp",
};
```

**`src/commands/account/txs.ts`** (`TXS_SORT_CONFIG`):

```typescript
const TXS_SORT_CONFIG: SortConfig<AccountTxRow> = {
	defaultField: "timestamp",
	fieldDirections: {
		timestamp: "desc",
		block_number: "desc",
		fee: "desc",
		amount: "desc",
	},
	fieldTypes: {
		timestamp: "number",
		block_number: "number",
		fee: "number",
		amount: "number",
	},
	tieBreakField: "timestamp",
};
```

**`src/commands/token/holders.ts`** (`HOLDERS_SORT_CONFIG`): Replace the entire config + the obsolete comment:

```typescript
const HOLDERS_SORT_CONFIG: SortConfig<HolderRow> = {
	defaultField: "rank",
	fieldDirections: {
		rank: "asc",
		balance: "desc",
	},
	fieldTypes: {
		rank: "number",
		balance: "bigint",
	},
	tieBreakField: "rank",
};
```

**`src/commands/account/delegations.ts`** (`DELEGATIONS_SORT_CONFIG`):

```typescript
const DELEGATIONS_SORT_CONFIG: SortConfig<DelegationRow> = {
	defaultField: "amount",
	fieldDirections: {
		amount: "desc",
		expire_time: "asc",
	},
	fieldTypes: {
		amount: "bigint",
		expire_time: "number",
	},
	tieBreakField: "expire_time",
};
```

**`src/commands/contract/events.ts`** (`EVENTS_SORT_CONFIG`):

```typescript
const EVENTS_SORT_CONFIG: SortConfig<ContractEventRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		event_name: "asc",
	},
	fieldTypes: {
		block_timestamp: "number",
		// event_name omitted — defaults to "string" (intended)
	},
	tieBreakField: "block_timestamp",
};
```

**`src/api/internal-txs.ts`** (`INTERNAL_TXS_SORT_CONFIG`):

```typescript
const INTERNAL_TXS_SORT_CONFIG: SortConfig<InternalTxRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		value: "desc",
		call_type: "asc",
	},
	fieldTypes: {
		block_timestamp: "number",
		value: "bigint",
		// call_type omitted — defaults to "string" (intended)
	},
	tieBreakField: "block_timestamp",
};
```

- [ ] **Step 7: Update obsolete comment in tests/commands/account-transfers.test.ts**

Find this test and remove the now-incorrect disclaimer comment:

```typescript
it("--sort-by value sorts by value desc (largest first)", () => {
	const out = sortTransfers(items, { sortBy: "value" });
	// "300" > "200" > "100" as strings (equal length), but comparison is
	// string-based via compareField. For equal widths this matches numeric.
	expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
});
```

Replace the comment block (lines starting with `// "300" > "200"`) with:

```typescript
	// True numeric (bigint) compare via SortConfig.fieldTypes.
```

- [ ] **Step 8: Run full test suite**

Run: `bun test`

Expected: all tests pass (including the new 5 + existing tests). Test count goes from 449 → 454.

- [ ] **Step 9: Commit**

```bash
git add src/utils/sort.ts tests/utils/sort.test.ts \
        src/commands/account/transfers.ts src/commands/token/transfers.ts \
        src/commands/account/txs.ts src/commands/token/holders.ts \
        src/commands/account/delegations.ts src/commands/contract/events.ts \
        src/api/internal-txs.ts \
        tests/commands/account-transfers.test.ts
git commit -m "fix: type-aware applySort comparator (bigint/number/string)

SortConfig gains an optional fieldTypes map. Numeric fields stored as
strings (token amounts) now compare as BigInt; safe-integer fields
compare as Number. Without the type, lexicographic compare gave wrong
order for unequal-width numeric strings ('100' < '99').

Migration: 7 sort configs across the codebase declare types where they
sort numeric fields. Configs without fieldTypes still work — missing
entries default to 'string', preserving existing behavior."
```

---

## Task 2: Handle extreme values in transfer list display

**Files:**
- Modify: `src/output/format.ts` (add helpers)
- Modify: `src/output/transfers.ts` (call new helper)
- Create: `tests/output/format.test.ts` (new test file)
- Modify: `tests/output/transfers.test.ts` (renderer integration test)

**Goal:** Scam tokens emit `Transfer` events with `value = uint256.max`. With token decimals applied, `value_major` becomes an 80+ char decimal string that breaks `renderTransferList`'s table layout. Add scientific-notation fallback for very large values, plus a `⚠ ` warning prefix when raw value equals `uint256.max`. Per `docs/designs/human-display.md` §2.3.

- [ ] **Step 1: Write failing test for `formatExtremeIfNeeded` and `toScientific`**

Create `tests/output/format.test.ts` with this content:

```typescript
import { describe, expect, it } from "bun:test";
import { formatExtremeIfNeeded } from "../../src/output/format.js";

const UINT256_MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("formatExtremeIfNeeded", () => {
	it("returns null for normal values", () => {
		expect(formatExtremeIfNeeded("1000000", "1.0")).toBeNull();
		expect(formatExtremeIfNeeded("1500530000", "1500.53")).toBeNull();
		expect(formatExtremeIfNeeded("0", "0")).toBeNull();
	});

	it("returns null at the integer-length boundary (16 digits)", () => {
		// Integer part exactly 16 digits → still considered normal
		const rawValue = "1000000000000000000000"; // doesn't matter, value_major decides
		const valueMajor = "1000000000000000.0"; // 16-digit integer part
		expect(formatExtremeIfNeeded(rawValue, valueMajor)).toBeNull();
	});

	it("returns scientific notation when integer part > 16 digits", () => {
		const valueMajor = "12345678901234567.5"; // 17-digit integer part
		const result = formatExtremeIfNeeded("doesnt_matter", valueMajor);
		expect(result).toBe("1.23e+16");
	});

	it("returns warning + scientific notation for uint256.max raw value", () => {
		// Apply 6 decimals: integer part = uint256.max[:-6]
		const valueMajor = `${UINT256_MAX.slice(0, -6)}.${UINT256_MAX.slice(-6)}`;
		// First 3 digits of UINT256_MAX are "115" → significand "1.15"
		// Integer part length: 78 - 6 = 72 → exponent 71
		const result = formatExtremeIfNeeded(UINT256_MAX, valueMajor);
		expect(result).toBe("⚠ 1.15e+71");
	});

	it("warning prefix wins even if integer part isn't extreme", () => {
		// Hypothetical: a token with 78 decimals would have
		// uint256.max as value_major "1.157920..." — small int part.
		// The raw-value match still triggers the warning.
		const result = formatExtremeIfNeeded(UINT256_MAX, "1.15");
		expect(result).toBe("⚠ 1.15e+0");
	});

	it("handles negative values gracefully (sign preserved)", () => {
		// Defensive — TRC-20 transfers don't go negative, but BalanceDelta
		// rows in future phases might.
		const result = formatExtremeIfNeeded("-9", "-12345678901234567.0");
		expect(result).toBe("-1.23e+16");
	});
});
```

- [ ] **Step 2: Run test — expect failure**

Run: `bun test tests/output/format.test.ts`

Expected: FAIL with `formatExtremeIfNeeded is not exported from format.js`.

- [ ] **Step 3: Add helpers to `src/output/format.ts`**

Read the current file first to find the right insertion point. Add these exports at the END of the file (after `formatListTimestamp`):

```typescript
const UINT256_MAX_RAW =
	"115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * Convert a decimal-string `value_major` to scientific notation with 2
 * significant digits in the significand. Returns sign-preserved form.
 *
 * Examples:
 *   toScientific("12345678901234567.5") → "1.23e+16"
 *   toScientific("1.15") → "1.15e+0"
 *   toScientific("-12345678901234567.0") → "-1.23e+16"
 *
 * Used by {@link formatExtremeIfNeeded}. Caller must have decided that
 * scientific notation is appropriate (the helper does no magnitude check).
 */
export function toScientific(valueMajor: string): string {
	const negative = valueMajor.startsWith("-");
	const abs = negative ? valueMajor.slice(1) : valueMajor;
	const dotIdx = abs.indexOf(".");
	const intPart = dotIdx >= 0 ? abs.slice(0, dotIdx) : abs;
	// Use intPart digits to derive significand. Pad if intPart < 3 chars.
	const digits = (intPart + (dotIdx >= 0 ? abs.slice(dotIdx + 1) : "")).replace(/^0+/, "") || "0";
	const exponent = intPart.replace(/^0+/, "").length - 1;
	const adjustedExponent = exponent < 0 ? 0 : exponent;
	const significand = `${digits[0]}.${(digits.slice(1, 3) || "0").padEnd(2, "0")}`;
	return `${negative ? "-" : ""}${significand}e+${adjustedExponent}`;
}

/**
 * Detect transfer-amount values that would break tabular layout (huge
 * decimal strings) or signal scam tokens (`value === uint256.max`), and
 * return a pre-formatted display string. Returns `null` when the value
 * is in the normal range — caller continues with usual formatting.
 *
 * Per docs/designs/human-display.md §2.3:
 * - integer part > 16 digits → scientific notation only
 * - raw value === 2^256 - 1 → "⚠ {scientific}" (warning prefix, U+26A0 + space)
 * - otherwise → null
 *
 * The raw-value check uses the on-chain integer string before decimal
 * conversion; this is the only reliable way to identify uint256.max
 * regardless of token decimals.
 */
export function formatExtremeIfNeeded(rawValue: string, valueMajor: string): string | null {
	const isUint256Max = rawValue === UINT256_MAX_RAW;
	const dotIdx = valueMajor.indexOf(".");
	const intPart = dotIdx >= 0 ? valueMajor.slice(0, dotIdx) : valueMajor;
	const intLen = intPart.startsWith("-") ? intPart.length - 1 : intPart.length;

	if (!isUint256Max && intLen <= 16) return null;

	const sci = toScientific(valueMajor);
	return isUint256Max ? `⚠ ${sci}` : sci;
}
```

- [ ] **Step 4: Run format tests — expect pass**

Run: `bun test tests/output/format.test.ts`

Expected: all 6 tests pass.

- [ ] **Step 5: Wire helper into `renderTransferList`**

Edit `src/output/transfers.ts`. Update the imports at the top to add `formatExtremeIfNeeded`:

```typescript
import { formatExtremeIfNeeded, formatListTimestamp } from "./format.js";
```

Then in `renderTransferList`, find the line:

```typescript
const amountStr = addThousandsSep(r.value_major);
```

Replace it with:

```typescript
// Extreme values (scam tokens, huge magnitudes) bypass thousands separator
// and render in scientific notation per docs/designs/human-display.md §2.3.
const amountStr = formatExtremeIfNeeded(r.value, r.value_major) ?? addThousandsSep(r.value_major);
```

- [ ] **Step 6: Add renderer integration test for extreme values**

Edit `tests/output/transfers.test.ts`. Inside the existing `describe("renderTransferList", ...)` block, add this test (place it after the "uses truncated token_address" test):

```typescript
	it("renders uint256.max transfers as warning + scientific notation", () => {
		const UINT256_MAX = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
		// USDT has 6 decimals → value_major has 6 decimal places
		const valueMajor = `${UINT256_MAX.slice(0, -6)}.${UINT256_MAX.slice(-6)}`;
		renderTransferList([mkTransferRow({ value: UINT256_MAX, value_major: valueMajor })]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		expect(dataRow).toContain("⚠");
		expect(dataRow).toContain("1.15e+71");
		// The 80+ char decimal must NOT appear (would break the table)
		expect(dataRow).not.toContain("115792089237316195423570985");
	});

	it("renders abnormally large (>10^16) values in scientific notation without warning", () => {
		renderTransferList([
			mkTransferRow({ value: "12345678901234567500000", value_major: "12345678901234567.5" }),
		]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		expect(dataRow).toContain("1.23e+16");
		expect(dataRow).not.toContain("⚠");
	});
```

- [ ] **Step 7: Run full test suite**

Run: `bun test`

Expected: all tests pass. Count goes from 454 → 462 (6 new format tests + 2 new renderer tests).

- [ ] **Step 8: Commit**

```bash
git add src/output/format.ts src/output/transfers.ts \
        tests/output/format.test.ts tests/output/transfers.test.ts
git commit -m "feat: scientific notation + warning prefix for extreme transfer values

Scam tokens emit Transfer events with value=uint256.max. Applied
through formatMajor with token decimals, value_major became an 80+
char decimal string that broke the transfer list table layout.

Per docs/designs/human-display.md §2.3:
- integer part > 16 digits → scientific notation
- raw value == 2^256-1 → ⚠ warning prefix + scientific notation

JSON mode unaffected — raw string values always present."
```

---

## Task 3: Write README

**Files:**
- Modify: `README.md` (full rewrite)

**Goal:** Replace the stale Phase F README with a v0.1.0-ready document. Two audiences: humans and AI agents. Per `docs/designs/phase-g-first-publish.md` §Task 3.

- [ ] **Step 1: Replace `README.md` content**

Overwrite `README.md` with:

```markdown
# trongrid

A command-line interface for [TronGrid](https://www.trongrid.io/) — query the TRON blockchain from your terminal or AI coding agent.

> **Status:** v0.1.0 — first public release. 31 read-side commands across 7 resources. Write-side and governance/stats commands coming in v0.2.0+.

## Install

```bash
npm install -g trongrid
```

Requires Node.js ≥ 22.

## Quick Start

```bash
# Manual API key (free tier ≥ 3 QPS)
trongrid auth login

# Default network is mainnet; --network shasta or --network nile for testnets
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
trongrid block latest --confirmed
```

For agent integration, see [`AGENTS.md`](./AGENTS.md).

## Examples

```bash
# Single-value lookup
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Recent transfers (column display, with thousands separators)
trongrid account transfers TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --limit 10

# Token balance (machine-readable)
trongrid token balance USDT TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --json

# Transaction details
trongrid tx view <hash>

# Latest block (irreversible / confirmed view)
trongrid block latest --confirmed
```

## For AI Agents

The `--json` flag emits structured output suitable for piping into agents. JSON shapes follow the unit-shape contract documented in [`docs/designs/units.md`](./docs/designs/units.md). For full conventions and command grammar, see [`AGENTS.md`](./AGENTS.md).

```bash
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json | jq '.balance_trx'
trongrid token balance USDT TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --json --fields balance_major,decimals
```

## Why this exists

TronGrid has a comprehensive REST API but no first-party CLI. Other TRON ecosystem tools target either humans (browsers / wallets) or specific agent surfaces (MCP servers). A CLI with `--json` is the universal interface that works with every coding agent, every OS, and every human terminal — without a separate protocol layer.

For a structured comparison with the official TronGrid MCP and TronScan MCP, see [`docs/designs/competitor-parity.md`](./docs/designs/competitor-parity.md).

## Documentation

| Doc | Content |
|-----|---------|
| [Product](./docs/product.md) | User scenarios, gap analysis, design philosophy |
| [Architecture](./docs/architecture.md) | Tech decisions with rationale |
| [Commands](./docs/designs/commands.md) | Full command reference |
| [Roadmap](./docs/roadmap.md) | Phase A–O |
| [Parity matrix](./docs/designs/competitor-parity.md) | vs TronGrid MCP + TronScan MCP |
| [AGENTS.md](./AGENTS.md) | Agent integration + contributing |

## License

MIT
```

- [ ] **Step 2: Visual sanity check**

Run: `cat README.md` and skim. Specifically verify:
- All 5 examples reference real addresses (the USDT contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` and Binance hot wallet `TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9` are well-known and stable)
- No mention of "Phase F", "17 commands", or other stale state
- All linked files exist (skip the parity matrix link — that file is created in Task 4 next)

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for v0.1.0 first public release

Remove Phase F status, update command count to 31, frame for two
audiences (humans + agents), add 5 representative usage examples,
link to AGENTS.md and the upcoming parity matrix."
```

---

## Task 4: Write parity matrix

**Files:**
- Create: `docs/designs/competitor-parity.md`

**Goal:** Live structured comparison vs TronGrid official MCP and TronScan MCP. Helps users (human + AI) decide between tools. Source data lives in `docs/research/mcp-skills.md` (already covers conventions, tool counts, naming, units, etc.).

- [ ] **Step 1: Read source data**

Run: `cat docs/research/mcp-skills.md`

Note the source counts and conventions. The parity matrix won't repeat the deep analysis — it's a navigational tool, not a research doc.

- [ ] **Step 2: Get current command list**

Run: `node dist/index.js --help` and `node dist/index.js account --help` etc. for each resource (account, block, contract, token, tx, auth, config) to enumerate commands.

You can also get the list from `src/commands/index.ts` or the file structure: `ls src/commands/account/` etc.

- [ ] **Step 3: Create `docs/designs/competitor-parity.md`**

Write this content:

```markdown
<!-- lifecycle: living -->
# Competitor Parity Matrix

> Living comparison of `trongrid-cli`, the official TronGrid MCP, and the community TronScan MCP. Updated as competitors evolve and new commands ship.

## Why this exists

Multiple tools query TRON blockchain data. This doc helps users (human + AI) pick the right one — not by ranking, but by showing what each covers. For TRON ecosystem context and tool conventions, see [`docs/research/mcp-skills.md`](../research/mcp-skills.md).

## Subjects

| Subject | Type | Surface | Auth |
|---------|------|---------|------|
| **`trongrid-cli`** (this) | npm CLI | 31 commands across 7 resources (account, block, contract, token, tx, auth, config) | Optional `TRON-PRO-API-KEY` |
| TronGrid MCP | MCP server (official) | 164 tools across 4 namespaces (TronGrid REST, FullNode Wallet, FullNode WalletSolidity, FullNode JSON-RPC) | Same |
| TronScan MCP | MCP server (community) | ~119 tools, flat namespace, 10 doc categories | Optional |

## Per-resource command coverage

Legend: ✓ supported · — not supported · ◐ supported with caveats (see notes)

### Account

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Account info / balance | `account view <addr>` | `getAccount` | `getAccountDetail` |
| Account resources (energy/bandwidth) | `account resources <addr>` | `getAccountResource` | ◐ embedded in detail |
| Token balances list | `account tokens <addr>` | ◐ via separate calls | ✓ |
| TRX/TRC-20 transactions | `account txs <addr>` | `getAccountTransactions` | ✓ |
| TRC-10/20 transfer history | `account transfers <addr>` | ◐ via TRC-20 endpoint | ✓ |
| Internal transactions | `account internals <addr>` | ◐ embedded in tx response | ✓ |
| Stake 2.0 delegations | `account delegations <addr>` | `getDelegatedResource*` | ◐ via stake API |
| Multi-sig permissions | `account permissions <addr>` | ◐ via getAccount.active_permission | — |
| Approvals (TRC-20 allowances) | — (deferred, positioning-blocked) | — | ✓ |

### Block

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Latest block | `block latest [--confirmed]` | `getNowBlock` / `getNowBlockSolidity` | `getLatestBlock` |
| Block by number or hash | `block view <num\|hash>` | `getBlockBy*` | `getBlockDetail` |

### Contract

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Contract info / ABI | `contract view <addr>` | `getContract` | `getContractDetail` |
| Methods list | `contract methods <addr>` | ◐ via ABI | ✓ |
| Event logs | `contract events <addr>` | `getContractEvents` | ✓ |
| Tx history (with `--method` filter) | `contract txs <addr>` | ◐ via account txs | ✓ |
| Internal txs | `contract internals <addr>` | ◐ embedded | ✓ |
| Mirror commands (transfers/tokens/resources/delegations) | ✓ | — (separate calls) | ◐ |
| Call (read) | — (deferred, needs ABI encoder) | `triggerConstantContract` | ✓ |
| Call (write) | — (deferred, write-side phase) | `triggerSmartContract` | — |

### Token

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Token info | `token view <id\|addr\|symbol>` | ◐ via TRC-10/20 endpoints | `getTrc20TokenDetail` |
| Top holders | `token holders <token>` | ✓ | ✓ |
| Transfer history | `token transfers <token>` | ✓ | ✓ |
| Per-account balance | `token balance <token> [addr]` | ◐ via account tokens | ◐ |
| Allowance (read) | `token allowance <token> <owner> <spender>` | ✓ via constant call | — |
| Price feed | — (deferred, needs price API) | — | ✓ |

### Transaction

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Tx detail | `tx view <hash>` | `getTransactionInfo` / `getTransactionById` | `getTransactionInfo` |
| Broadcast | — (deferred, write-side) | `broadcastTransaction` | — |

### Governance + stats (none — Phase H)

`sr`, `proposal`, `param`, `energy`, `bandwidth`, `network status` commands ship in v0.2.0 (Phase H).

## Endpoint mapping

For audit / scope verification — which TronGrid REST endpoint each `trongrid-cli` command uses.

| Command | Endpoint(s) |
|---------|-------------|
| `account view` | `/v1/accounts/{addr}` |
| `account resources` | `/wallet/getaccountresource` |
| `account tokens` | `/v1/accounts/{addr}` + `/v1/trc20/info?contract_list=` (batch metadata) |
| `account txs` | `/v1/accounts/{addr}/transactions` |
| `account transfers` | `/v1/accounts/{addr}/transactions/trc20` |
| `account internals` | `/v1/accounts/{addr}/internal` (or embedded in tx response) |
| `account delegations` | `/wallet/getdelegatedresourceaccountindexv2` + `/wallet/getdelegatedresourcev2` |
| `account permissions` | `/wallet/getaccount` (`.active_permission`, `.owner_permission`) |
| `block latest` | `/wallet/getnowblock` (or `/walletsolidity/getnowblock` with `--confirmed`) |
| `block view` | `/wallet/getblockbynum` / `/wallet/getblockbyid` |
| `contract view` | `/wallet/getcontract` + `/wallet/getcontractinfo` |
| `contract methods` | derived from `getcontract` ABI |
| `contract events` | `/v1/contracts/{addr}/events` |
| `contract txs` | `/v1/accounts/{addr}/transactions` (filtered to contract) |
| `contract internals` | `/v1/contracts/{addr}/internal` (or embedded) |
| `token view` (TRC-20) | `/v1/trc20/info` |
| `token view` (TRC-10) | `/wallet/getassetissuebyid` |
| `token holders` | `/v1/contracts/{addr}/tokens` |
| `token transfers` | `/v1/contracts/{addr}/events?event_name=Transfer` |
| `token balance` (TRX) | `/wallet/getaccount` |
| `token balance` (TRC-20) | `/wallet/triggerconstantcontract` (`balanceOf`) |
| `token allowance` | `/wallet/triggerconstantcontract` (`allowance`) |
| `tx view` | `/wallet/gettransactioninfobyid` + `/wallet/gettransactionbyid` |

## Strengths and gaps

### `trongrid-cli`

**Strengths:**
- Stable shell-based interface — works with every coding agent, every OS, and every human terminal (no separate MCP protocol layer to install)
- Unit-shape contract: paired raw + major-unit fields (`balance` + `balance_trx`, `value` + `value_major`) prevent decimal-conversion bugs in agent code
- `--json` + `--fields` projection for structured output without `jq` post-processing
- Subject-address muting in transfer lists for visual clarity

**Gaps (vs the MCPs):**
- No write-side support yet (`broadcast`, freeze/unfreeze, vote) — Phase I
- No governance / stats commands yet — Phase H
- No on-chain ABI encoder yet — `contract call` deferred until needed
- No price feed integration — depends on price-feed API choice

### TronGrid MCP

**Strengths:** Largest surface (164 tools); covers FullNode JSON-RPC for direct EVM-compatible queries.

**Gaps:** MCP-only (requires Claude Desktop, Cursor, etc. with MCP support); raw integer fields without paired major-unit conversion; error envelopes leak upstream strings.

### TronScan MCP

**Strengths:** TronScan-specific data (verified token labels, account tags, contract verification status); 10 doc categories with skill-per-task organization.

**Gaps:** MCP-only; sort syntax (`sort: "-field"`) and filter enums (`show=1|2|3|4`) require lookup; no FullNode coverage.

## Update cadence

This doc updates whenever:
- A new `trongrid-cli` command ships (per phase)
- A competitor announces new tools
- A reader reports a stale or wrong row

Last reviewed: 2026-04-17 (Phase G first publish).
```

- [ ] **Step 4: Verify links**

Run: `grep -oE '\[.*?\]\([^)]+\)' docs/designs/competitor-parity.md | head -20`

Visually check that all internal links resolve to existing files. Specifically:
- `../research/mcp-skills.md` → exists ✓
- `./units.md` (referenced indirectly via README) → exists in same `designs/` dir

- [ ] **Step 5: Commit**

```bash
git add docs/designs/competitor-parity.md
git commit -m "docs: add competitor parity matrix for v0.1.0 publish

Live comparison of trongrid-cli, TronGrid MCP, and TronScan MCP.
Per-resource command coverage table + endpoint mapping + strengths/gaps.
Helps users pick the right tool; updates as competitors evolve."
```

---

## Task 5: Finalize `package.json`

**Files:**
- Modify: `package.json`
- Verify or Create: `LICENSE`

**Goal:** Bring `package.json` to publish-ready state. Decide npm package name (with **user gate** after availability check).

- [ ] **Step 1: Check `trongrid` npm name availability**

Run: `npm view trongrid 2>&1 | head -5`

- If output starts with `npm error 404` → name is **available**
- Otherwise → name is **taken** (output shows the existing package metadata)

Try fallbacks if needed (in order):

```bash
npm view trongrid-cli 2>&1 | head -5      # second choice
npm view @dongzhenye/trongrid 2>&1 | head -5  # scoped fallback
```

- [ ] **Step 2: 🛑 USER GATE — confirm package name**

Stop here. Report to the user:
- Result of `npm view trongrid` (available or taken)
- Result of fallbacks (if checked)
- Your recommendation

Wait for user confirmation before proceeding. **Do not auto-decide the name.** Per `feedback_distribution_decisions_gate` memory: hard-to-reverse external decisions require explicit user confirm.

- [ ] **Step 3: Verify or create `LICENSE`**

Run: `cat LICENSE 2>&1`

If the file exists and contains MIT license text, leave it alone.

If it doesn't exist, create `LICENSE` at repo root with the MIT license text (replace `<YEAR>` and `<COPYRIGHT HOLDER>`):

```
MIT License

Copyright (c) 2026 Zhenye Dong

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Update `package.json`**

Replace the entire content of `package.json` with (substitute `<NAME>` with the user-confirmed name from Step 2):

```json
{
  "name": "<NAME>",
  "version": "0.1.0",
  "description": "TRON CLI built on TronGrid — for humans and AI agents",
  "type": "module",
  "bin": {
    "trongrid": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "test": "bun test",
    "start": "node dist/index.js",
    "prepublishOnly": "bun test && tsc"
  },
  "engines": {
    "node": ">=22"
  },
  "files": [
    "dist",
    "README.md",
    "AGENTS.md",
    "LICENSE"
  ],
  "keywords": [
    "tron",
    "trongrid",
    "blockchain",
    "cli",
    "agent",
    "trc20",
    "trc10",
    "web3"
  ],
  "license": "MIT",
  "author": "Zhenye Dong <dongzhenye@gmail.com>",
  "homepage": "https://github.com/dongzhenye/trongrid-cli",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/dongzhenye/trongrid-cli.git"
  },
  "bugs": {
    "url": "https://github.com/dongzhenye/trongrid-cli/issues"
  },
  "dependencies": {
    "commander": "^14.0.3"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.4.10",
    "@types/node": "^25.5.0",
    "typescript": "^6.0.2"
  }
}
```

Note the `prepublishOnly` script — npm runs this automatically before publish; it gates on tests + build passing.

- [ ] **Step 5: Verify build still works**

Run: `bun test && npm run build`

Expected: tests pass, `dist/` rebuilt with no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json LICENSE
git commit -m "chore: finalize package.json + LICENSE for v0.1.0 publish

Adds description, keywords, repository, homepage, bugs, files, author
email. Adds prepublishOnly script (test + build) as a publish-time
gate. LICENSE created/verified as MIT."
```

---

## Task 6: Pre-publish dry-run + local install test

**Files:**
- (no file changes — verification only)

**Goal:** Catch packaging issues (missing files, broken bin shebang, dependency holes) before public publish.

- [ ] **Step 1: Inspect the package contents**

Run: `npm pack --dry-run 2>&1 | tail -30`

Expected contents (in `npm notice` lines):
- `dist/` directory (compiled JS + .d.ts files)
- `README.md`
- `AGENTS.md`
- `LICENSE`
- `package.json`

**Should NOT include:** `src/`, `tests/`, `docs/`, `.git/`, `node_modules/`, `bun.lock`, `tsconfig.json`, etc.

If unexpected files appear, check `files` field in `package.json` (Step 4 of Task 5).

- [ ] **Step 2: Generate the actual tarball**

Run: `npm pack`

Expected output: `<name>-0.1.0.tgz` in the current directory.

Note the actual filename (depends on the chosen npm name from Task 5).

- [ ] **Step 3: Smoke test in a fresh global install**

In a separate shell or new terminal tab (so PATH and global registry don't conflict):

```bash
# Install the freshly-packed tarball globally
npm install -g ./<name>-0.1.0.tgz

# Verify version
trongrid --version
# Expected: 0.1.0

# Top-level help
trongrid --help

# Live API smoke tests (network required)
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json | head -5
trongrid account transfers TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --limit 3
trongrid block latest --confirmed
```

Verify:
- `--version` returns `0.1.0` (not `0.0.0` or stale)
- `--help` renders without errors
- API calls return data (not crash from missing dependencies)
- Output formatting matches what we see when running from source

- [ ] **Step 4: Uninstall the test install**

```bash
npm uninstall -g <name>
```

Where `<name>` is the chosen npm name. This cleans up so the actual `npm publish` doesn't conflict.

- [ ] **Step 5: Clean the tarball**

```bash
rm <name>-0.1.0.tgz
```

The tarball is regenerated by `npm publish` itself; we don't keep it in the repo.

- [ ] **Step 6: Commit (no diff expected — this task is verification only)**

If Steps 1–5 surfaced any package.json adjustments (e.g., missing `files` entry), fix them and amend the previous commit:

```bash
# Only if you made changes:
git add package.json
git commit --amend --no-edit
```

If no changes were needed, skip the commit. Move to Task 7.

---

## Task 7: `npm publish`

**Files:** none (registry side-effect only)

**Goal:** Push v0.1.0 to the public npm registry.

- [ ] **Step 1: 🛑 USER GATE — confirm publish**

Stop here. Report to the user:
- Final package name
- Tarball contents from Task 6 (paste the `npm pack --dry-run` output)
- Smoke test results from Task 6
- Confirm: ready to publish?

`npm publish` is **not reversible after 72 hours** (npm policy). Wait for explicit user confirmation. Per `feedback_distribution_decisions_gate` memory: this is exactly the kind of hard-to-reverse external action that needs a gate.

- [ ] **Step 2: Verify npm login**

Run: `npm whoami`

If it returns a username, you're logged in. If it errors with "not logged in", run:

```bash
npm login
```

The user must enter credentials interactively. If the user is not present, BLOCK and report.

- [ ] **Step 3: Publish**

```bash
npm publish --access public
```

The `--access public` flag is required for scoped packages (e.g. `@dongzhenye/trongrid`); harmless for unscoped. Always pass it for safety.

Expected output ends with `+ <name>@0.1.0`.

- [ ] **Step 4: Verify on the registry**

Run: `npm view <name> version`

Expected: `0.1.0`.

Visit `https://www.npmjs.com/package/<name>` in a browser — verify README renders correctly. (Cannot fully automate; report the URL to the user for visual confirmation.)

---

## Task 8: Git tag v0.1.0 + GitHub Release

**Files:**
- Modify: `docs/handoff.md`
- (Git tag + GitHub release as side effects)

**Goal:** Cut the first tagged release on GitHub, matching the npm publish.

- [ ] **Step 1: Verify clean state on `main`**

Run:
```bash
git status --short
git log --oneline -3
git branch --show-current
```

Expected:
- `git status` empty (all changes committed)
- `git branch --show-current` = `main` (or the integration branch — adjust based on workflow)
- Last commits are Tasks 1–7 in order

If you've been working on a feature branch, merge to `main` first using the project's normal flow (see `meta/WORKFLOW.md` §3 — `--no-ff` merge for branches).

- [ ] **Step 2: Create annotated tag**

```bash
git tag -a v0.1.0 -m "v0.1.0 — first public release

31 commands across 7 resources (account, block, contract, token, tx,
auth, config). Full read-side coverage of TronGrid REST + selected
FullNode endpoints. JSON output with paired raw + major-unit fields
for safe agent integration."
```

- [ ] **Step 3: Push tag**

```bash
git push origin v0.1.0
```

- [ ] **Step 4: Create GitHub Release**

```bash
gh release create v0.1.0 \
  --title "v0.1.0 — first public release" \
  --generate-notes \
  --notes "## Highlights

\`trongrid@0.1.0\` is the first public release of \`trongrid-cli\` — a TRON CLI built on TronGrid, designed for humans and AI agents.

### What's in v0.1.0

- 31 commands across 7 resources: account, block, contract, token, tx, auth, config
- Read-side TronGrid REST coverage + selected FullNode endpoints
- \`--json\` mode with paired raw + major-unit fields (no decimal-conversion bugs in agent code)
- Subject-address muting in transfer lists
- 1 prod dependency (\`commander\`)
- Tested on Node.js ≥ 22

### What's next

- v0.2.0 — Governance + stats commands (Super Representatives, proposals, chain parameters, energy/bandwidth pricing, network status)
- v0.3.0 — Write-side (broadcast, freeze/unfreeze, delegate, vote)

### Install

\`\`\`bash
npm install -g <name>
\`\`\`

See [README](https://github.com/dongzhenye/trongrid-cli#readme) for usage.

---

Generated changelog from commits below."
```

(Note: replace `<name>` in the install instruction with the actual chosen npm name from Task 5.)

- [ ] **Step 5: Update `docs/handoff.md`**

Read the current handoff first:

```bash
cat docs/handoff.md | head -25
```

Make these edits to the State table:

- `main tip`: update to "Phase G released as v0.1.0, YYYY-MM-DD" (use today's date)
- `Active phase`: update to **Phase H** — Governance + stats
- `Pending cross-cut`: keep as-is or update if applicable

In the Decision ledger, add a new section heading **`**Phase G implementation:**`** at the appropriate place (before any Open items list), with bullets:

```markdown
**Phase G implementation:**
- First npm publish at v0.1.0 — package name `<NAME>` claimed; 31 commands shipped → [`docs/designs/phase-g-first-publish.md`](./designs/phase-g-first-publish.md)
- `applySort` numeric sort: `SortConfig.fieldTypes` map adds bigint/number variants; lex compare preserved as default → `src/utils/sort.ts`
- Extreme value display: `formatExtremeIfNeeded` returns scientific notation for `value_major` integer part > 16 digits; `⚠ ` warning prefix when raw value === uint256.max → `src/output/format.ts`
- README rewritten for v0.1.0 (humans + agents framing); parity matrix shipped at `docs/designs/competitor-parity.md`
- LICENSE = MIT; author = personal (Zhenye Dong); ownership transfer remains a separate post-launch concern
```

Update the `Tests` row to reflect the new count (should be 462 after Tasks 1+2 added 13 tests).

- [ ] **Step 6: Commit handoff update**

```bash
git add docs/handoff.md
git commit -m "docs: mark Phase G complete; advance to Phase H

v0.1.0 published to npm. Decision ledger entries added for
package name, sort fix, extreme value handling, README rewrite,
parity matrix, and license/ownership stance."
```

- [ ] **Step 7: Push the handoff commit**

```bash
git push origin main
```

- [ ] **Step 8: Final verification**

Run:
```bash
npm view <name> version           # → 0.1.0
git tag -l v0.1.0                  # → v0.1.0
gh release view v0.1.0 --json url  # → JSON with release URL
```

Visit the GitHub release URL in a browser. Confirm release notes render correctly.

Report to the user:
- npm registry URL: `https://www.npmjs.com/package/<name>`
- GitHub release URL
- Install command to test: `npm install -g <name>`

🎉 Phase G complete. Next phase: H (Governance + stats).
