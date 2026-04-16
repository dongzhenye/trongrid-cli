import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info, type Trc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../../output/columns.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { formatMajor, resolveTrc10Decimals, resolveTrc20Decimals } from "../../utils/tokens.js";

// Fields follow scenario S2 from docs/designs/units.md:
// {head} + decimals + {head}_major. The head is `balance` because this
// represents an address's available token balance (TIP-20 `balanceOf`
// return-parameter convention). Covers both TRC-20 and TRC-10 since both
// are class S2 scalable quantities.
export interface TokenBalance {
	type: "TRC20" | "TRC10";
	contract_address: string;
	balance: string;
	decimals?: number; // Undefined only on lookup failure.
	balance_major?: string; // Undefined only on lookup failure.
	symbol?: string;
	name?: string;
}

// /v1/accounts/:address returns the account object directly in data[0]
interface AccountV1Response {
	data?: Array<{
		trc20?: Array<Record<string, string>>; // [{contractAddr: balanceStr}, ...]
		assetV2?: Array<{ key: string; value: number }>; // TRC10 tokens
	}>;
}

/**
 * Human-mode renderer for a list of token balances. Emits an empty-state
 * message when the list is empty, a "Found N tokens" header otherwise,
 * and one `[TYPE] SYMBOL (contract) balance (raw N)` line per token.
 *
 * Column layout (Trial #6/#7):
 * - Symbol shown when available; [?] when decimals unresolved; empty otherwise.
 * - Contract address in parentheses, both-ends truncated (4+4).
 * - Raw annotation suppressed when balance_major === balance (decimals=0 case).
 *
 * Exported for testing — the command action passes this as the human
 * callback to `printListResult`.
 */
export function renderTokenList(tokens: TokenBalance[]): void {
	if (tokens.length === 0) {
		console.log(muted("No tokens found."));
		return;
	}
	const noun = tokens.length === 1 ? "token" : "tokens";
	console.log(muted(`Found ${tokens.length} ${noun}:\n`));

	// Column order: type tag | symbol | contract (truncated) | balance | raw annotation
	const header = ["Type", "Symbol", "Contract", "Balance", ""];
	const cells: string[][] = tokens.map((t) => {
		const symbolCol = t.symbol ?? (t.decimals === undefined ? "[?]" : "");
		const contractCol = `(${truncateAddress(t.contract_address, 4, 4)})`;
		const balanceCol = t.balance_major ?? t.balance;

		// Trial #7: suppress redundant raw when major equals raw (e.g. decimals=0)
		// Trial #6: show "(decimals unresolved)" instead of raw annotation on failure
		let rawAnnotation = "";
		if (t.decimals === undefined) {
			rawAnnotation = muted("(decimals unresolved)");
		} else if (t.balance_major !== undefined && t.balance_major !== t.balance) {
			rawAnnotation = muted(`(raw ${t.balance})`);
		}

		return [`[${t.type}]`, symbolCol, contractCol, balanceCol, rawAnnotation];
	});

	const allRows = [header, ...cells];
	const balanceColIdx = 3;
	const balanceWidth = Math.max(...allRows.map((c) => (c[balanceColIdx] ?? "").length));
	for (const row of allRows) {
		const cur = row[balanceColIdx] ?? "";
		row[balanceColIdx] = alignNumber(cur, balanceWidth);
	}

	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

export async function fetchAccountTokens(
	client: ApiClient,
	address: string,
): Promise<TokenBalance[]> {
	const raw = await client.get<AccountV1Response>(`/v1/accounts/${address}`);

	const account = raw.data?.[0];
	if (!account) return [];

	const results: TokenBalance[] = [];

	// TRC20: [{contract_address: balanceStr}, ...]
	for (const entry of account.trc20 ?? []) {
		for (const [contract_address, balance] of Object.entries(entry)) {
			results.push({ type: "TRC20", contract_address, balance });
		}
	}

	// TRC10 (assetV2): [{key: tokenId, value: amount}, ...]
	for (const asset of account.assetV2 ?? []) {
		results.push({ type: "TRC10", contract_address: asset.key, balance: String(asset.value) });
	}

	// Batch-fetch TRC-20 metadata (symbol, name, decimals) in one request
	// to avoid N individual on-chain calls. Gracefully degrade to individual
	// resolver on failure so a single endpoint outage doesn't block the command.
	const trc20Addresses = results.filter((t) => t.type === "TRC20").map((t) => t.contract_address);

	let batchInfo: Map<string, Trc20Info> = new Map();
	try {
		batchInfo = await fetchBatchTrc20Info(client, trc20Addresses);
	} catch {
		// Silently fall through — all TRC-20 entries will use the individual resolver.
	}

	// Resolve decimals for BOTH TRC-20 and TRC-10 in parallel. TRC-20 prefers
	// batch metadata; falls back to individual on-chain call on batch miss.
	await Promise.all(
		results.map(async (t) => {
			try {
				if (t.type === "TRC20") {
					const info = batchInfo.get(t.contract_address);
					if (info) {
						// Batch hit: populate all metadata fields at once.
						t.decimals = info.decimals;
						t.symbol = info.symbol || undefined;
						t.name = info.name || undefined;
						t.balance_major = formatMajor(t.balance, info.decimals);
						return;
					}
					// Batch miss: fall back to individual on-chain call.
					const decimals = await resolveTrc20Decimals(client, t.contract_address);
					t.decimals = decimals;
					t.balance_major = formatMajor(t.balance, decimals);
				} else {
					const decimals = await resolveTrc10Decimals(client, t.contract_address);
					t.decimals = decimals;
					t.balance_major = formatMajor(t.balance, decimals);
				}
			} catch {
				// On lookup failure, leave the fields unset. The raw balance is
				// still present. Don't fail the whole command for one token.
			}
		}),
	);

	return results;
}

export function registerAccountTokensCommand(account: Command, parent: Command): void {
	account
		.command("tokens")
		.description("List TRC20 and TRC10 token balances")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account tokens TR...
  $ trongrid account tokens                  # uses default_address from config
  $ trongrid account tokens TR... --json     # class S2 shape with decimals + balance_major
  $ trongrid account tokens TR... --fields contract_address,balance_major
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const tokens = await fetchAccountTokens(client, resolved);

				printListResult(tokens, renderTokenList, {
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
