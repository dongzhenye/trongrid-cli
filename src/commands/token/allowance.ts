import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { addThousandsSep } from "../../output/columns.js";
import { printResult, reportErrorAndExit, UsageError } from "../../output/format.js";
import { base58ToHex, validateAddress } from "../../utils/address.js";
import {
	detectTokenIdentifier,
	type TokenIdentifier,
	type TokenTypeOverride,
} from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface AllowanceResult {
	token: string;
	token_address: string;
	token_symbol?: string;
	token_name?: string;
	owner: string;
	spender: string;
	allowance: string;
	decimals: number;
	allowance_major: string;
	unlimited: boolean;
}

interface TriggerResponse {
	constant_result?: string[];
}

/**
 * ABI-encode two addresses as the `parameter` field for triggerConstantContract.
 *
 * The ERC/TRC-20 ABI encoding for two address parameters packs each address
 * into a 32-byte (64 hex char) slot, left-padded with zeros. The address body
 * is the 20 raw bytes (no 0x41 TRON prefix).
 *
 * Example: address a614f803... → 000...0000a614f803...
 */
function encodeAddressParams(owner: string, spender: string): string {
	const ownerHex = base58ToHex(owner);
	const spenderHex = base58ToHex(spender);
	return ownerHex.padStart(64, "0") + spenderHex.padStart(64, "0");
}

/**
 * Fetch the TRC-20 allowance granted by `owner` to `spender` for the given
 * token contract. Calls `allowance(address,address)` via triggerConstantContract.
 *
 * The `constant_result[0]` hex is a uint256 — decoded with BigInt for precision
 * above 2^53.
 */
export async function fetchAllowance(
	client: ApiClient,
	id: TokenIdentifier,
	owner: string,
	spender: string,
): Promise<AllowanceResult> {
	if (id.type === "trx") {
		throw new UsageError("TRX has no allowance mechanism (allowance is a TRC-20 concept).");
	}
	if (id.type === "trc10") {
		throw new UsageError(
			"TRC-10 tokens do not support the allowance mechanism. This command is for TRC-20 tokens only.",
		);
	}
	if (id.type === "trc721" || id.type === "trc1155") {
		throw new UsageError(
			`${id.type.toUpperCase()} allowance is not yet supported. Support is planned for a future release.`,
		);
	}

	const contractAddress = id.address;
	const parameter = encodeAddressParams(owner, spender);

	const res = await client.post<TriggerResponse>("/wallet/triggerconstantcontract", {
		contract_address: contractAddress,
		function_selector: "allowance(address,address)",
		parameter,
		owner_address: contractAddress,
		visible: true,
	});

	const hex = res.constant_result?.[0];
	if (!hex) {
		throw new Error(`No allowance() result for contract ${contractAddress}`);
	}

	// uint256 → decimal string via BigInt (avoids precision loss above 2^53)
	const allowanceBig = BigInt(`0x${hex}`);
	const allowanceRaw = allowanceBig.toString(10);

	// uint256.max = 2^256 - 1 → "unlimited" in TRC-20/ERC-20 convention.
	// dApps set approve(spender, type(uint256).max) to avoid repeated approvals.
	const UINT256_MAX = (1n << 256n) - 1n;
	const unlimited = allowanceBig === UINT256_MAX;

	// Fetch token metadata for symbol, name, decimals
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 6; // safe fallback for display; 6 is most common (USDT, USDC)

	return {
		token: info?.symbol ?? contractAddress,
		token_address: contractAddress,
		token_symbol: info?.symbol,
		token_name: info?.name,
		owner,
		spender,
		allowance: allowanceRaw,
		decimals,
		allowance_major: unlimited ? "Unlimited" : formatMajor(allowanceRaw, decimals),
		unlimited,
	};
}

function hintForTokenAllowance(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("trx") && msg.includes("allowance")) {
		return 'Use "trongrid token balance TRX <address>" to check TRX balance instead.';
	}
	if (msg.includes("not yet supported")) {
		return "Support is planned for a future release.";
	}
	return undefined;
}

export function registerTokenAllowanceCommand(token: Command, parent: Command): void {
	token
		.command("allowance")
		.description("Check TRC-20 allowance granted by owner to spender")
		.helpGroup("Read commands:")
		.argument("<token>", "TRC-20 address or verified symbol")
		.argument("<owner>", "Owner address (the grantor)")
		.argument("<spender>", "Spender address (the grantee)")
		.option("--type <type>", "force token standard")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token allowance USDT TOwner... TSpender...
  $ trongrid token allowance USDT TOwner... TSpender... --json
`,
		)
		.action(
			async (
				tokenInput: string,
				ownerInput: string,
				spenderInput: string,
				localOpts: { type?: TokenTypeOverride },
			) => {
				const { getClient, parseFields } = await import("../../index.js");
				const opts = parent.opts<GlobalOptions>();
				try {
					const id = detectTokenIdentifier(tokenInput, localOpts.type);
					// Type check before address validation — "TRX has no allowance"
					// is more useful than "invalid address" when the real issue is
					// the token type.
					if (id.type === "trx") {
						throw new UsageError("TRX has no allowance mechanism (allowance is a TRC-20 concept).");
					}
					if (id.type !== "trc20") {
						throw new UsageError(
							`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
						);
					}
					const owner = validateAddress(ownerInput);
					const spender = validateAddress(spenderInput);
					const client = getClient(opts);
					const data = await fetchAllowance(client, id, owner, spender);

					const tokenLabel = data.token_name
						? `${data.token_symbol} (${data.token_name})`
						: (data.token_symbol ?? data.token_address);
					printResult(
						data,
						[
							["token", "Token", tokenLabel],
							["token_address", "Contract", data.token_address],
							["owner", "Owner", data.owner],
							["spender", "Spender", data.spender],
							[
								"allowance_major",
								"Allowance",
								data.unlimited
									? "Unlimited"
									: `${addThousandsSep(data.allowance_major)} ${data.token_symbol ?? ""}`,
							],
						],
						{ json: opts.json, fields: parseFields(opts) },
					);
				} catch (err) {
					reportErrorAndExit(err, {
						json: opts.json,
						verbose: opts.verbose,
						hint: hintForTokenAllowance(err),
					});
				}
			},
		);
}
