import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { formatTimestamp, printResult, reportErrorAndExit } from "../../output/format.js";
import { type BlockIdentifier, detectBlockIdentifier } from "../../utils/block-identifier.js";

export interface BlockViewData {
	block_id: string;
	number: number;
	timestamp: number;
	witness_address: string;
	parent_hash: string;
	tx_count: number;
}

interface RawBlock {
	blockID?: string;
	block_header?: {
		raw_data?: {
			number?: number;
			timestamp?: number;
			witness_address?: string;
			parentHash?: string;
		};
	};
	transactions?: unknown[];
}

export async function fetchBlockView(
	client: ApiClient,
	id: BlockIdentifier,
	opts: { confirmed: boolean },
): Promise<BlockViewData> {
	const prefix = opts.confirmed ? "/walletsolidity" : "/wallet";
	const path = id.kind === "number" ? `${prefix}/getblockbynum` : `${prefix}/getblockbyid`;
	const body = id.kind === "number" ? { num: id.value } : { value: id.value };

	const raw = await client.post<RawBlock>(path, body);

	if (!raw.blockID || !raw.block_header?.raw_data) {
		const label = id.kind === "number" ? `number ${id.value}` : `hash ${id.value}`;
		throw new Error(`Block not found: ${label}.`);
	}

	const rd = raw.block_header.raw_data;
	return {
		block_id: raw.blockID,
		number: rd.number ?? 0,
		timestamp: rd.timestamp ?? 0,
		witness_address: rd.witness_address ?? "",
		parent_hash: rd.parentHash ?? "",
		tx_count: raw.transactions?.length ?? 0,
	};
}

function hintForBlockView(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("block not found")) {
		return "Check the block number or hash. If this is on a testnet, pass --network shasta or --network nile.";
	}
	if (msg.includes("invalid block identifier")) {
		return "Pass a block number (digits) or block hash (64 hex chars, optional 0x prefix).";
	}
	return undefined;
}

export function registerBlockViewCommand(block: Command, parent: Command): void {
	block
		.command("view")
		.description("View a block by number or hash")
		.argument("<number|hash>", "Block number (digits) or block hash (64 hex chars)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid block view 70000000
  $ trongrid block view <64-hex-char-block-id>
  $ trongrid block view 70000000 --json
  $ trongrid block view 70000000 --confirmed       # irreversible state (~60s lag)
`,
		)
		.action(async (identifier: string) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectBlockIdentifier(identifier);
				const client = getClient(opts);
				const data = await fetchBlockView(client, id, { confirmed: opts.confirmed });

				printResult(
					data,
					[
						["Block", String(data.number)],
						["Block ID", data.block_id],
						["Parent Hash", data.parent_hash],
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
					hint: hintForBlockView(err),
				});
			}
		});
}
