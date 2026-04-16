import { muted } from "./colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
	visibleLength,
} from "./columns.js";
import { formatTimestamp } from "./format.js";

/**
 * Row type for a **centered** transfer list — a list of token transfers
 * queried with an implicit subject account (e.g. `account transfers TR...`).
 *
 * **Do not reuse for uncentered transfer lists** (`token transfers`,
 * `tx transfers`, `block transfers` in future phases): those have a
 * different row shape without a `direction` field, because `from` and
 * `to` are peers there. See memory feedback_transfer_list_two_styles.
 */
export interface CenteredTransferRow {
	tx_id: string;
	block_number: number;
	timestamp: number; // unix ms
	direction: "out" | "in";
	counterparty: string; // the "other" address (not the queried subject)
	token_address: string;
	token_symbol?: string;
	amount: string;
	amount_unit: "raw";
	decimals: number;
	amount_major: string;
}

/**
 * Human-mode renderer for centered transfer lists. Composes column
 * primitives from `./columns.ts` to produce a vertically-aligned table.
 *
 * **Forward-pointing note:** Phase E will add `renderUncenteredTransferList`
 * alongside this export for `token transfers` / `tx transfers`. The file
 * is deliberately named `transfers.ts` (not `centered-transfers.ts`) so
 * the uncentered variant can live next to this one without moving files.
 */
export function renderCenteredTransferList(rows: CenteredTransferRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No transfers found."));
		return;
	}
	const headerNoun = rows.length === 1 ? "transfer" : "transfers";
	console.log(muted(`Found ${rows.length} ${headerNoun}:\n`));

	// Column order: time | direction | amount | symbol | arrow | counterparty | tx_id
	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.timestamp),
		r.direction,
		r.amount_major,
		r.token_symbol ?? truncateAddress(r.token_address),
		r.direction === "out" ? "→" : "←",
		truncateAddress(r.counterparty),
		truncateAddress(r.tx_id, 4, 4), // tx hashes aren't spoofable — keep short
	]);

	// Right-align amount column to max width in the batch.
	const amountCol = 2;
	const amountWidth = Math.max(...cells.map((c) => visibleLength(c[amountCol] ?? "")));
	for (const row of cells) {
		const cur = row[amountCol] ?? "";
		row[amountCol] = alignNumber(cur, amountWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

/**
 * Row type for an **uncentered** transfer list — from and to are peers,
 * no direction column. Used by `token transfers`, future `tx transfers`.
 * See memory feedback_transfer_list_two_styles.
 */
export interface UncenteredTransferRow {
	tx_id: string;
	block_timestamp: number; // unix ms
	from: string;
	to: string;
	value: string; // raw
	decimals: number;
	value_major: string;
}

/**
 * Human-mode renderer for uncentered transfer lists. `from` and `to`
 * shown as peers with a → separator. No direction column.
 *
 * Column order: time | from | → | to | value_major | tx_id
 */
export function renderUncenteredTransferList(rows: UncenteredTransferRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No transfers found."));
		return;
	}
	const headerNoun = rows.length === 1 ? "transfer" : "transfers";
	console.log(muted(`Found ${rows.length} ${headerNoun}:\n`));

	const header = ["Time", "From", "", "To", "Amount", "TX"];
	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.block_timestamp),
		truncateAddress(r.from),
		"→",
		truncateAddress(r.to),
		addThousandsSep(r.value_major),
		truncateAddress(r.tx_id, 4, 4), // tx hashes aren't spoofable — keep short
	]);

	const allRows = [header, ...cells];

	// Right-align amount column
	const valueCol = 4;
	const valueWidth = Math.max(...allRows.map((c) => visibleLength(c[valueCol] ?? "")));
	for (const row of allRows) {
		const cur = row[valueCol] ?? "";
		row[valueCol] = alignNumber(cur, valueWidth);
	}

	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

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
	// Unit width varies per row (token_symbol or truncated token_address);
	// track max so the header can right-align to the full data cell width.
	const amountIdx = header.indexOf("Amount");
	const numWidth = Math.max(...amountNums.map((s) => s.length));
	let maxUnitWidth = 0;
	for (let i = 1; i < allRows.length; i++) {
		const row = allRows[i]!;
		const r = rows[i - 1]!;
		const unit = r.token_symbol ?? truncateAddress(r.token_address);
		if (unit.length > maxUnitWidth) maxUnitWidth = unit.length;
		row[amountIdx] = `${alignNumber(row[amountIdx] ?? "", numWidth)} ${unit}`;
	}
	// Right-align header to full data cell width (number + space + widest unit).
	allRows[0]![amountIdx] = alignNumber(allRows[0]![amountIdx] ?? "", numWidth + 1 + maxUnitWidth);

	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}
