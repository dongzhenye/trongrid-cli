import { muted } from "../output/colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../output/columns.js";
import { formatTimestamp, sunToTrx } from "../output/format.js";
import { applySort, type SortConfig, type SortOptions } from "../utils/sort.js";
import type { ApiClient } from "./client.js";

export interface InternalTxRow {
	internal_id: string;
	tx_id: string;
	block_timestamp: number;
	from: string;
	to: string;
	call_type: string;
	value: number;
	value_unit: "sun";
	decimals: 6;
	value_trx: string;
	rejected: boolean;
}

interface RawInternalTx {
	internal_id?: string;
	hash?: string;
	block_timestamp?: number;
	caller_address?: string;
	transferTo_address?: string;
	callValueInfo?: Array<{ callValue?: number }>;
	call_type?: string;
	rejected?: boolean;
}

interface InternalTxsResponse {
	data?: RawInternalTx[];
}

export async function fetchInternalTxs(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<InternalTxRow[]> {
	const params = new URLSearchParams();
	params.set("limit", String(opts.limit));
	if (opts.minTimestamp !== undefined) params.set("min_timestamp", String(opts.minTimestamp));
	if (opts.maxTimestamp !== undefined) params.set("max_timestamp", String(opts.maxTimestamp));

	const path = `/v1/accounts/${address}/transactions/internal?${params.toString()}`;
	const raw = await client.get<InternalTxsResponse>(path);

	return (raw.data ?? []).map((tx) => {
		const value = tx.callValueInfo?.[0]?.callValue ?? 0;
		return {
			internal_id: tx.internal_id ?? "",
			tx_id: tx.hash ?? "",
			block_timestamp: tx.block_timestamp ?? 0,
			from: tx.caller_address ?? "",
			to: tx.transferTo_address ?? "",
			call_type: tx.call_type ?? "call",
			value,
			value_unit: "sun" as const,
			decimals: 6 as const,
			value_trx: sunToTrx(value),
			rejected: tx.rejected ?? false,
		};
	});
}

const INTERNAL_TXS_SORT_CONFIG: SortConfig<InternalTxRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		value: "desc",
		call_type: "asc",
	},
	tieBreakField: "block_timestamp",
};

export function sortInternalTxs(items: InternalTxRow[], opts: SortOptions): InternalTxRow[] {
	return applySort(items, INTERNAL_TXS_SORT_CONFIG, opts);
}

export function renderInternalTxs(rows: InternalTxRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No internal transactions found."));
		return;
	}
	const noun = rows.length === 1 ? "internal transaction" : "internal transactions";
	console.log(muted(`Found ${rows.length} ${noun}:\n`));

	const header = ["Time", "Type", "From", "", "To", "Value", "Unit", "TX"];
	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.block_timestamp),
		r.rejected ? `${r.call_type} [rejected]` : r.call_type,
		truncateAddress(r.from),
		"→",
		truncateAddress(r.to),
		addThousandsSep(r.value_trx),
		"TRX",
		truncateAddress(r.tx_id, 4, 4),
	]);

	const allRows = [header, ...cells];

	// Right-align value column
	const valueCol = 5;
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
