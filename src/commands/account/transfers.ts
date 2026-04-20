import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { renderTransferList, type TransferRow } from "../../output/transfers.js";
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
	fieldTypes: {
		block_timestamp: "number",
		block_number: "number",
		value: "bigint",
	},
	tieBreakField: "block_timestamp",
};

/**
 * Thin wrapper over {@link applySort} + {@link TRANSFERS_SORT_CONFIG}.
 * Exported so tests can exercise the sort config (default field, tie-break,
 * unknown-field UsageError) without going through commander.
 */
export function sortTransfers(items: TransferRow[], opts: SortOptions): TransferRow[] {
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
		const limit = Number.parseInt(opts.limit, 10);
		const rows = await fetchAccountTransfers(client, resolved, {
			limit,
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
			limit,
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
