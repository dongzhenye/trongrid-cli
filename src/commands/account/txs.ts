import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
	formatTimestamp,
	printListResult,
	reportErrorAndExit,
	sunToTrx,
} from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";

export interface AccountTxRow {
	tx_id: string;
	block_number: number;
	timestamp: number;
	contract_type: string;
	status: string;
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
	raw_data?: { contract?: Array<{ type?: string }> };
	ret?: Array<{ contractRet?: string }>;
}

interface AccountTxsResponse {
	data?: RawTx[];
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
		return {
			tx_id: tx.txID ?? "",
			block_number: tx.blockNumber ?? 0,
			timestamp: tx.block_timestamp ?? 0,
			contract_type: tx.raw_data?.contract?.[0]?.type ?? "Unknown",
			status: tx.ret?.[0]?.contractRet ?? "UNKNOWN",
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
	},
	tieBreakField: "timestamp",
};

export function sortTxs(items: AccountTxRow[], opts: SortOptions): AccountTxRow[] {
	return applySort(items, TXS_SORT_CONFIG, opts);
}

function renderTxs(items: AccountTxRow[]): void {
	if (items.length === 0) {
		console.log(muted("No transactions found."));
		return;
	}
	console.log(muted(`Found ${items.length} transactions:\n`));
	for (const t of items) {
		const time = formatTimestamp(t.timestamp);
		const fee = `${t.fee_trx} TRX`;
		console.log(`  ${t.tx_id}  ${muted(time)}  ${t.contract_type}  ${muted(fee)}`);
	}
}

export function registerAccountTxsCommand(account: Command, parent: Command): void {
	account
		.command("txs")
		.description("List transaction history for an address")
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
  fields  — timestamp, block_number, fee (all default desc)
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

				printListResult(sorted, renderTxs, { json: opts.json, fields: parseFields(opts) });
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: addressErrorHint(err),
				});
			}
		});
}
