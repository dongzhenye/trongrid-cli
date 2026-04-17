import { muted } from "./colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "./columns.js";
import { formatListTimestamp } from "./format.js";

/**
 * Transfer row type for `account transfers`, `token transfers`,
 * `contract transfers`.
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
