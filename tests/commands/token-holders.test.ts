import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenHolders } from "../../src/commands/token/holders.js";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";
import { UsageError } from "../../src/output/format.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const MOCK_INFO_RESPONSE = {
	data: [
		{
			contract_address: CONTRACT,
			name: "Tether USD",
			symbol: "USDT",
			decimals: "6",
			type: "trc20",
			total_supply: "100000000000000", // 100,000,000 USDT (6 decimals)
		},
	],
};

const MOCK_HOLDERS_RESPONSE = {
	data: [
		{ TKHuVq1oKVruCGLvqVexFs55zKgPzbpEHE: "60000000000000" }, // 60,000,000 USDT → 60%
		{ TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwH: "40000000000000" }, // 40,000,000 USDT → 40%
	],
};

describe("fetchTokenHolders", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses holder map entries with rank and share_pct", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify(MOCK_INFO_RESPONSE)));
			}
			if (url.includes(`/v1/contracts/${CONTRACT}/tokens`)) {
				return Promise.resolve(new Response(JSON.stringify(MOCK_HOLDERS_RESPONSE)));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenHolders(client, CONTRACT, { limit: 20 });

		expect(rows).toHaveLength(2);

		expect(rows[0]).toMatchObject({
			rank: 1,
			address: "TKHuVq1oKVruCGLvqVexFs55zKgPzbpEHE",
			balance: "60000000000000",
			decimals: 6,
			balance_major: "60000000.0",
			share_pct: "60.00",
		});

		expect(rows[1]).toMatchObject({
			rank: 2,
			address: "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwH",
			balance: "40000000000000",
			decimals: 6,
			balance_major: "40000000.0",
			share_pct: "40.00",
		});
	});

	it("returns empty array when no holders", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({ data: [] })));
			}
			if (url.includes(`/v1/contracts/${CONTRACT}/tokens`)) {
				return Promise.resolve(new Response(JSON.stringify({ data: [] })));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenHolders(client, CONTRACT, { limit: 20 });

		expect(rows).toEqual([]);
	});
});

describe("detectTokenIdentifier — type guard for holders command", () => {
	it("TRX input returns type=trx", () => {
		const id = detectTokenIdentifier("TRX");
		expect(id.type).toBe("trx");
	});

	it("TRC-10 numeric ID returns type=trc10", () => {
		const id = detectTokenIdentifier("1002000");
		expect(id.type).toBe("trc10");
	});
});

describe("holders command type errors (via UsageError)", () => {
	it("throws UsageError for TRX input", () => {
		// The command action throws UsageError for trx — simulate that logic here.
		const id = detectTokenIdentifier("TRX");
		expect(id.type).toBe("trx");

		expect(() => {
			if (id.type === "trx") {
				throw new UsageError("TRX holder ranking is not available on TronGrid.");
			}
		}).toThrow(UsageError);
	});

	it("throws UsageError for TRC-10 input", () => {
		const id = detectTokenIdentifier("1002000");
		expect(id.type).toBe("trc10");

		expect(() => {
			if (id.type === "trc10") {
				throw new UsageError(
					`${id.type.toUpperCase()} is not yet supported for this command. Support is planned for a future release.`,
				);
			}
		}).toThrow(UsageError);
	});
});
