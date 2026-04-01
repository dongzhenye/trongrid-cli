import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountResources } from "../../src/commands/account/resources.js";

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
