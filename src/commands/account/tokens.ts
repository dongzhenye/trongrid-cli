import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
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

// Fields follow scenario S2 from docs/design/units.md:
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
 * and one `[TYPE] contract_address  <major> (raw <raw>)` line per token.
 * Tokens with unresolved decimals fall back to raw-only display.
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

	// Column order: type tag | contract (truncated) | balance_major | raw annotation
	const cells: string[][] = tokens.map((t) => [
		`[${t.type}]`,
		truncateAddress(t.contract_address, 4, 4),
		t.balance_major ?? t.balance,
		t.balance_major !== undefined ? muted(`(raw ${t.balance})`) : "",
	]);

	const balanceCol = 2;
	const balanceWidth = Math.max(...cells.map((c) => (c[balanceCol] ?? "").length));
	for (const row of cells) {
		const cur = row[balanceCol] ?? "";
		row[balanceCol] = alignNumber(cur, balanceWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
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

	// Resolve decimals for BOTH TRC-20 and TRC-10 in parallel. Each type uses
	// its own resolver (different on-chain fetch path) but the in-loop logic
	// is uniform because both produce an integer `decimals` value.
	await Promise.all(
		results.map(async (t) => {
			try {
				const decimals =
					t.type === "TRC20"
						? await resolveTrc20Decimals(client, t.contract_address)
						: await resolveTrc10Decimals(client, t.contract_address);
				t.decimals = decimals;
				t.balance_major = formatMajor(t.balance, decimals);
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
