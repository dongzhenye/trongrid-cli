import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import {
	fetchTokenBalance,
	type Trc20BalanceResult,
	type TrxBalanceResult,
} from "../../src/commands/token/balance.js";
import { UsageError } from "../../src/output/format.js";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";

const USDT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const HOLDER_ADDRESS = "TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs";

function mockFetch(
	trc20BalanceFixture: unknown,
	trc20InfoFixture?: unknown,
	accountFixture?: unknown,
): void {
	globalThis.fetch = mock((input: Request | string | URL) => {
		const url = typeof input === "string" ? input : input.toString();

		if (url.includes("/v1/trc20/info")) {
			const infoResponse = trc20InfoFixture ?? {
				data: [
					{
						contract_address: USDT_ADDRESS,
						name: "Tether USD",
						symbol: "USDT",
						decimals: 6,
						type: "trc20",
						total_supply: "82123456789000",
					},
				],
			};
			return Promise.resolve(
				new Response(JSON.stringify(infoResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}

		if (url.includes("/trc20/balance")) {
			return Promise.resolve(
				new Response(JSON.stringify(trc20BalanceFixture), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}

		if (url.includes("/v1/accounts/")) {
			const fixture = accountFixture ?? {
				data: [{ balance: 35216519 }],
			};
			return Promise.resolve(
				new Response(JSON.stringify(fixture), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}

		return Promise.resolve(
			new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

describe("fetchTokenBalance — TRC-20", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns S2 shape with symbol, name, decimals, and balance_major", async () => {
		const balanceFixture = {
			data: [{ [USDT_ADDRESS]: "1317713193083827" }],
		};
		mockFetch(balanceFixture);

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier(USDT_ADDRESS);
		const result = await fetchTokenBalance(client, id, HOLDER_ADDRESS);

		expect(result.token).toBe("USDT");
		const trc20 = result as Trc20BalanceResult;
		expect(trc20.token_address).toBe(USDT_ADDRESS);
		expect(trc20.token_symbol).toBe("USDT");
		expect(trc20.token_name).toBe("Tether USD");
		expect(trc20.address).toBe(HOLDER_ADDRESS);
		expect(trc20.balance).toBe("1317713193083827");
		expect(trc20.decimals).toBe(6);
		expect(trc20.balance_major).toBe("1317713193.083827");
	});
});

describe("fetchTokenBalance — TRX", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns S1 shape with balance in sun and balance_trx in TRX", async () => {
		mockFetch(
			{ data: [] }, // trc20 balance not used
			undefined,
			{ data: [{ balance: 35216519 }] },
		);

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("TRX");
		const result = await fetchTokenBalance(client, id, HOLDER_ADDRESS);

		expect(result.token).toBe("TRX");
		const trx = result as TrxBalanceResult;
		expect(trx.address).toBe(HOLDER_ADDRESS);
		expect(trx.balance).toBe("35216519");
		expect(trx.balance_unit).toBe("sun");
		expect(trx.decimals).toBe(6);
		expect(trx.balance_trx).toBe("35.216519");
	});
});

describe("fetchTokenBalance — empty TRC-20 (token not held)", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns balance of '0' when data array is empty", async () => {
		const balanceFixture = { data: [] };
		mockFetch(balanceFixture);

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier(USDT_ADDRESS);
		const result = await fetchTokenBalance(client, id, HOLDER_ADDRESS);

		const trc20 = result as Trc20BalanceResult;
		expect(trc20.balance).toBe("0");
		expect(trc20.balance_major).toBe("0.0");
	});
});

describe("fetchTokenBalance — TRX inactive account (missing balance field)", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("defaults balance to 0 when balance field is absent", async () => {
		mockFetch(
			{ data: [] },
			undefined,
			// Inactive account: data array has an entry but no balance field
			{ data: [{}] },
		);

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("TRX");
		const result = await fetchTokenBalance(client, id, HOLDER_ADDRESS);

		const trx = result as TrxBalanceResult;
		expect(trx.balance).toBe("0");
		expect(trx.balance_trx).toBe("0.0");
	});
});

describe("fetchTokenBalance — unsupported token types", () => {
	it("throws UsageError for TRC-10", async () => {
		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("1002000");
		await expect(fetchTokenBalance(client, id, HOLDER_ADDRESS)).rejects.toThrow(UsageError);
		await expect(fetchTokenBalance(client, id, HOLDER_ADDRESS)).rejects.toThrow(
			/not yet supported for this command/i,
		);
	});

	it("includes 'Support is planned for a future release' in TRC-10 error", async () => {
		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("1002000");
		await expect(fetchTokenBalance(client, id, HOLDER_ADDRESS)).rejects.toThrow(
			/Support is planned for a future release/,
		);
	});
});
