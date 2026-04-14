import { describe, expect, it } from "bun:test";
import { detectBlockIdentifier } from "../../src/utils/block-identifier.js";

describe("detectBlockIdentifier", () => {
	it("detects pure numeric string as block number", () => {
		expect(detectBlockIdentifier("70000000")).toEqual({ kind: "number", value: 70000000 });
		expect(detectBlockIdentifier("0")).toEqual({ kind: "number", value: 0 });
	});

	it("detects 64-char lowercase hex as block hash", () => {
		const hash = "0".repeat(64);
		expect(detectBlockIdentifier(hash)).toEqual({ kind: "hash", value: hash });
	});

	it("accepts 0x-prefixed hex and strips prefix", () => {
		const hash = "0".repeat(64);
		expect(detectBlockIdentifier(`0x${hash}`)).toEqual({ kind: "hash", value: hash });
	});

	it("accepts mixed-case hex and normalizes to lowercase", () => {
		const hash = "ABCD".repeat(16);
		expect(detectBlockIdentifier(hash)).toEqual({ kind: "hash", value: hash.toLowerCase() });
	});

	it("rejects empty input with actionable error", () => {
		expect(() => detectBlockIdentifier("")).toThrow(/block identifier required/i);
	});

	it("rejects non-numeric, non-hex input", () => {
		expect(() => detectBlockIdentifier("not-a-block")).toThrow(/invalid block identifier/i);
	});

	it("rejects hex of wrong length", () => {
		expect(() => detectBlockIdentifier("abc")).toThrow(/invalid block identifier/i);
		expect(() => detectBlockIdentifier("0".repeat(63))).toThrow(/invalid block identifier/i);
	});

	it("rejects negative numbers", () => {
		expect(() => detectBlockIdentifier("-1")).toThrow(/invalid block identifier/i);
	});
});
