# Transfer List Display P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify centered and uncentered transfer list renderers into a single `renderTransferList(rows, subjectAddress?)` with header row, thousands separators, token symbol in Amount column, and subject-address muting.

**Architecture:** Replace `CenteredTransferRow` + `renderCenteredTransferList` and `UncenteredTransferRow` + `renderUncenteredTransferList` with a single `TransferRow` type and `renderTransferList` function. Migration is additive-first (new code coexists with old), then consumers switch, then old code is removed. Each task leaves all tests green.

**Tech Stack:** TypeScript, bun:test, commander

**Spec:** [`docs/designs/transfer-list-display.md`](../designs/transfer-list-display.md)

---

## File Map

| File | Action | Task |
|------|--------|------|
| `src/output/transfers.ts` | Add `TransferRow` + `renderTransferList`; later remove old types/renderers | 1, 4 |
| `tests/output/transfers.test.ts` | Add `renderTransferList` tests; later remove old tests | 1, 4 |
| `src/commands/account/transfers.ts` | Migrate to `TransferRow` + unified renderer | 2 |
| `tests/commands/account-transfers.test.ts` | Update fixtures, sort fields, JSON assertions, renderer tests | 2 |
| `src/commands/token/transfers.ts` | Migrate to `TransferRow` + add `token_symbol`/`token_address` | 3 |
| `tests/commands/token-transfers.test.ts` | Update fixtures + assertions for new fields | 3 |
| `docs/designs/transfer-list-display.md` | Lifecycle `draft` → `living` | 5 |
| `docs/handoff.md` | Update state + decision ledger | 5 |

No new files created. `src/commands/contract/transfers.ts` delegates to `accountTransfersAction` — no changes needed (covered by Task 2 automatically).

---

## Task 1: Add TransferRow + renderTransferList (TDD)

**Files:**
- Modify: `src/output/transfers.ts` (add new types + function alongside existing code)
- Modify: `tests/output/transfers.test.ts` (add new describe block)

- [ ] **Step 1: Write failing tests for renderTransferList**

Append this `describe` block to `tests/output/transfers.test.ts`, after the existing `renderUncenteredTransferList` tests. Also add `TransferRow` and `renderTransferList` to the import from `../../src/output/transfers.js`.

```typescript
// --- Add to imports at top of file ---
// import { ..., TransferRow, renderTransferList } from "../../src/output/transfers.js";

describe("renderTransferList", () => {
	const originalNoColor = process.env.NO_COLOR;
	const originalLog = console.log;
	let captured: string[];

	beforeEach(() => {
		process.env.NO_COLOR = "1";
		captured = [];
		console.log = (msg?: unknown) => {
			captured.push(typeof msg === "string" ? msg : String(msg));
		};
	});

	afterEach(() => {
		console.log = originalLog;
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
	const PEER_A = "TWd4WNjBxxxxxxxxxxxxxxxxxxxxxxxxxAA";
	const TOKEN_ADDR = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

	function mkTransferRow(overrides: Partial<TransferRow>): TransferRow {
		return {
			tx_id: "4070abc5f820000000000000000000000000000000000000000000000000abcd",
			block_number: 80001,
			block_timestamp: 1776315900000,
			from: SUBJECT,
			to: PEER_A,
			value: "1000530000",
			value_unit: "raw",
			decimals: 6,
			value_major: "1000.53",
			token_address: TOKEN_ADDR,
			token_symbol: "USDT",
			direction: "out",
			...overrides,
		};
	}

	it("shows empty-state for 0 rows", () => {
		renderTransferList([]);
		expect(captured[0]).toContain("No transfers found");
	});

	it("singularizes header for 1 row", () => {
		renderTransferList([mkTransferRow({})]);
		expect(captured[0]).toContain("Found 1 transfer");
		expect(captured[0]).not.toContain("transfers");
	});

	it("pluralizes header for multiple rows", () => {
		const rows = [
			mkTransferRow({}),
			mkTransferRow({
				tx_id: "bdf8d93b0000000000000000000000000000000000000000000000000000dcba",
				value_major: "500.0",
			}),
		];
		renderTransferList(rows);
		expect(captured[0]).toContain("Found 2 transfers");
	});

	it("renders column headers (TX, Time (UTC), From, To, Amount)", () => {
		renderTransferList([mkTransferRow({})]);
		const headerLine = captured[1];
		expect(headerLine).toBeDefined();
		expect(headerLine).toContain("TX");
		expect(headerLine).toContain("Time (UTC)");
		expect(headerLine).toContain("From");
		expect(headerLine).toContain("To");
		expect(headerLine).toContain("Amount");
	});

	it("shows → arrow between From and To", () => {
		renderTransferList([mkTransferRow({})]);
		const joined = captured.join("\n");
		expect(joined).toContain("→");
	});

	it("appends token symbol as unit in Amount column", () => {
		renderTransferList([mkTransferRow({})]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		expect(dataRow).toContain("USDT");
		expect(dataRow).toContain("1,000.53");
	});

	it("uses truncated token_address as unit when symbol is undefined", () => {
		renderTransferList([mkTransferRow({ token_symbol: undefined })]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		// Truncated TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8 → TEkxiT...66rdz8
		expect(dataRow).toContain("TEkxiT");
		expect(dataRow).toContain("66rdz8");
	});

	it("adds thousands separators to amounts", () => {
		renderTransferList([mkTransferRow({ value_major: "1000000.5" })]);
		const joined = captured.join("\n");
		expect(joined).toContain("1,000,000.5");
	});

	it("right-aligns amounts so decimal points stack", () => {
		const rows = [
			mkTransferRow({ value_major: "1000.53" }),
			mkTransferRow({
				tx_id: "bdf8d93b0000000000000000000000000000000000000000000000000000dcba",
				value_major: "500.0",
			}),
		];
		renderTransferList(rows);
		const row1 = captured.find((l) => l.includes("1,000.53"));
		const row2 = captured.find((l) => l.includes("500.0"));
		expect(row1).toBeDefined();
		expect(row2).toBeDefined();
		// Decimal points must align — the "." in "1,000.53" and "500.0"
		// should be at the same column position.
		const dot1 = row1!.indexOf("1,000.53") + 5; // position of "."
		const dot2 = row2!.indexOf("500.0") + 3; // position of "."
		expect(dot1).toBe(dot2);
	});

	it("uses list timestamp format YYYY-MM-DD HH:MM (no seconds)", () => {
		renderTransferList([mkTransferRow({ block_timestamp: 1776315900000 })]);
		const joined = captured.join("\n");
		// Should contain date + time without seconds
		expect(joined).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
		// Should NOT contain seconds (the detail format has HH:MM:SS)
		expect(joined).not.toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/output/transfers.test.ts`

Expected: FAIL — `TransferRow` and `renderTransferList` are not exported from `src/output/transfers.ts`.

- [ ] **Step 3: Implement TransferRow + renderTransferList**

Add the following to `src/output/transfers.ts`, **after** the existing `renderUncenteredTransferList` function (keep all existing code intact):

```typescript
/**
 * Compact timestamp for list columns: `YYYY-MM-DD HH:MM`.
 * The `(UTC)` label lives in the column header, not repeated per row.
 */
function formatListTimestamp(ms: number): string {
	return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Unified transfer row type — replaces CenteredTransferRow and
 * UncenteredTransferRow. Used by all transfer list commands:
 * `account transfers`, `token transfers`, `contract transfers`.
 *
 * Column layout per docs/designs/transfer-list-display.md:
 *   TX | Time (UTC) | From → To | Amount (number + token unit)
 */
export interface TransferRow {
	tx_id: string;
	block_number: number;
	block_timestamp: number;
	from: string;
	to: string;
	value: string;
	value_unit: "raw";
	decimals: number;
	value_major: string;
	token_address: string;
	token_symbol?: string;
	/** Computed from subject address during fetch; omitted for token-scoped queries. */
	direction?: "in" | "out";
}

/**
 * Unified human-mode renderer for transfer lists.
 *
 * When `subjectAddress` is provided (e.g. `account transfers <addr>`),
 * occurrences of that address in From/To are rendered with `muted()` color
 * so the counterparty stands out. When omitted (e.g. `token transfers`),
 * all addresses render equally.
 *
 * Amount column embeds the token symbol as the unit suffix:
 *   `1,000.53 USDT`  (symbol known)
 *   `1,000.53 TEkxiT...66rdz8`  (symbol unknown, truncated address)
 */
export function renderTransferList(rows: TransferRow[], subjectAddress?: string): void {
	if (rows.length === 0) {
		console.log(muted("No transfers found."));
		return;
	}
	const noun = rows.length === 1 ? "transfer" : "transfers";
	console.log(muted(`Found ${rows.length} ${noun}:\n`));

	const header = ["TX", "Time (UTC)", "From", "", "To", "Amount"];
	const amountNums: string[] = ["Amount"];

	const cells: string[][] = rows.map((r) => {
		const fromDisplay = truncateAddress(r.from);
		const toDisplay = truncateAddress(r.to);
		const amountStr = addThousandsSep(r.value_major);
		amountNums.push(amountStr);

		return [
			truncateAddress(r.tx_id, 4, 4),
			formatListTimestamp(r.block_timestamp),
			subjectAddress && r.from === subjectAddress ? muted(fromDisplay) : fromDisplay,
			"\u2192",
			subjectAddress && r.to === subjectAddress ? muted(toDisplay) : toDisplay,
			amountStr,
		];
	});

	const allRows = [header, ...cells];

	// Right-align Amount numbers, then append " UNIT" (data rows only).
	const amountIdx = 5;
	const numWidth = Math.max(...amountNums.map((s) => s.length));
	for (let i = 1; i < allRows.length; i++) {
		const row = allRows[i]!;
		const r = rows[i - 1]!;
		const unit = r.token_symbol ?? truncateAddress(r.token_address);
		row[amountIdx] = `${alignNumber(row[amountIdx] ?? "", numWidth)} ${unit}`;
	}
	// Right-align header to numeric width so it aligns with the number column.
	allRows[0]![amountIdx] = alignNumber(allRows[0]![amountIdx] ?? "", numWidth);

	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}
```

Also remove the `formatTimestamp` import at the top of the file (it was used by the old renderers; the new one uses the local `formatListTimestamp`). **But** keep it for now — the old renderers still use it. It will be removed in Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/output/transfers.test.ts`

Expected: ALL PASS (new tests + existing old tests).

- [ ] **Step 5: Run full test suite**

Run: `bun test`

Expected: All 448+ tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/output/transfers.ts tests/output/transfers.test.ts
git commit -m "feat: add unified TransferRow type and renderTransferList

Additive — CenteredTransferRow/UncenteredTransferRow and their renderers
are retained until consumers migrate in subsequent commits.

Column layout: TX | Time (UTC) | From → To | Amount (number + token unit).
Subject-address muting via optional subjectAddress parameter."
```

---

## Task 2: Migrate account transfers

**Files:**
- Modify: `src/commands/account/transfers.ts`
- Modify: `tests/commands/account-transfers.test.ts`

- [ ] **Step 1: Update src/commands/account/transfers.ts**

Replace the entire file content:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { type TransferRow, renderTransferList } from "../../output/transfers.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";
import { parseTimeRange } from "../../utils/time-range.js";
import { formatMajor } from "../../utils/tokens.js";

interface RawTransfer {
	transaction_id?: string;
	block_timestamp?: number;
	block_number?: number;
	from?: string;
	to?: string;
	type?: string;
	value?: string;
	token_info?: { symbol?: string; address?: string; decimals?: number };
}

interface AccountTransfersResponse {
	data?: RawTransfer[];
}

export async function fetchAccountTransfers(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<TransferRow[]> {
	const params = new URLSearchParams();
	params.set("limit", String(opts.limit));
	if (opts.minTimestamp !== undefined) params.set("min_timestamp", String(opts.minTimestamp));
	if (opts.maxTimestamp !== undefined) params.set("max_timestamp", String(opts.maxTimestamp));

	const path = `/v1/accounts/${address}/transactions/trc20?${params.toString()}`;
	const raw = await client.get<AccountTransfersResponse>(path);

	const rows: TransferRow[] = [];
	for (const r of raw.data ?? []) {
		const isOut = r.from === address;
		const decimals = r.token_info?.decimals ?? 0;
		const amount = r.value ?? "0";
		rows.push({
			tx_id: r.transaction_id ?? "",
			block_number: r.block_number ?? 0,
			block_timestamp: r.block_timestamp ?? 0,
			from: r.from ?? "",
			to: r.to ?? "",
			value: amount,
			value_unit: "raw",
			decimals,
			value_major: formatMajor(amount, decimals),
			token_address: r.token_info?.address ?? "",
			token_symbol: r.token_info?.symbol,
			direction: isOut ? "out" : "in",
		});
	}
	return rows;
}

const TRANSFERS_SORT_CONFIG: SortConfig<TransferRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		block_number: "desc",
		value: "desc",
	},
	tieBreakField: "block_timestamp",
};

/**
 * Thin wrapper over {@link applySort} + {@link TRANSFERS_SORT_CONFIG}.
 * Exported so tests can exercise the sort config (default field, tie-break,
 * unknown-field UsageError) without going through commander.
 */
export function sortTransfers(
	items: TransferRow[],
	opts: SortOptions,
): TransferRow[] {
	return applySort(items, TRANSFERS_SORT_CONFIG, opts);
}

export async function accountTransfersAction(
	address: string | undefined,
	parent: Command,
): Promise<void> {
	const { getClient, parseFields } = await import("../../index.js");
	const opts = parent.opts<GlobalOptions>();
	try {
		const resolved = resolveAddress(address);
		const client = getClient(opts);
		// NOTE: --confirmed has no effect here —
		// /v1/accounts/:address/transactions/trc20 has no /walletsolidity
		// mirror. Accepted silently for flag uniformity; tracked as a
		// Phase D follow-up.
		const range = parseTimeRange(opts.before, opts.after);
		const rows = await fetchAccountTransfers(client, resolved, {
			limit: Number.parseInt(opts.limit, 10),
			minTimestamp: range.minTimestamp,
			maxTimestamp: range.maxTimestamp,
		});
		const sorted = sortTransfers(rows, {
			sortBy: opts.sortBy,
			reverse: opts.reverse,
		});
		printListResult(sorted, (r) => renderTransferList(r, resolved), {
			json: opts.json,
			fields: parseFields(opts),
		});
	} catch (err) {
		reportErrorAndExit(err, {
			json: opts.json,
			verbose: opts.verbose,
			hint: addressErrorHint(err),
		});
	}
}

export function registerAccountTransfersCommand(account: Command, parent: Command): void {
	account
		.command("transfers")
		.description("List TRC-10/20 token transfers for an address")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account transfers TR...
  $ trongrid account transfers                            # uses default_address
  $ trongrid account transfers TR... --limit 50
  $ trongrid account transfers TR... --reverse            # oldest first
  $ trongrid account transfers TR... --sort-by value      # largest transfer first
  $ trongrid account transfers TR... --after 2026-04-01   # since 2026-04-01
  $ trongrid account transfers TR... --before 2026-04-15 --after 2026-04-01

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, block_number, value (all default desc)
`,
		)
		.action(async (address: string | undefined) => {
			await accountTransfersAction(address, parent);
		});
}
```

Key changes from the original:
- `AccountTransferRow` removed — uses `TransferRow` directly
- `fetchAccountTransfers` returns `TransferRow[]` with `from`/`to` instead of `direction`/`counterparty`
- Sort config: `timestamp` → `block_timestamp`, `amount` → `value`
- Render call: `renderTransferList(r, resolved)` with subject address for muting
- Help text: sort field names updated

- [ ] **Step 2: Update tests/commands/account-transfers.test.ts**

Replace the entire file content:

```typescript
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	fetchAccountTransfers,
	sortTransfers,
} from "../../src/commands/account/transfers.js";
import { formatJsonList } from "../../src/output/format.js";
import type { TransferRow } from "../../src/output/transfers.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const PEER = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxxxxfyEV";

function mockFetchWithCapture(fixture: unknown): { capturedUrl: string | undefined } {
	const ctx: { capturedUrl: string | undefined } = { capturedUrl: undefined };
	globalThis.fetch = mock((input: Request | string | URL) => {
		ctx.capturedUrl = typeof input === "string" ? input : input.toString();
		return Promise.resolve(
			new Response(JSON.stringify(fixture), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
	return ctx;
}

describe("fetchAccountTransfers", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses TRC-20 transfer rows with from/to and direction=out when from matches subject", async () => {
		const fixture = {
			data: [
				{
					transaction_id: "abc123",
					block_timestamp: 1744694400000,
					block_number: 70000000,
					from: SUBJECT,
					to: PEER,
					type: "Transfer",
					value: "1000000",
					token_info: {
						symbol: "USDT",
						address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
						decimals: 6,
					},
				},
			],
		};
		mockFetchWithCapture(fixture);

		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });

		expect(rows.length).toBe(1);
		expect(rows[0]?.from).toBe(SUBJECT);
		expect(rows[0]?.to).toBe(PEER);
		expect(rows[0]?.direction).toBe("out");
		expect(rows[0]?.token_symbol).toBe("USDT");
		expect(rows[0]?.value_major).toBe("1.0");
	});

	it("sets direction=in when from does not match subject", async () => {
		const fixture = {
			data: [
				{
					transaction_id: "def456",
					block_timestamp: 1744694500000,
					block_number: 70000001,
					from: PEER,
					to: SUBJECT,
					type: "Transfer",
					value: "2500000",
					token_info: {
						symbol: "USDT",
						address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
						decimals: 6,
					},
				},
			],
		};
		mockFetchWithCapture(fixture);

		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });

		expect(rows[0]?.from).toBe(PEER);
		expect(rows[0]?.to).toBe(SUBJECT);
		expect(rows[0]?.direction).toBe("in");
		expect(rows[0]?.value_major).toBe("2.5");
	});

	it("passes --before / --after as min_timestamp / max_timestamp query params", async () => {
		const ctx = mockFetchWithCapture({ data: [] });
		const client = createClient({ network: "mainnet" });
		await fetchAccountTransfers(client, SUBJECT, {
			limit: 20,
			minTimestamp: 1744000000000,
			maxTimestamp: 1744999999000,
		});

		expect(ctx.capturedUrl).toBeDefined();
		expect(ctx.capturedUrl).toContain("min_timestamp=1744000000000");
		expect(ctx.capturedUrl).toContain("max_timestamp=1744999999000");
		expect(ctx.capturedUrl).toContain("limit=20");
		expect(ctx.capturedUrl).toContain(`/v1/accounts/${SUBJECT}/transactions/trc20`);
	});

	it("returns empty array when API returns no data", async () => {
		mockFetchWithCapture({ data: [] });
		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });
		expect(rows).toEqual([]);
	});
});

// ---------- sortTransfers integration ----------

function mkRow(overrides: Partial<TransferRow>): TransferRow {
	return {
		tx_id: "tx_x",
		block_number: 1,
		block_timestamp: 1,
		from: SUBJECT,
		to: PEER,
		value: "1000000",
		value_unit: "raw",
		decimals: 6,
		value_major: "1.0",
		token_address: "Ttoken",
		token_symbol: "USDT",
		direction: "out",
		...overrides,
	};
}

describe("sortTransfers (default: block_timestamp desc)", () => {
	const items: TransferRow[] = [
		mkRow({ tx_id: "tx_b", block_timestamp: 2, block_number: 2, value: "200", value_major: "0.2" }),
		mkRow({ tx_id: "tx_c", block_timestamp: 3, block_number: 3, value: "100", value_major: "0.1" }),
		mkRow({ tx_id: "tx_a", block_timestamp: 1, block_number: 1, value: "300", value_major: "0.3" }),
	];

	it("defaults to block_timestamp desc (newest first)", () => {
		const out = sortTransfers(items, {});
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--sort-by value sorts by value desc (largest first)", () => {
		const out = sortTransfers(items, { sortBy: "value" });
		// "300" > "200" > "100" as strings (equal length), but comparison is
		// string-based via compareField. For equal widths this matches numeric.
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by block_number sorts by block_number desc", () => {
		const out = sortTransfers(items, { sortBy: "block_number" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--reverse flips default to block_timestamp asc (oldest first)", () => {
		const out = sortTransfers(items, { reverse: true });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by value breaks ties by block_timestamp desc (newest first)", () => {
		const tied: TransferRow[] = [
			mkRow({ tx_id: "tx_tie_old", block_timestamp: 10, value: "500", value_major: "0.5" }),
			mkRow({ tx_id: "tx_tie_new", block_timestamp: 30, value: "500", value_major: "0.5" }),
			mkRow({ tx_id: "tx_big", block_timestamp: 20, value: "900", value_major: "0.9" }),
			mkRow({ tx_id: "tx_tie_mid", block_timestamp: 20, value: "500", value_major: "0.5" }),
		];
		const out = sortTransfers(tied, { sortBy: "value" });
		expect(out.map((x) => x.tx_id)).toEqual([
			"tx_big",
			"tx_tie_new",
			"tx_tie_mid",
			"tx_tie_old",
		]);
	});

	it("rejects --sort-by on an unknown field with a UsageError", () => {
		expect(() => sortTransfers(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});
});

// ---------- default_address resolution ----------

describe("account transfers default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-transfers-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", SUBJECT);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("uses config default_address when argument is omitted", () => {
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(SUBJECT);
	});
});

// ---------- JSON mode (--json, --fields) ----------

describe("account transfers JSON output", () => {
	const items: TransferRow[] = [
		mkRow({
			tx_id: "tx_json_1",
			block_timestamp: 1744694400000,
			block_number: 70000000,
			from: SUBJECT,
			to: PEER,
			direction: "out",
			value: "1000000",
			value_major: "1.0",
		}),
	];

	it("--json emits the full TransferRow shape including from/to and direction", () => {
		const raw = formatJsonList(items);
		const parsed = JSON.parse(raw) as TransferRow[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0]).toMatchObject({
			tx_id: "tx_json_1",
			from: SUBJECT,
			to: PEER,
			direction: "out",
			token_address: "Ttoken",
			token_symbol: "USDT",
			value: "1000000",
			value_unit: "raw",
			decimals: 6,
			value_major: "1.0",
		});
	});

	it("--json --fields projects only the requested keys", () => {
		const raw = formatJsonList(items, ["from", "to", "value"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		expect(parsed[0]).toEqual({ from: SUBJECT, to: PEER, value: "1000000" });
	});

	it("--json --fields with valid keys keeps the selected columns", () => {
		const raw = formatJsonList(items, ["tx_id", "direction", "from", "value_major"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		expect(parsed[0]).toEqual({
			tx_id: "tx_json_1",
			direction: "out",
			from: SUBJECT,
			value_major: "1.0",
		});
	});
});
```

Key changes from original test file:
- `AccountTransferRow` → `TransferRow`
- `mkRow` fixture: `from`/`to` instead of `direction`/`counterparty`; `block_timestamp` instead of `timestamp`; `value`/`value_major` instead of `amount`/`amount_major`
- Sort tests: `sortBy: "amount"` → `"value"`, `sortBy: "timestamp"` removed (field renamed to `block_timestamp` — default sort already covers it)
- JSON assertions: `counterparty` → `from`/`to`
- `renderCenteredTransferList` test section removed (renderer now tested in `tests/output/transfers.test.ts`)

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun test tests/commands/account-transfers.test.ts`

Expected: ALL PASS.

- [ ] **Step 4: Run full test suite**

Run: `bun test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/transfers.ts tests/commands/account-transfers.test.ts
git commit -m "refactor: migrate account transfers to unified TransferRow + renderTransferList

Row shape: from/to replaces direction/counterparty. Field names align
with transfer-list-display.md spec (block_timestamp, value, value_major).
Subject-address muting via renderTransferList(rows, resolved).
contract transfers (mirror) inherits this change automatically."
```

---

## Task 3: Migrate token transfers

**Files:**
- Modify: `src/commands/token/transfers.ts`
- Modify: `tests/commands/token-transfers.test.ts`

- [ ] **Step 1: Update src/commands/token/transfers.ts**

Replace the entire file content:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit, UsageError } from "../../output/format.js";
import { type TransferRow, renderTransferList } from "../../output/transfers.js";
import { hexToBase58 } from "../../utils/address.js";
import { applySort, type SortConfig } from "../../utils/sort.js";
import { parseTimeRange } from "../../utils/time-range.js";
import { detectTokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

interface RawTransferEvent {
	block_number?: number;
	block_timestamp?: number;
	contract_address?: string;
	event_name?: string;
	result?: {
		from?: string;
		to?: string;
		value?: string;
	};
	transaction_id?: string;
}

interface ContractEventsResponse {
	data?: RawTransferEvent[];
}

export async function fetchTokenTransfers(
	client: ApiClient,
	contractAddress: string,
	opts: {
		limit: number;
		minBlockTimestamp?: number;
		maxBlockTimestamp?: number;
		onlyConfirmed?: boolean;
	},
): Promise<TransferRow[]> {
	const params = new URLSearchParams();
	params.set("event_name", "Transfer");
	params.set("order_by", "block_timestamp,desc");
	params.set("limit", String(opts.limit));
	if (opts.minBlockTimestamp !== undefined) {
		params.set("min_block_timestamp", String(opts.minBlockTimestamp));
	}
	if (opts.maxBlockTimestamp !== undefined) {
		params.set("max_block_timestamp", String(opts.maxBlockTimestamp));
	}
	if (opts.onlyConfirmed) {
		params.set("only_confirmed", "true");
	}

	const path = `/v1/contracts/${contractAddress}/events?${params.toString()}`;
	const raw = await client.get<ContractEventsResponse>(path);

	// Fetch token metadata for decimals + symbol
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const tokenInfo = infoMap.get(contractAddress);
	const decimals = tokenInfo?.decimals ?? 0;
	const symbol = tokenInfo?.symbol;

	const rows: TransferRow[] = [];
	for (const event of raw.data ?? []) {
		const fromHex = event.result?.from;
		const toHex = event.result?.to;
		const value = event.result?.value ?? "0";

		if (!fromHex || !toHex) continue;

		let fromBase58: string;
		let toBase58: string;
		try {
			fromBase58 = hexToBase58(fromHex);
			toBase58 = hexToBase58(toHex);
		} catch {
			// Skip malformed addresses
			continue;
		}

		rows.push({
			tx_id: event.transaction_id ?? "",
			block_number: event.block_number ?? 0,
			block_timestamp: event.block_timestamp ?? 0,
			from: fromBase58,
			to: toBase58,
			value,
			value_unit: "raw",
			decimals,
			value_major: formatMajor(value, decimals),
			token_address: contractAddress,
			token_symbol: symbol,
		});
	}

	return rows;
}

const TOKEN_TRANSFERS_SORT_CONFIG: SortConfig<TransferRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		value: "desc",
	},
	tieBreakField: "block_timestamp",
};

export function sortTokenTransfers(
	items: TransferRow[],
	opts: { sortBy?: string; reverse?: boolean },
): TransferRow[] {
	return applySort(items, TOKEN_TRANSFERS_SORT_CONFIG, opts);
}

export function registerTokenTransfersCommand(token: Command, parent: Command): void {
	token
		.command("transfers")
		.description("List TRC-20 Transfer events for a token contract")
		.helpGroup("Read commands:")
		.argument("<id|address|symbol>", "TRC-20 Base58 contract address or verified symbol")
		.option("--type <type>", "force token standard (trc10|trc20|trc721|trc1155)")
		.option("--confirmed", "only return confirmed transactions")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token transfers USDT
  $ trongrid token transfers TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid token transfers USDT --limit 50
  $ trongrid token transfers USDT --after 2026-04-01
  $ trongrid token transfers USDT --before 2026-04-15 --after 2026-04-01
  $ trongrid token transfers USDT --confirmed
  $ trongrid token transfers USDT --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value (all default desc)
`,
		)
		.action(async (input: string, localOpts: { type?: TokenTypeOverride; confirmed?: boolean }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(input, localOpts.type);

				if (id.type === "trx") {
					throw new UsageError(
						'Network-wide TRX transfer history is not available on TronGrid. For per-account TRX transfers, use "trongrid account txs". Support depends on a future product decision.',
					);
				}
				if (id.type === "trc10" || id.type === "trc721" || id.type === "trc1155") {
					throw new UsageError(
						`${id.type.toUpperCase()} is not yet supported for this command. Support is planned for a future release.`,
					);
				}

				const client = getClient(opts);
				const range = parseTimeRange(opts.before, opts.after);
				const rows = await fetchTokenTransfers(client, id.address, {
					limit: Number.parseInt(opts.limit, 10),
					minBlockTimestamp: range.minTimestamp,
					maxBlockTimestamp: range.maxTimestamp,
					onlyConfirmed: localOpts.confirmed,
				});

				const sorted = sortTokenTransfers(rows, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});

				printListResult(sorted, renderTransferList, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
				});
			}
		});
}
```

Key changes from original:
- `UncenteredTransferRow` → `TransferRow`
- `renderUncenteredTransferList` → `renderTransferList` (no subjectAddress for token-scoped)
- `fetchTokenTransfers` now includes `token_address`, `token_symbol`, `block_number` in each row
- `tokenInfo` extracted from `infoMap` to get both `decimals` and `symbol`

- [ ] **Step 2: Update tests/commands/token-transfers.test.ts**

The test changes are minimal — add assertions for the new fields (`token_symbol`, `token_address`, `block_number`) in `fetchTokenTransfers` tests, and update the `buildRow`/`mkRow` fixture to produce `TransferRow` shape.

Edit the `fetchTokenTransfers` test: add assertions after the existing ones:

In the test `"parses Transfer events and converts hex addresses to Base58"`, after the existing assertions, add:

```typescript
expect(row?.token_symbol).toBe("USDT");
expect(row?.token_address).toBe(CONTRACT_ADDRESS);
expect(row?.block_number).toBe(81882707);
```

Update `buildRow` to return `TransferRow`-compatible shape:

```typescript
function buildRow(): TransferRow {
	return {
		tx_id: "tx_x",
		block_number: 1,
		block_timestamp: 1000,
		from: "TFromAddrxxxxxxxxxxxxxxxxxxxxxxxxxx",
		to: "TToAddrxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		value: "1000000",
		value_unit: "raw",
		decimals: 6,
		value_major: "1.0",
		token_address: CONTRACT_ADDRESS,
		token_symbol: "USDT",
	};
}

function mkRow(overrides: Partial<TransferRow>): TransferRow {
	return { ...buildRow(), ...overrides };
}
```

Also update the import to include `TransferRow`:

```typescript
import type { TransferRow } from "../../src/output/transfers.js";
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun test tests/commands/token-transfers.test.ts`

Expected: ALL PASS.

- [ ] **Step 4: Run full test suite**

Run: `bun test`

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/token/transfers.ts tests/commands/token-transfers.test.ts
git commit -m "refactor: migrate token transfers to unified TransferRow + renderTransferList

fetchTokenTransfers now returns TransferRow[] with token_symbol,
token_address, and block_number fields. Amount column displays symbol
as unit suffix (e.g. '1,000.53 USDT')."
```

---

## Task 4: Remove deprecated code

**Files:**
- Modify: `src/output/transfers.ts` (remove old types + renderers)
- Modify: `tests/output/transfers.test.ts` (remove old test blocks)

- [ ] **Step 1: Clean up src/output/transfers.ts**

Remove the following from the file:
- `CenteredTransferRow` interface (lines 21–33)
- `renderCenteredTransferList` function (lines 44–76)
- `UncenteredTransferRow` interface (lines 83–91)
- `renderUncenteredTransferList` function (lines 99–133)
- The `formatTimestamp` import (line 3 — no remaining consumers in this file)

Keep:
- The `muted` import
- The `addThousandsSep`, `alignNumber`, `computeColumnWidths`, `renderColumns`, `truncateAddress`, `visibleLength` imports from `./columns.js`
- `formatListTimestamp` local function
- `TransferRow` interface
- `renderTransferList` function

Also remove JSDoc comments that reference the old types (the "Forward-pointing note" in the old `renderCenteredTransferList`).

- [ ] **Step 2: Clean up tests/output/transfers.test.ts**

Remove the following test blocks:
- `describe("renderCenteredTransferList", ...)` (lines 9–91)
- `describe("renderUncenteredTransferList", ...)` (lines 93–157)

Remove old type imports (`CenteredTransferRow`, `renderCenteredTransferList`, `renderUncenteredTransferList`, `UncenteredTransferRow`).

Keep: `describe("renderTransferList", ...)` block from Task 1.

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun test`

Expected: All tests pass. Test count drops by the removed tests but no failures.

- [ ] **Step 4: Verify no remaining references to old types**

Run: `grep -r "CenteredTransferRow\|UncenteredTransferRow\|renderCenteredTransferList\|renderUncenteredTransferList" src/ tests/`

Expected: No matches in `src/` or `tests/`. (Matches in `docs/` are expected — design/plan docs reference historical names.)

- [ ] **Step 5: Commit**

```bash
git add src/output/transfers.ts tests/output/transfers.test.ts
git commit -m "refactor: remove deprecated CenteredTransferRow/UncenteredTransferRow and old renderers

All consumers migrated to unified TransferRow + renderTransferList.
Old centered/uncentered split is retired."
```

---

## Task 5: Update docs

**Files:**
- Modify: `docs/designs/transfer-list-display.md`
- Modify: `docs/handoff.md`

- [ ] **Step 1: Update transfer-list-display.md lifecycle**

Change line 1 from:
```
<!-- lifecycle: draft -->
```
to:
```
<!-- lifecycle: living -->
```

Update the Migration section to mark it as completed:

In the "Migration from Centered/Uncentered" section, add at the top:

```markdown
> **Status:** Migration complete. `CenteredTransferRow` and `UncenteredTransferRow` retired.
```

- [ ] **Step 2: Update handoff.md**

In the State table, update:
- `Pending cross-cut` row: remove "Transfer list display redesign (P0 implementation pending)" or mark as completed

Add to the Decision ledger under **Phase F implementation** (or a new section if appropriate):

```markdown
- Transfer list display P0: unified `renderTransferList(rows, subjectAddress?)` replaces centered/uncentered split; `TransferRow` replaces `CenteredTransferRow`/`UncenteredTransferRow`; subject-address muting, header row, thousands separators, token symbol in Amount column → [`docs/designs/transfer-list-display.md`](./designs/transfer-list-display.md)
```

Update the test count to reflect current passing count.

- [ ] **Step 3: Commit**

```bash
git add docs/designs/transfer-list-display.md docs/handoff.md
git commit -m "docs: mark transfer list display P0 as complete

transfer-list-display.md lifecycle draft → living.
handoff.md updated with decision ledger entry and state."
```
