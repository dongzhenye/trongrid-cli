import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { printError, printListResult } from "../../output/format.js";
import { resolveAddress } from "../../utils/resolve-address.js";
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
	console.log(muted(`Found ${tokens.length} tokens:\n`));
	for (const t of tokens) {
		const typeTag = muted(`[${t.type}]`);
		const display =
			t.balance_major !== undefined
				? `${t.balance_major} ${muted(`(raw ${t.balance})`)}`
				: t.balance;
		console.log(`  ${typeTag} ${t.contract_address.padEnd(35)}  ${display}`);
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
		.argument("[address]", "TRON address (defaults to config default_address)")
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
				printError(err instanceof Error ? err.message : String(err), {
					json: opts.json,
					verbose: opts.verbose,
					upstream: (err as { upstream?: unknown }).upstream,
				});
				process.exit(1);
			}
		});
}
