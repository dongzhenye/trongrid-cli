import { styleText } from "node:util";
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printError } from "../../output/format.js";
import { resolveAddress } from "../../utils/resolve-address.js";

export interface TokenBalance {
	type: "TRC20" | "TRC10";
	contract_address: string;
	balance: string;
	// Note: token_decimals and balance_major are not available from /v1/accounts/:address.
	// Adding them requires a secondary API call per token or a static decimals map.
	// Tracked for future improvement.
}

// /v1/accounts/:address returns the account object directly in data[0]
interface AccountV1Response {
	data?: Array<{
		trc20?: Array<Record<string, string>>; // [{contractAddr: balanceStr}, ...]
		assetV2?: Array<{ key: string; value: number }>; // TRC10 tokens
	}>;
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

				if (opts.json) {
					const fields = parseFields(opts);
					const data = fields
						? tokens.map((t) => {
								const filtered: Record<string, unknown> = {};
								for (const f of fields) if (f in t) filtered[f] = t[f as keyof TokenBalance];
								return filtered;
							})
						: tokens;
					console.log(JSON.stringify(data, null, 2));
				} else {
					if (tokens.length === 0) {
						console.log(styleText("dim", "No tokens found."));
						return;
					}
					console.log(styleText("dim", `Found ${tokens.length} tokens:\n`));
					for (const t of tokens) {
						const typeTag = styleText("dim", `[${t.type}]`);
						console.log(`  ${typeTag} ${t.contract_address.padEnd(35)}  ${t.balance}`);
					}
				}
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
