import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printError, printResult } from "../../output/format.js";

interface BlockData {
	block_id: string;
	number: number;
	timestamp: number;
	witness_address: string;
	tx_count: number;
}

export async function fetchLatestBlock(client: ApiClient): Promise<BlockData> {
	const raw = await client.post<{
		blockID: string;
		block_header: {
			raw_data: {
				number: number;
				timestamp: number;
				witness_address: string;
			};
		};
		transactions?: unknown[];
	}>("/wallet/getnowblock");

	return {
		block_id: raw.blockID,
		number: raw.block_header.raw_data.number,
		timestamp: raw.block_header.raw_data.timestamp,
		witness_address: raw.block_header.raw_data.witness_address,
		tx_count: raw.transactions?.length ?? 0,
	};
}

export function registerBlockCommands(parent: Command): void {
	const block = parent.command("block").description("Block queries");

	block
		.command("latest")
		.description("Get the latest block (chain head)")
		.action(async () => {
			// Lazy import to avoid triggering program.parse() during tests
			const { getClient, parseFields } = await import("../../index.js");

			const opts = parent.opts<GlobalOptions>();
			try {
				const client = getClient(opts);
				const data = await fetchLatestBlock(client);

				printResult(
					data as unknown as Record<string, unknown>,
					[
						["Block", String(data.number)],
						["Block ID", data.block_id],
						["Time", new Date(data.timestamp).toISOString()],
						["Producer", data.witness_address],
						["Transactions", String(data.tx_count)],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				printError(err instanceof Error ? err.message : String(err), {
					json: opts.json,
					verbose: opts.verbose,
					upstream: (err as { upstream?: unknown }).upstream,
				});
				process.exit(1);
			}
		});
}
