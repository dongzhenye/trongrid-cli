import { describe, expect, it } from "bun:test";
import { validateConfigKey, validateConfigValue } from "../../src/commands/config/set.js";

describe("config set validation", () => {
	it("accepts known keys", () => {
		expect(() => validateConfigKey("network")).not.toThrow();
		expect(() => validateConfigKey("default_address")).not.toThrow();
	});

	it("rejects unknown keys with a helpful message", () => {
		expect(() => validateConfigKey("netwrok")).toThrow(/unknown config key.*netwrok.*network/);
	});

	it("validates address format for default_address", () => {
		expect(() => validateConfigValue("default_address", "not-an-address")).toThrow(
			/invalid tron address/i,
		);
		expect(() =>
			validateConfigValue("default_address", "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW"),
		).not.toThrow();
	});

	it("does not validate format for other keys", () => {
		expect(() => validateConfigValue("network", "mainnet")).not.toThrow();
	});
});
