import { describe, expect, it } from "bun:test";
import { UsageError } from "../../src/output/format.js";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";

describe("detectTokenIdentifier", () => {
	it("detects pure 1-7 digit numeric as TRC-10 asset ID", () => {
		expect(detectTokenIdentifier("1002000")).toEqual({ type: "trc10", assetId: "1002000" });
		expect(detectTokenIdentifier("1")).toEqual({ type: "trc10", assetId: "1" });
		expect(detectTokenIdentifier("9999999")).toEqual({ type: "trc10", assetId: "9999999" });
	});

	it("detects 34-char Base58 starting with T as TRC-20 address", () => {
		const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		expect(detectTokenIdentifier(addr)).toEqual({ type: "trc20", address: addr });
	});

	it("resolves known symbols to TRC-20 addresses via the static map", () => {
		expect(detectTokenIdentifier("USDT")).toEqual({
			type: "trc20",
			address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
		});
		expect(detectTokenIdentifier("usdt")).toEqual({
			type: "trc20",
			address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
		});
	});

	it("detects TRX (uppercase) as the native coin", () => {
		expect(detectTokenIdentifier("TRX")).toEqual({ type: "trx" });
	});

	it("detects trx (lowercase) as the native coin (case-insensitive)", () => {
		expect(detectTokenIdentifier("trx")).toEqual({ type: "trx" });
	});

	it("rejects unknown symbols with a hint to pass the contract address", () => {
		expect(() => detectTokenIdentifier("SCAMCOIN")).toThrow(
			/unknown token symbol.*scamcoin.*contract address/i,
		);
	});

	it("rejects 0x-prefixed hex with a deferred-support hint", () => {
		expect(() => detectTokenIdentifier("0x" + "a".repeat(40))).toThrow(
			/0x.*hex.*not yet supported.*base58/i,
		);
	});

	it("honors --type trc10 override on numeric-looking-symbol collisions", () => {
		// e.g. a symbol that is all digits could also be a TRC-10 ID.
		// --type forces the interpretation.
		expect(detectTokenIdentifier("1002000", "trc10")).toEqual({ type: "trc10", assetId: "1002000" });
	});

	it("honors --type trc20 override for explicit Base58", () => {
		const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		expect(detectTokenIdentifier(addr, "trc20")).toEqual({ type: "trc20", address: addr });
	});

	it("returns a typed result for --type trc721 with a valid Base58 address", () => {
		const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		expect(detectTokenIdentifier(addr, "trc721")).toEqual({ type: "trc721", address: addr });
	});

	it("returns a typed result for --type trc1155 with a valid Base58 address", () => {
		const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		expect(detectTokenIdentifier(addr, "trc1155")).toEqual({ type: "trc1155", address: addr });
	});

	it("rejects --type trc721 with an invalid (non-address) input", () => {
		expect(() => detectTokenIdentifier("1002000", "trc721")).toThrow(/invalid trc-?721 address/i);
	});

	it("rejects --type trc1155 with an invalid (non-address) input", () => {
		expect(() => detectTokenIdentifier("1002000", "trc1155")).toThrow(/invalid trc-?1155 address/i);
	});

	it("rejects empty input", () => {
		expect(() => detectTokenIdentifier("")).toThrow(/token identifier required/i);
	});

	it("rejects garbage input", () => {
		expect(() => detectTokenIdentifier("!!!")).toThrow(/invalid token identifier/i);
	});

	it("throws UsageError (not plain Error) for bad input", () => {
		expect(() => detectTokenIdentifier("!!!")).toThrow(UsageError);
	});
});
