import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import {
	_resetTrc10DecimalsCacheForTests,
	_resetTrc20DecimalsCacheForTests,
	fetchOnChainDecimals,
	fetchTrc10Precision,
	getStaticDecimals,
	resolveTrc10Decimals,
	resolveTrc20Decimals,
} from "../../src/utils/tokens.js";

describe("getStaticDecimals", () => {
	it("returns 6 for USDT", () => {
		expect(getStaticDecimals("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(6);
	});

	it("returns undefined for unknown contracts", () => {
		expect(getStaticDecimals("TXYZunknownunknownunknownunknowxxxx")).toBeUndefined();
	});

	it("treats contract addresses case-sensitively (base58 is case-sensitive)", () => {
		expect(getStaticDecimals("tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t")).toBeUndefined();
	});

	it("returns correct decimals for all 7 static entries", () => {
		const cases: Array<[string, number, string]> = [
			["TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", 6, "USDT"],
			["TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8", 6, "USDC"],
			["TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR", 6, "WTRX"],
			["TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9", 18, "JST"],
			["TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S", 18, "SUN"],
			["TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7", 6, "WIN"],
			["TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4", 18, "BTT"],
		];
		for (const [address, expected, symbol] of cases) {
			expect(getStaticDecimals(address), `${symbol} (${address})`).toBe(expected);
		}
	});
});

describe("fetchOnChainDecimals", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses uint256 hex result into an integer", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						result: { result: true },
						constant_result: ["0000000000000000000000000000000000000000000000000000000000000006"],
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const decimals = await fetchOnChainDecimals(client, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
		expect(decimals).toBe(6);
	});

	it("throws when the contract has no constant_result", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({ result: { result: true } }))),
		);
		const client = createClient({ network: "mainnet" });
		await expect(
			fetchOnChainDecimals(client, "TXYZunknownunknownunknownunknowxxxx"),
		).rejects.toThrow(/no decimals\(\) result/i);
	});

	it("throws on garbage hex that parses to out-of-range value", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						result: { result: true },
						constant_result: ["FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"],
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		await expect(
			fetchOnChainDecimals(client, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"),
		).rejects.toThrow(/unexpected decimals\(\) hex/i);
	});
});

describe("resolveTrc20Decimals", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		_resetTrc20DecimalsCacheForTests();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns the static value without hitting the network for known tokens", async () => {
		const fetchMock = mock(() => {
			throw new Error("should not be called");
		});
		globalThis.fetch = fetchMock;
		const client = createClient({ network: "mainnet" });
		const result = await resolveTrc20Decimals(client, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
		expect(result).toBe(6);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("falls back to on-chain for unknown tokens", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						result: { result: true },
						constant_result: ["0000000000000000000000000000000000000000000000000000000000000012"],
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await resolveTrc20Decimals(client, "TXYZnewtokenaddressnewtokenaddressxx");
		expect(result).toBe(18);
	});

	it("memoises on-chain lookups within one process", async () => {
		let calls = 0;
		globalThis.fetch = mock(() => {
			calls += 1;
			return Promise.resolve(
				new Response(
					JSON.stringify({
						result: { result: true },
						constant_result: ["0000000000000000000000000000000000000000000000000000000000000012"],
					}),
				),
			);
		});
		const client = createClient({ network: "mainnet" });
		// Use a distinct address for readability (kept even though cache is now
		// reset per-test via beforeEach).
		const result1 = await resolveTrc20Decimals(client, "TXYZmemoaddressformemoaddressmemo1");
		const result2 = await resolveTrc20Decimals(client, "TXYZmemoaddressformemoaddressmemo1");
		expect(calls).toBe(1);
		expect(result1).toBe(18);
		expect(result2).toBe(18);
	});
});

describe("fetchTrc10Precision", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses the precision field from asset info", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						id: "1002000",
						precision: 6,
						name: "TestToken",
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const precision = await fetchTrc10Precision(client, "1002000");
		expect(precision).toBe(6);
	});

	it("defaults to 0 when precision field is absent (common for early TRC-10)", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						id: "1000001",
						name: "LegacyToken",
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const precision = await fetchTrc10Precision(client, "1000001");
		expect(precision).toBe(0);
	});
});

describe("resolveTrc10Decimals", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		_resetTrc10DecimalsCacheForTests();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns on-chain precision for a TRC-10 asset", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ id: "1002000", precision: 6 })),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await resolveTrc10Decimals(client, "1002000");
		expect(result).toBe(6);
	});

	it("memoises lookups within one process", async () => {
		let calls = 0;
		globalThis.fetch = mock(() => {
			calls += 1;
			return Promise.resolve(
				new Response(JSON.stringify({ id: "1002000", precision: 6 })),
			);
		});
		const client = createClient({ network: "mainnet" });
		const result1 = await resolveTrc10Decimals(client, "1002000");
		const result2 = await resolveTrc10Decimals(client, "1002000");
		expect(calls).toBe(1);
		expect(result1).toBe(6);
		expect(result2).toBe(6);
	});
});
