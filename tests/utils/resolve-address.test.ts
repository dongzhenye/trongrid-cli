import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { UsageError } from "../../src/output/format.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

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
