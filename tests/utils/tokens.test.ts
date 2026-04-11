import { describe, expect, it } from "bun:test";
import { getStaticDecimals } from "../../src/utils/tokens.js";

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
