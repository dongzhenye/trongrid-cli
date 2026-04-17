import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
	addThousandsSep,
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../../output/columns.js";
import { printListResult, reportErrorAndExit, UsageError } from "../../output/format.js";
import { applySort, type SortConfig } from "../../utils/sort.js";
import { detectTokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface HolderRow {
	rank: number;
	address: string;
	balance: string;
	decimals: number;
	balance_major: string;
	share_pct: string; // "15.25"
}

interface HoldersResponse {
	data?: Record<string, string>[];
}

/**
 * Fetch top holders for a TRC-20 contract.
 *
 * The endpoint returns an array of single-entry maps:
 *   [{"TKHu...": "60000000000000"}, {"TWd4...": "40000000000000"}]
 *
 * share_pct uses BigInt arithmetic to avoid floating-point precision loss on
 * large supply values (e.g. 1e27 for BTT). We compute basis points first:
 *   bps = (balance * 10000n) / totalSupply
 * then divide by 100 to get a percentage string with 2 decimal places.
 */
export async function fetchTokenHolders(
	client: ApiClient,
	contractAddress: string,
	opts: { limit: number },
): Promise<HolderRow[]> {
	const params = new URLSearchParams();
	params.set("limit", String(opts.limit));
	params.set("order_by", "balance,desc");

	const path = `/v1/contracts/${contractAddress}/tokens?${params.toString()}`;
	const raw = await client.get<HoldersResponse>(path);

	const entries = raw.data ?? [];
	if (entries.length === 0) return [];

	// Fetch token metadata (decimals + totalSupply) for the contract.
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 0;
	const totalSupply = BigInt(info?.total_supply ?? "0");

	const rows: HolderRow[] = [];
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;

		// Each entry is a single-key map: { "TAddress...": "rawBalance" }
		const [address, rawBalance] = Object.entries(entry)[0] ?? [];
		if (!address || !rawBalance) continue;

		const balance = rawBalance;
		const balance_major = formatMajor(balance, decimals);

		// Share percentage via BigInt to avoid precision loss.
		let share_pct = "0.00";
		if (totalSupply > 0n) {
			try {
				const balanceBig = BigInt(balance);
				const bps = (balanceBig * 10000n) / totalSupply;
				share_pct = (Number(bps) / 100).toFixed(2);
			} catch {
				// Non-numeric balance — leave share_pct as "0.00"
			}
		}

		rows.push({
			rank: i + 1,
			address,
			balance,
			decimals,
			balance_major,
			share_pct,
		});
	}

	return rows;
}

const HOLDERS_SORT_CONFIG: SortConfig<HolderRow> = {
	defaultField: "rank",
	fieldDirections: {
		rank: "asc",
		balance: "desc",
	},
	fieldTypes: {
		rank: "number",
		balance: "bigint",
	},
	tieBreakField: "rank",
};

export function sortHolders(
	items: HolderRow[],
	opts: { sortBy?: string; reverse?: boolean },
): HolderRow[] {
	return applySort(items, HOLDERS_SORT_CONFIG, opts);
}

/**
 * Render token holders as a ranked table.
 *
 * Columns: rank | address (truncated) | balance_major | share%
 *
 * Alignment rules (per feedback_human_render_alignment):
 *   - rank: right-aligned
 *   - address: left-aligned (both-ends truncated, 4+4)
 *   - balance_major: right-aligned
 *   - share_pct: right-aligned
 */
export function renderHolderList(items: HolderRow[]): void {
	if (items.length === 0) {
		console.log(muted("No holders found."));
		return;
	}

	const noun = items.length === 1 ? "holder" : "holders";
	console.log(muted(`Found ${items.length} ${noun}:\n`));

	const header = ["#", "Address", "Balance", "Share"];
	const cells: string[][] = items.map((r) => [
		String(r.rank),
		truncateAddress(r.address),
		addThousandsSep(r.balance_major),
		`${r.share_pct}%`,
	]);

	// Include header in width calculation
	const allRows = [header, ...cells];
	const widths = computeColumnWidths(allRows);

	// Right-align rank, balance, share columns (indices 0, 2, 3)
	for (const row of allRows) {
		for (const col of [0, 2, 3]) {
			row[col] = alignNumber(row[col] ?? "", widths[col] ?? 0);
		}
	}

	const lines = renderColumns(allRows, widths);
	// First line is header — render muted
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

export function registerTokenHoldersCommand(token: Command, parent: Command): void {
	token
		.command("holders")
		.description("List top TRC-20 token holders with balance and share percentage")
		.helpGroup("Read commands:")
		.argument("<id|address|symbol>", "TRC-20 Base58 contract address or known symbol")
		.option("--type <type>", "force token standard (trc10|trc20|trc721|trc1155)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token holders USDT
  $ trongrid token holders TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid token holders USDT --limit 20
  $ trongrid token holders USDT --json

Sort:
  default — balance desc (largest holder first)
  fields  — balance (desc), rank (asc)
`,
		)
		.action(async (input: string, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(input, localOpts.type);

				if (id.type === "trx") {
					throw new UsageError(
						"TRX holder ranking is not available on TronGrid.",
						// Hint is passed separately via reportErrorAndExit
					);
				}
				if (id.type === "trc10" || id.type === "trc721" || id.type === "trc1155") {
					throw new UsageError(
						`${id.type.toUpperCase()} is not yet supported for this command. Support is planned for a future release.`,
					);
				}

				const client = getClient(opts);
				const rows = await fetchTokenHolders(client, id.address, {
					limit: Number.parseInt(opts.limit, 10),
				});
				const sorted = sortHolders(rows, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderHolderList, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				const hint = hintForTokenHolders(err);
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint,
				});
			}
		});
}

export function hintForTokenHolders(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("trx holder ranking")) {
		return "TRX holder ranking requires indexed data not available on TronGrid. Support depends on a future product decision.";
	}
	if (msg.includes("not yet supported for this command")) {
		return "Support is planned for a future release.";
	}
	return undefined;
}
