import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";

interface TxViewData {
	tx_id: string;
	block_number: number;
	timestamp: number;
	status: string;
	contract_type: string;
	fee: number;
	fee_unit: "sun";
	fee_trx: string;
	energy_used: number;
}

export async function fetchTxView(client: ApiClient, hash: string): Promise<TxViewData> {
	const [tx, info] = await Promise.all([
		client.post<{
			txID: string;
			raw_data: {
				contract: Array<{ type: string }>;
				timestamp: number;
			};
		}>("/wallet/gettransactionbyid", { value: hash }),
		client.post<{
			id: string;
			blockNumber: number;
			receipt: { result?: string; energy_usage_total?: number };
			fee?: number;
		}>("/wallet/gettransactioninfobyid", { value: hash }),
	]);

	if (!tx.txID) {
		throw new Error(`Transaction not found: ${hash}`);
	}

	const fee = info.fee ?? 0;

	return {
		tx_id: tx.txID,
		block_number: info.blockNumber,
		timestamp: tx.raw_data.timestamp,
		status: info.receipt.result ?? "UNKNOWN",
		contract_type: tx.raw_data.contract[0]?.type ?? "Unknown",
		fee: fee,
		fee_unit: "sun",
		fee_trx: sunToTrx(fee),
		energy_used: info.receipt.energy_usage_total ?? 0,
	};
}

export function registerTxCommands(parent: Command): void {
	const tx = parent.command("tx").description("Transaction queries");

	tx.command("view")
		.description("View transaction details by hash")
		.argument("<hash>", "Transaction hash")
		.action(async (hash: string) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const client = getClient(opts);
				const data = await fetchTxView(client, hash);

				printResult(
					data,
					[
						["TX Hash", data.tx_id],
						["Block", String(data.block_number)],
						["Time", new Date(data.timestamp).toISOString()],
						["Status", data.status],
						["Type", data.contract_type],
						["Fee", `${data.fee_trx} TRX`],
						["Energy Used", String(data.energy_used)],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTxView(err),
				});
			}
		});
}

function hintForTxView(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	if (err.message.toLowerCase().includes("transaction not found")) {
		return "Check the hash is correct. If it was recently broadcast, wait a few seconds and retry. If it was on testnet, try --network shasta or --network nile.";
	}
	return undefined;
}
