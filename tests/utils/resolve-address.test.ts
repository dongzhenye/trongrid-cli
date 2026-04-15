import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../../src/output/format.js";
import { validateAddress } from "../../src/utils/address.js";
import { setConfigValue } from "../../src/utils/config.js";
import { addressErrorHint, resolveAddress } from "../../src/utils/resolve-address.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-resolve-address-test");
const TEST_CONFIG = join(TEST_DIR, "config.json");
const VALID_1 = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
const VALID_2 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("resolveAddress", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("returns the provided argument when given", () => {
		expect(resolveAddress(VALID_1, TEST_CONFIG)).toBe(VALID_1);
	});

	it("rejects invalid provided argument before consulting config", () => {
		setConfigValue(TEST_CONFIG, "default_address", VALID_2);
		expect(() => resolveAddress("not-an-addr", TEST_CONFIG)).toThrow(/invalid tron address/i);
	});

	it("falls back to default_address when argument is undefined", () => {
		setConfigValue(TEST_CONFIG, "default_address", VALID_2);
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(VALID_2);
	});

	it("throws an actionable error when neither argument nor default is set", () => {
		expect(() => resolveAddress(undefined, TEST_CONFIG)).toThrow(
			/no address provided[\s\S]*trongrid config set default_address/i,
		);
	});

	it("throws UsageError (not plain Error) when nothing is set", () => {
		expect(() => resolveAddress(undefined, TEST_CONFIG)).toThrow(UsageError);
	});
});

describe("addressErrorHint (Phase D P5: distinct from error)", () => {
	// Rule: Error states the symptom tersely; Hint adds a distinct actionable
	// insight. These regression tests lock in the literal inequality so a
	// future "simplification" can't quietly reintroduce a restatement-style hint.

	it("invalid-address hint is distinct from the error message", () => {
		let caught: unknown;
		try {
			validateAddress("TR7NFOO");
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(UsageError);
		const errMsg = (caught as Error).message;
		const hint = addressErrorHint(caught);
		expect(hint).toBeDefined();
		expect(hint).not.toBe(errMsg);
		// The error spells out the format ("Expected Base58 (T...) or Hex (41...)");
		// the hint must not echo that same key phrase.
		expect(hint?.toLowerCase()).not.toContain("expected base58");
		expect(hint?.toLowerCase()).not.toContain("hex (41");
	});

	it("no-default-address hint is distinct from the error message", () => {
		const err = new UsageError(
			"No address provided and no default is configured.\n" +
				"  Pass an address as an argument, or run:\n" +
				"    trongrid config set default_address <addr>",
		);
		const hint = addressErrorHint(err);
		expect(hint).toBeDefined();
		expect(hint).not.toBe(err.message);
		// The error already shows the exact command; the hint must add the
		// *payoff* ("every account command will default to it"), not restate it.
		expect(hint?.toLowerCase()).toContain("default");
		expect(hint?.toLowerCase()).toMatch(/every|all/);
	});

	it("returns undefined for unrelated errors", () => {
		expect(addressErrorHint(new Error("something else"))).toBeUndefined();
		expect(addressErrorHint("not an error")).toBeUndefined();
	});
});
