import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { registerAccountInternalsCommand } from "../../src/commands/account/internals.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const VALID = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

describe("account internals command", () => {
	it("exports registerAccountInternalsCommand as a function", () => {
		expect(typeof registerAccountInternalsCommand).toBe("function");
	});

	it("re-exports shared internal-txs API functions via the module graph", async () => {
		const mod = await import("../../src/api/internal-txs.js");
		expect(typeof mod.fetchInternalTxs).toBe("function");
		expect(typeof mod.sortInternalTxs).toBe("function");
		expect(typeof mod.renderInternalTxs).toBe("function");
	});
});

describe("account internals default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-internals-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", VALID);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("uses config default_address when argument is omitted", () => {
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(VALID);
	});
});
