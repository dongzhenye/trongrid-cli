import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { formatTimestamp, printResult, reportErrorAndExit } from "../../output/format.js";

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

export function registerBlockCommands(parent: Command): Command {
	const block = parent.command("block").description("Block queries").helpGroup("Read commands:");

	block
		.command("latest")
		.description("Get the latest block (chain head) (typical first step)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid block latest
  $ trongrid block latest --json
  $ trongrid block latest --fields number,block_id
`,
		)
		.action(async () => {
			// Lazy import to avoid triggering program.parse() during tests
			const { getClient, parseFields } = await import("../../index.js");

			const opts = parent.opts<GlobalOptions>();
			try {
				const client = getClient(opts);
				const data = await fetchLatestBlock(client);

				printResult(
					data,
					[
						["Block", String(data.number)],
						["Block ID", data.block_id],
						["Time", formatTimestamp(data.timestamp)],
						["Producer", data.witness_address],
						["Transactions", String(data.tx_count)],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
				});
			}
		});

	return block;
}
