import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveApiKey } from "../../src/auth/store.js";
import { writeConfig } from "../../src/utils/config.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-auth-test");
const TEST_CONFIG = join(TEST_DIR, "config.json");

describe("resolveApiKey", () => {
	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		delete process.env.TRONGRID_API_KEY;
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		delete process.env.TRONGRID_API_KEY;
	});

	it("returns env var when set", () => {
		process.env.TRONGRID_API_KEY = "env-key-123";
		expect(resolveApiKey({ configPath: TEST_CONFIG })).toBe("env-key-123");
	});

	it("returns config file key when env var is not set", () => {
		writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
		expect(resolveApiKey({ configPath: TEST_CONFIG })).toBe("config-key-456");
	});

	it("prefers env var over config file", () => {
		process.env.TRONGRID_API_KEY = "env-key-123";
		writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
		expect(resolveApiKey({ configPath: TEST_CONFIG })).toBe("env-key-123");
	});

	it("returns undefined when neither is set", () => {
		expect(resolveApiKey({ configPath: TEST_CONFIG })).toBeUndefined();
	});

	it("inline key (from --api-key) wins over env var", () => {
		process.env.TRONGRID_API_KEY = "env-key-123";
		expect(resolveApiKey({ inlineKey: "inline-key-999", configPath: TEST_CONFIG })).toBe(
			"inline-key-999",
		);
	});

	it("inline key wins over config file", () => {
		writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
		expect(resolveApiKey({ inlineKey: "inline-key-999", configPath: TEST_CONFIG })).toBe(
			"inline-key-999",
		);
	});

	it("inline key wins over both env and config simultaneously", () => {
		process.env.TRONGRID_API_KEY = "env-key-123";
		writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
		expect(resolveApiKey({ inlineKey: "inline-key-999", configPath: TEST_CONFIG })).toBe(
			"inline-key-999",
		);
	});

	it("empty inline key falls through to env / config (treats '' as not provided)", () => {
		process.env.TRONGRID_API_KEY = "env-key-123";
		expect(resolveApiKey({ inlineKey: "", configPath: TEST_CONFIG })).toBe("env-key-123");
	});
});
