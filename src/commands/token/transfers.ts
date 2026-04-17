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
