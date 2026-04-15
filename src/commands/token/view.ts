import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printResult, reportErrorAndExit } from "../../output/format.js";
import {
	detectTokenIdentifier,
	type TokenIdentifier,
	type TokenTypeOverride,
} from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface TokenViewData {
	type: "TRC10" | "TRC20";
	contract_address: string;
	name: string;
	symbol: string;
	decimals: number;
	total_supply: string;
	total_supply_major: string;
}

interface TriggerResponse {
	constant_result?: string[];
}

async function callView<T>(
	client: ApiClient,
	contractAddress: string,
	selector: string,
	decode: (hex: string) => T,
): Promise<T> {
	const res = await client.post<TriggerResponse>("/wallet/triggerconstantcontract", {
		contract_address: contractAddress,
		function_selector: selector,
		parameter: "",
		owner_address: contractAddress,
		visible: true,
	});
	const hex = res.constant_result?.[0];
	if (!hex) {
		throw new Error(`No ${selector} result for contract ${contractAddress}`);
	}
	return decode(hex);
}

function decodeString(hex: string): string {
	// ABI-encoded string: 32 bytes offset, 32 bytes length, N bytes data (right-padded).
	if (hex.length < 128) return "";
	const length = Number.parseInt(hex.slice(64, 128), 16);
	if (!Number.isFinite(length) || length === 0) return "";
	const dataHex = hex.slice(128, 128 + length * 2);
	const bytes = new Uint8Array(length);
	for (let i = 0; i < length; i++) {
		bytes[i] = Number.parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
	}
	return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

function decodeUint(hex: string): string {
	// Leading-zero-stripped decimal. Use BigInt to handle >2^53 supplies.
	const n = BigInt(`0x${hex || "0"}`);
	return n.toString(10);
}

async function fetchTrc20(client: ApiClient, address: string): Promise<TokenViewData> {
	const [name, symbol, decimalsStr, totalSupply] = await Promise.all([
		callView(client, address, "name()", decodeString),
		callView(client, address, "symbol()", decodeString),
		callView(client, address, "decimals()", decodeUint),
		callView(client, address, "totalSupply()", decodeUint),
	]);
	const decimals = Number.parseInt(decimalsStr, 10);
	if (Number.isNaN(decimals) || decimals < 0 || decimals > 32) {
		throw new Error(`Unexpected decimals for ${address}: ${decimalsStr}`);
	}
	return {
		type: "TRC20",
		contract_address: address,
		name,
		symbol,
		decimals,
		total_supply: totalSupply,
		total_supply_major: formatMajor(totalSupply, decimals),
	};
}

interface AssetIssueFull {
	id?: string;
	name?: string;
	abbr?: string;
	precision?: number;
	total_supply?: number | string;
	owner_address?: string;
}

async function fetchTrc10(client: ApiClient, assetId: string): Promise<TokenViewData> {
	const raw = await client.post<AssetIssueFull>("/wallet/getassetissuebyid", {
		value: assetId,
	});
	if (!raw.id) {
		throw new Error(`Token not found: ${assetId}`);
	}
	const decimals = raw.precision ?? 0;
	const total = String(raw.total_supply ?? "0");
	return {
		type: "TRC10",
		contract_address: assetId,
		name: raw.name ?? "",
		symbol: raw.abbr ?? "",
		decimals,
		total_supply: total,
		total_supply_major: formatMajor(total, decimals),
	};
}

export async function fetchTokenView(
	client: ApiClient,
	id: TokenIdentifier,
): Promise<TokenViewData> {
	return id.kind === "trc10" ? fetchTrc10(client, id.assetId) : fetchTrc20(client, id.address);
}

function hintForTokenView(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("unknown token symbol")) {
		return "Verified symbols: USDT, USDC, WTRX, JST, SUN, WIN, BTT. Pass the contract address directly for others.";
	}
	if (msg.includes("0x") && msg.includes("hex")) {
		return "Base58 (T...) is required in Wave 1. 0x-hex support will land in a later wave.";
	}
	if (msg.includes("not yet implemented")) {
		return "Wave 1 supports TRC-10 and TRC-20 only. TRC-721 / TRC-1155 will land in a later wave.";
	}
	if (msg.includes("token not found")) {
		return "Check the asset ID or address. Cross-check on tronscan.org.";
	}
	return undefined;
}

export function registerTokenCommands(parent: Command): void {
	const token = parent
		.command("token")
		.description("Token queries (TRC-10 + TRC-20)")
		.helpGroup("Read commands:");

	token
		.command("view")
		.description("View token metadata by asset ID, contract address, or known symbol")
		.argument("<id|address|symbol>", "TRC-10 asset ID, TRC-20 Base58 address, or verified symbol")
		.option("--type <type>", "force token standard (trc10|trc20|trc721|trc1155)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token view USDT
  $ trongrid token view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid token view 1002000
  $ trongrid token view USDT --json
  $ trongrid token view 1002000 --type trc10

Verified symbols (Wave 1): USDT, USDC, WTRX, JST, SUN, WIN, BTT.
Unknown symbols are rejected — pass the contract address instead.
`,
		)
		.action(async (input: string, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(input, localOpts.type);
				const client = getClient(opts);
				// NOTE: --confirmed has no effect here — triggerconstantcontract and
				// getassetissuebyid have no /walletsolidity mirror. Accepted silently
				// for flag uniformity; tracked in docs/plans/phase-b.md as a follow-up.
				const data = await fetchTokenView(client, id);

				printResult(
					data,
					[
						["Type", data.type],
						[data.type === "TRC10" ? "Asset ID" : "Contract", data.contract_address],
						["Name", data.name],
						["Symbol", data.symbol],
						["Decimals", String(data.decimals)],
						["Total Supply", `${data.total_supply_major} ${data.symbol || ""}`.trim()],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTokenView(err),
				});
			}
		});
}
