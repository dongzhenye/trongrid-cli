import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchOnChainDecimals, getStaticDecimals } from "../../src/utils/tokens.js";

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
