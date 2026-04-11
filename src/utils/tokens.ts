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
const STATIC_TRC20_DECIMALS: Readonly<Record<string, number>> = Object.freeze({
	TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: 6, // USDT
	TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: 6, // USDC
	TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR: 6, // WTRX
	TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9: 18, // JST
	TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S: 18, // SUN
	TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7: 6, // WIN
	TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4: 18, // BTT
});

export function getStaticDecimals(contractAddress: string): number | undefined {
	return STATIC_TRC20_DECIMALS[contractAddress];
}

/**
 * Convert a raw integer balance string into a major-unit decimal string.
 * Uses BigInt-free string arithmetic to preserve precision above 2^53.
 *
 * Example: formatMajor("38927318000", 6) → "38927.318"
 * Example: formatMajor("500000000000000000", 6) → "500000000000.0"
 * Trailing zeros in the fractional part are trimmed except one "0"
 * when the fractional part would otherwise be empty.
 */
export function formatMajor(rawBalance: string, decimals: number): string {
	if (decimals === 0) return rawBalance;

	const negative = rawBalance.startsWith("-");
	const magnitude = negative ? rawBalance.slice(1) : rawBalance;
	const padded = magnitude.padStart(decimals + 1, "0");
	const intPart = padded.slice(0, padded.length - decimals) || "0";
	const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "") || "0";
	const result = `${intPart}.${fracPart}`;
	return negative ? `-${result}` : result;
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

const onChainCache = new Map<string, number>();

/**
 * Reset the TRC-20 on-chain decimals cache. Test-only — do not call
 * in production code. Exported with an underscore prefix to signal that
 * this is internal test infrastructure.
 */
export function _resetTrc20DecimalsCacheForTests(): void {
	onChainCache.clear();
}

/**
 * Resolve TRC20 decimals with a hybrid strategy:
 *   1. Static map for top tokens (no network call).
 *   2. Module-level memoisation cache for previously-seen unknowns.
 *   3. On-chain decimals() call as the source of truth for cache misses.
 *
 * The module-level cache is intentionally process-local; it has no TTL.
 * trongrid CLI processes are short-lived, so persistent caching is
 * overkill. Multi-command shell sessions re-fetch once per process.
 */
export async function resolveTrc20Decimals(
	client: ApiClient,
	contractAddress: string,
): Promise<number> {
	const fromStatic = getStaticDecimals(contractAddress);
	if (fromStatic !== undefined) return fromStatic;

	const cached = onChainCache.get(contractAddress);
	if (cached !== undefined) return cached;

	const fetched = await fetchOnChainDecimals(client, contractAddress);
	onChainCache.set(contractAddress, fetched);
	return fetched;
}

interface AssetIssueResponse {
	id?: string;
	precision?: number;
	name?: string;
}

/**
 * Call FullNode's /wallet/getassetissuebyid to fetch a TRC-10 asset's
 * precision (the TRC-10 equivalent of TRC-20 decimals). Most early-era
 * TRC-10 assets have precision 0, so missing `precision` is treated as 0
 * rather than an error.
 *
 * Note: FullNode returns `{}` (not HTTP 4xx) for unknown asset IDs, so
 * `res.precision ?? 0` cannot distinguish a valid TRC-10 with precision 0
 * from a completely invalid ID. Callers that need this distinction must
 * check `res.id` before using the return value. Out of scope for the
 * current account-tokens use case, where every asset ID comes from the
 * account's own assetV2 list and is guaranteed to exist.
 */
export async function fetchTrc10Precision(client: ApiClient, assetId: string): Promise<number> {
	const res = await client.post<AssetIssueResponse>("/wallet/getassetissuebyid", {
		value: assetId,
	});
	return res.precision ?? 0;
}

// Module-level cache owned by resolveTrc10Decimals. Separate from the
// TRC-20 cache because the key space (numeric asset IDs vs base58 contract
// addresses) and lookup path differ.
const trc10Cache = new Map<string, number>();

/**
 * Reset the TRC-10 precision cache. Test-only — mirror of the
 * TRC-20 reset helper. Underscore prefix signals internal test infra.
 */
export function _resetTrc10DecimalsCacheForTests(): void {
	trc10Cache.clear();
}

/**
 * Resolve TRC-10 decimals (= precision) with a module-level cache.
 * No static map — TRC-10 tokens are less numerous than TRC-20 and
 * metadata lookups are cheap (single FullNode call per unique ID).
 * The cache is separate from onChainCache (TRC-20) because the key
 * space and lookup path differ.
 */
export async function resolveTrc10Decimals(client: ApiClient, assetId: string): Promise<number> {
	const cached = trc10Cache.get(assetId);
	if (cached !== undefined) return cached;

	const fetched = await fetchTrc10Precision(client, assetId);
	trc10Cache.set(assetId, fetched);
	return fetched;
}
