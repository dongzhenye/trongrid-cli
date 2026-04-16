import { muted } from "./colors.js";
import { alignNumber, computeColumnWidths, renderColumns, truncateAddress } from "./columns.js";
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
		r.token_symbol ?? truncateAddress(r.token_address, 4, 4),
		r.direction === "out" ? "→" : "←",
		truncateAddress(r.counterparty, 4, 4),
		truncateAddress(r.tx_id, 4, 4),
	]);

	// Right-align amount column to max width in the batch.
	const amountCol = 2;
	const amountWidth = Math.max(...cells.map((c) => (c[amountCol] ?? "").length));
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
		truncateAddress(r.from, 4, 4),
		"→",
		truncateAddress(r.to, 4, 4),
		r.value_major,
		truncateAddress(r.tx_id, 4, 4),
	]);

	const allRows = [header, ...cells];

	// Right-align amount column
	const valueCol = 4;
	const valueWidth = Math.max(...allRows.map((c) => (c[valueCol] ?? "").length));
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
