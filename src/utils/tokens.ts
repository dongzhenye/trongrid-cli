import type { ApiClient } from "../api/client.js";

/**
 * Static decimals map for the most common TRC20 tokens on TRON mainnet.
 *
 * Source: TronScan verified token list (https://tronscan.org/#/tokens/list).
 * Only include high-holder-count verified tokens to avoid phishing collisions.
 * On cache miss, callers MUST fall back to an on-chain decimals() call —
 * this map is an optimisation, NOT the source of truth.
 *
 * Adding a token: verify contract address on TronScan and confirm the
 * decimals() value with an on-chain call before adding.
 */
const STATIC_TRC20_DECIMALS: Record<string, number> = {
	TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: 6, // USDT
	TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: 6, // USDC
	TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR: 6, // WTRX
	TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9: 18, // JST
	TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S: 18, // SUN
	TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7: 6, // WIN
	TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4: 18, // BTT
};

export function getStaticDecimals(contractAddress: string): number | undefined {
	return STATIC_TRC20_DECIMALS[contractAddress];
}

interface TriggerConstantResponse {
	result?: { result?: boolean; message?: string };
	constant_result?: string[];
}

/**
 * Call the TRC20 contract's `decimals()` view function via TronGrid's
 * FullNode trigger-constant proxy. Returns the decimals as an integer.
 *
 * Uses the contract address as the `owner_address` (any valid address
 * works for view calls; using the contract itself avoids dependency on
 * an externally meaningful caller).
 */
export async function fetchOnChainDecimals(
	client: ApiClient,
	contractAddress: string,
): Promise<number> {
	const res = await client.post<TriggerConstantResponse>("/wallet/triggerconstantcontract", {
		contract_address: contractAddress,
		function_selector: "decimals()",
		parameter: "",
		owner_address: contractAddress,
		visible: true,
	});

	const hex = res.constant_result?.[0];
	if (!hex) {
		throw new Error(`No decimals() result for contract ${contractAddress}`);
	}
	const decimals = Number.parseInt(hex, 16);
	if (Number.isNaN(decimals) || decimals < 0 || decimals > 32) {
		throw new Error(`Unexpected decimals() hex for ${contractAddress}: ${hex}`);
	}
	return decimals;
}
