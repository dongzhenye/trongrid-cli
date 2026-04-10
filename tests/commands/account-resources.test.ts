import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import { fetchAccountResources } from "../../src/commands/account/resources.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

describe("account resources", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses energy and bandwidth from API response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						EnergyUsed: 5000,
						EnergyLimit: 50000,
						freeNetUsed: 100,
						freeNetLimit: 600,
						NetUsed: 200,
						NetLimit: 1000,
					}),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountResources(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(result.energy_used).toBe(5000);
		expect(result.energy_limit).toBe(50000);
		expect(result.bandwidth_used).toBe(300); // freeNetUsed + NetUsed
		expect(result.bandwidth_limit).toBe(1600); // freeNetLimit + NetLimit
	});

	it("defaults to zero when fields are missing", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({}))),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountResources(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(result.energy_used).toBe(0);
		expect(result.energy_limit).toBe(0);
		expect(result.bandwidth_used).toBe(0);
		expect(result.bandwidth_limit).toBe(0);
	});
});

// Tests for the default_address resolution helpers (resolveAddress + fetchAccountResources).
//
// The commander-level wiring — that the action passes `address: string | undefined`
// to resolveAddress rather than validateAddress — is enforced by TypeScript's type
// system: reverting to validateAddress would be a compile error because the action
// argument type is `string | undefined`, which validateAddress does not accept.
describe("default_address resolution helpers", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-resources-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");
	const VALID = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", VALID);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		globalThis.fetch = originalFetch;
	});

	it("uses config default_address when address arg is omitted", async () => {
		const resolved = resolveAddress(undefined, TEST_CONFIG);
		expect(resolved).toBe(VALID);

		// biome-ignore lint/suspicious/noExplicitAny: test helper
		let capturedBody: any;
		globalThis.fetch = mock((_url: string, init: RequestInit) => {
			capturedBody = JSON.parse(init.body as string);
			return Promise.resolve(
				new Response(
					JSON.stringify({
						EnergyUsed: 1000,
						EnergyLimit: 10000,
						freeNetUsed: 50,
						freeNetLimit: 600,
					}),
				),
			);
		});

		const client = createClient({ network: "mainnet" });
		const data = await fetchAccountResources(client, resolved);

		expect(capturedBody.address).toBe(VALID);
		expect(data.address).toBe(VALID);
	});
});
