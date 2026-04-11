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
