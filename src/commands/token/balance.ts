import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { addThousandsSep } from "../../output/columns.js";
import { printResult, reportErrorAndExit, UsageError } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import {
	detectTokenIdentifier,
	type TokenIdentifier,
	type TokenTypeOverride,
} from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface TrxBalanceResult {
	token: "TRX";
	address: string;
	balance: string;
	balance_unit: "sun";
	decimals: 6;
	balance_trx: string;
}

export interface Trc20BalanceResult {
	token: string;
	token_address: string;
	token_symbol?: string;
	token_name?: string;
	address: string;
	balance: string;
	decimals: number;
	balance_major: string;
}

export type TokenBalanceResult = TrxBalanceResult | Trc20BalanceResult;

interface AccountResponse {
	data?: Array<{
		balance?: number;
	}>;
}

interface Trc20BalanceResponse {
	data?: Array<Record<string, string>>;
}

export async function fetchTokenBalance(
	client: ApiClient,
	id: TokenIdentifier,
	address: string,
): Promise<TokenBalanceResult> {
	if (id.type === "trc10" || id.type === "trc721" || id.type === "trc1155") {
		throw new UsageError(
			`${id.type.toUpperCase()} is not yet supported for this command. Support is planned for a future release.`,
		);
	}

	if (id.type === "trx") {
		const raw = await client.get<AccountResponse>(`/v1/accounts/${address}`);
		const balanceNum = raw.data?.[0]?.balance ?? 0;
		const balanceStr = String(balanceNum);
		return {
			token: "TRX",
			address,
			balance: balanceStr,
			balance_unit: "sun",
			decimals: 6,
			balance_trx: formatMajor(balanceStr, 6),
		};
	}

	// TRC-20 path
	const contractAddress = id.address;
	const path = `/v1/accounts/${address}/trc20/balance?contract_address=${contractAddress}`;
	const raw = await client.get<Trc20BalanceResponse>(path);

	// Response is an array of single-entry maps: [{"TR7NHq...": "1317713193083827"}]
	const entries = raw.data ?? [];
	let balanceStr = "0";
	if (entries.length > 0) {
		const entry = entries[0];
		if (entry) {
			const value = Object.values(entry)[0];
			if (value !== undefined) {
				balanceStr = value;
			}
		}
	}

	// Fetch token metadata for symbol, name, decimals
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 0;
	const symbol = info?.symbol;
	const name = info?.name;

	const result: Trc20BalanceResult = {
		token: symbol ?? contractAddress,
		token_address: contractAddress,
		address,
		balance: balanceStr,
		decimals,
		balance_major: formatMajor(balanceStr, decimals),
	};
	if (symbol !== undefined && symbol !== "") {
		result.token_symbol = symbol;
	}
	if (name !== undefined && name !== "") {
		result.token_name = name;
	}
	return result;
}

function hintForTokenBalance(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("not yet supported for this command")) {
		return "Support is planned for a future release.";
	}
	return addressErrorHint(err);
}

export function registerTokenBalanceCommand(token: Command, parent: Command): void {
	token
		.command("balance")
		.description("Check a specific token balance for an address")
		.helpGroup("Read commands:")
		.argument("<token>", "TRX, TRC-20 contract address, or known symbol (e.g. USDT)")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.option("--type <type>", "force token standard (trc10|trc20|trc721|trc1155)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token balance TRX TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
  $ trongrid token balance USDT TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
  $ trongrid token balance TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
  $ trongrid token balance TRX               # uses default_address from config
  $ trongrid token balance USDT --json
`,
		)
		.action(
			async (
				tokenInput: string,
				addressArg: string | undefined,
				localOpts: { type?: TokenTypeOverride },
			) => {
				const { getClient, parseFields } = await import("../../index.js");
				const opts = parent.opts<GlobalOptions>();
				try {
					const id = detectTokenIdentifier(tokenInput, localOpts.type);
					const address = resolveAddress(addressArg);
					const client = getClient(opts);
					const data = await fetchTokenBalance(client, id, address);

					if (data.token === "TRX") {
						const trxData = data as TrxBalanceResult;
						printResult(
							trxData,
							[
								["token", "Token", "TRX (Tronix)"],
								["address", "Address", trxData.address],
								["balance_trx", "Balance", `${addThousandsSep(trxData.balance_trx)} TRX`],
							],
							{ json: opts.json, fields: parseFields(opts) },
						);
					} else {
						const trc20Data = data as Trc20BalanceResult;
						const tokenLabel = trc20Data.token_symbol
							? `${trc20Data.token_symbol}${trc20Data.token_name ? ` (${trc20Data.token_name})` : ""}`
							: trc20Data.token_address;
						printResult(
							trc20Data,
							[
								["token", "Token", tokenLabel],
								["token_address", "Contract", trc20Data.token_address],
								["address", "Address", trc20Data.address],
								[
									"balance_major",
									"Balance",
									`${addThousandsSep(trc20Data.balance_major)} ${trc20Data.token_symbol ?? ""}`.trim(),
								],
							],
							{ json: opts.json, fields: parseFields(opts) },
						);
					}
				} catch (err) {
					reportErrorAndExit(err, {
						json: opts.json,
						verbose: opts.verbose,
						hint: hintForTokenBalance(err),
					});
				}
			},
		);
}
