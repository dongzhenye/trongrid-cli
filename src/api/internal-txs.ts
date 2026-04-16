import { muted } from "../output/colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../output/columns.js";
import { formatTimestamp, sunToTrx } from "../output/format.js";
import { hexToBase58 } from "../utils/address.js";
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

/**
 * Internal transactions are embedded inside regular transactions at
 * GET /v1/accounts/{addr}/transactions as `internal_transactions[]`.
 * Each entry has hex addresses (41-prefixed) and a nested data object.
 */
interface RawInternalTx {
	internal_tx_id?: string;
	from_address?: string; // hex 41-prefixed
	to_address?: string; // hex 41-prefixed
	data?: {
		note?: string; // hex-encoded call type, e.g. "63616c6c" = "call"
		rejected?: boolean;
		call_value?: Record<string, number>; // e.g. {"_": 111000000}
	};
}

interface RawTransaction {
	txID?: string;
	block_timestamp?: number;
	internal_transactions?: RawInternalTx[];
}

interface TransactionsResponse {
	data?: RawTransaction[];
}

/** Decode hex-encoded note to string (e.g. "63616c6c" → "call") */
function decodeHexNote(hex: string): string {
	if (!hex) return "call";
	try {
		const bytes = new Uint8Array(hex.length / 2);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
		}
		return new TextDecoder().decode(bytes) || "call";
	} catch {
		return "call";
	}
}

/** Convert hex address to Base58, or return as-is on failure */
function safeHexToBase58(hex: string): string {
	if (!hex) return "";
	try {
		return hexToBase58(hex);
	} catch {
		return hex;
	}
}

export async function fetchInternalTxs(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<InternalTxRow[]> {
	// Fetch regular transactions — internal txs are nested inside each one
	const params = new URLSearchParams();
	// Fetch more parent txs than limit since not all have internals
	params.set("limit", String(Math.min(opts.limit * 3, 200)));
	if (opts.minTimestamp !== undefined) params.set("min_timestamp", String(opts.minTimestamp));
	if (opts.maxTimestamp !== undefined) params.set("max_timestamp", String(opts.maxTimestamp));

	const path = `/v1/accounts/${address}/transactions?${params.toString()}`;
	const raw = await client.get<TransactionsResponse>(path);

	const rows: InternalTxRow[] = [];
	for (const tx of raw.data ?? []) {
		for (const itx of tx.internal_transactions ?? []) {
			const callValue = itx.data?.call_value;
			// call_value is {"_": amount} or {"tokenId": amount}
			const value = callValue ? (Object.values(callValue)[0] ?? 0) : 0;
			rows.push({
				internal_id: itx.internal_tx_id ?? "",
				tx_id: tx.txID ?? "",
				block_timestamp: tx.block_timestamp ?? 0,
				from: safeHexToBase58(itx.from_address ?? ""),
				to: safeHexToBase58(itx.to_address ?? ""),
				call_type: decodeHexNote(itx.data?.note ?? ""),
				value,
				value_unit: "sun" as const,
				decimals: 6 as const,
				value_trx: sunToTrx(value),
				rejected: itx.data?.rejected ?? false,
			});
		}
	}

	// Return up to limit internal txs
	return rows.slice(0, opts.limit);
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
