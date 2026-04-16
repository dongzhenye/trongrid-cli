import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { fail, muted, pass } from "../../output/colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../../output/columns.js";
import { printListResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";
import { humanTxType } from "../../output/tx-type-map.js";
import { hexToBase58 } from "../../utils/address.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";

export interface AccountTxRow {
	tx_id: string;
	block_number: number;
	timestamp: number;
	contract_type: string; // raw chain type (for JSON)
	type_display: string; // human label (from tx-type-map or method name)
	method?: string; // ABI method name if resolved
	method_selector?: string; // 4-byte hex if TriggerSmartContract
	from: string; // owner_address (tx initiator)
	to: string; // target address (contract_address or to_address)
	amount: number; // native TRX value (call_value or amount), in sun
	amount_unit: "sun";
	amount_trx: string; // formatted
	status: string; // "SUCCESS", "REVERT", etc.
	confirmed: boolean; // true if confirmed on chain
	fee: number;
	fee_unit: "sun";
	decimals: 6;
	fee_trx: string;
}

interface RawTx {
	txID?: string;
	blockNumber?: number;
	block_timestamp?: number;
	net_fee?: number;
	energy_fee?: number;
	raw_data?: {
		contract?: Array<{
			type?: string;
			parameter?: {
				value?: {
					owner_address?: string;
					to_address?: string;
					contract_address?: string;
					amount?: number;
					call_value?: number;
					data?: string;
				};
			};
		}>;
	};
	ret?: Array<{ contractRet?: string }>;
}

interface AccountTxsResponse {
	data?: RawTx[];
}

/**
 * Derive the human-readable type_display from contract_type and call data.
 *
 * - TriggerSmartContract with data → `0x{selector}` (4-byte hex)
 * - TriggerSmartContract without data → "Contract Call"
 * - Other types → humanTxType lookup
 */
function deriveTypeDisplay(contractType: string, data?: string): string {
	if (contractType === "TriggerSmartContract") {
		if (data && data.length >= 8) {
			return `0x${data.slice(0, 8).toLowerCase()}`;
		}
		return "Contract Call";
	}
	return humanTxType(contractType);
}

/**
 * Extract 4-byte method selector from call data hex string.
 * Returns undefined if no data or data is too short.
 */
function extractMethodSelector(data?: string): string | undefined {
	if (!data || data.length < 8) return undefined;
	return `0x${data.slice(0, 8).toLowerCase()}`;
}

/** Convert hex address (41-prefixed) to Base58Check, pass through if already Base58 or empty */
function safeToBase58(addr: string): string {
	if (!addr) return "";
	// Already Base58 (starts with T, 34 chars)
	if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(addr)) return addr;
	// Hex format (41-prefixed or raw)
	try {
		return hexToBase58(addr);
	} catch {
		return addr;
	}
}

export async function fetchAccountTxs(
	client: ApiClient,
	address: string,
	opts: { limit: number },
): Promise<AccountTxRow[]> {
	const path = `/v1/accounts/${address}/transactions?limit=${opts.limit}`;
	const raw = await client.get<AccountTxsResponse>(path);
	return (raw.data ?? []).map((tx) => {
		const fee = (tx.net_fee ?? 0) + (tx.energy_fee ?? 0);
		const contractEntry = tx.raw_data?.contract?.[0];
		const contractType = contractEntry?.type ?? "Unknown";
		const paramValue = contractEntry?.parameter?.value;
		const data = paramValue?.data;
		const amount = paramValue?.call_value ?? paramValue?.amount ?? 0;

		return {
			tx_id: tx.txID ?? "",
			block_number: tx.blockNumber ?? 0,
			timestamp: tx.block_timestamp ?? 0,
			contract_type: contractType,
			type_display: deriveTypeDisplay(contractType, data),
			method: undefined, // resolved later when ABI is available
			method_selector: extractMethodSelector(data),
			from: safeToBase58(paramValue?.owner_address ?? ""),
			to: safeToBase58(paramValue?.to_address ?? paramValue?.contract_address ?? ""),
			amount,
			amount_unit: "sun" as const,
			amount_trx: sunToTrx(amount),
			status: tx.ret?.[0]?.contractRet ?? "UNKNOWN",
			confirmed: true, // API does not provide per-tx confirmed flag; default true
			fee,
			fee_unit: "sun" as const,
			decimals: 6 as const,
			fee_trx: sunToTrx(fee),
		};
	});
}

const TXS_SORT_CONFIG: SortConfig<AccountTxRow> = {
	defaultField: "timestamp",
	fieldDirections: {
		timestamp: "desc",
		block_number: "desc",
		fee: "desc",
		amount: "desc",
	},
	tieBreakField: "timestamp",
};

export function sortTxs(items: AccountTxRow[], opts: SortOptions): AccountTxRow[] {
	return applySort(items, TXS_SORT_CONFIG, opts);
}

/**
 * Format a unix-ms timestamp as `YYYY-MM-DD HH:MM` (UTC, no seconds).
 * The "UTC" label lives in the column header, not repeated per row.
 */
function formatTxTimestamp(ms: number): string {
	return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Human-mode renderer for transaction lists. Supports subject-address
 * muting (From/To matching the queried address are dimmed) and
 * conditional columns (Confirmed, Result) that only appear when the
 * batch contains non-default-state entries.
 */
export function renderTxs(items: AccountTxRow[], subjectAddress?: string): void {
	if (items.length === 0) {
		console.log(muted("No transactions found."));
		return;
	}
	const noun = items.length === 1 ? "transaction" : "transactions";
	console.log(muted(`Found ${items.length} ${noun}:\n`));

	// Detect conditional columns
	const showConfirmed = items.some((t) => !t.confirmed);
	const showResult = items.some((t) => t.status !== "SUCCESS");

	// Build header
	const header: string[] = ["TX", "Time (UTC)"];
	if (showConfirmed) header.push("Confirmed");
	header.push("Type / Method", "From", "", "To", "Amount", "Fee");
	if (showResult) header.push("Result");

	// Build data rows
	const cells: string[][] = items.map((t) => {
		const fromDisplay = truncateAddress(t.from);
		const toDisplay = truncateAddress(t.to);

		const row: string[] = [truncateAddress(t.tx_id, 4, 4), formatTxTimestamp(t.timestamp)];

		if (showConfirmed) {
			row.push(t.confirmed ? pass("\u2713") : "\u231B");
		}

		row.push(
			t.type_display,
			subjectAddress && t.from === subjectAddress ? muted(fromDisplay) : fromDisplay,
			"\u2192",
			subjectAddress && t.to === subjectAddress ? muted(toDisplay) : toDisplay,
			`${addThousandsSep(t.amount_trx)} TRX`,
			`${addThousandsSep(t.fee_trx)} TRX`,
		);

		if (showResult) {
			row.push(t.status === "SUCCESS" ? pass("\u2713") : fail("\u2717"));
		}

		return row;
	});

	const allRows = [header, ...cells];

	// Right-align Amount column (value+unit combined)
	const amountIdx = header.indexOf("Amount");
	if (amountIdx >= 0) {
		const amountWidth = Math.max(...allRows.map((r) => (r[amountIdx] ?? "").length));
		for (const row of allRows) {
			row[amountIdx] = alignNumber(row[amountIdx] ?? "", amountWidth);
		}
	}

	// Right-align Fee column (value+unit combined)
	const feeIdx = header.indexOf("Fee");
	if (feeIdx >= 0) {
		const feeWidth = Math.max(...allRows.map((r) => (r[feeIdx] ?? "").length));
		for (const row of allRows) {
			row[feeIdx] = alignNumber(row[feeIdx] ?? "", feeWidth);
		}
	}

	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

export function registerAccountTxsCommand(account: Command, parent: Command): void {
	account
		.command("txs")
		.description("List transaction history for an address")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account txs TR...
  $ trongrid account txs                         # uses default_address
  $ trongrid account txs TR... --limit 50
  $ trongrid account txs TR... --reverse         # oldest first
  $ trongrid account txs TR... --sort-by fee     # largest fee first

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, fee, amount (all default desc)
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				// NOTE: --confirmed has no effect here — /v1/accounts/:address/transactions has
				// no /walletsolidity mirror. Accepted silently for flag uniformity; tracked in
				// docs/plans/phase-b.md as a follow-up.
				const rows = await fetchAccountTxs(client, resolved, {
					limit: Number.parseInt(opts.limit, 10),
				});
				const sorted = sortTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });

				printListResult(sorted, (items) => renderTxs(items, resolved), {
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
		});
}
