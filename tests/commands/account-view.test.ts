import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import { fetchAccountView } from "../../src/commands/account/view.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

describe("account view", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
						balance: 50_000_000,
						create_time: 1600000000000,
						account_resource: {},
					}),
				),
			),
		);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches and formats account data", async () => {
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(result.address).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
		expect(result.balance).toBe(50_000_000);
		expect(result.balance_trx).toBe("50");
		expect(result.is_contract).toBe(false);
		expect(result.create_time).toBe(1600000000000);
	});

	it("handles account with zero balance", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
						create_time: 1600000000000,
						account_resource: {},
					}),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(result.balance).toBe(0);
		expect(result.balance_trx).toBe("0");
	});

	it("identifies contract accounts", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
						balance: 0,
						type: "Contract",
						create_time: 1600000000000,
					}),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(result.is_contract).toBe(true);
	});
});

// Tests for the default_address resolution helpers (resolveAddress + fetchAccountView).
//
// The commander-level wiring — that the action passes `address: string | undefined`
// to resolveAddress rather than validateAddress — is enforced by TypeScript's type
// system: reverting to validateAddress would be a compile error because the action
// argument type is `string | undefined`, which validateAddress does not accept.
describe("default_address resolution helpers", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-view-default-test");
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
						address: VALID,
						balance: 100,
						create_time: 1700000000000,
						account_resource: {},
					}),
				),
			);
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountView(client, resolved);

		expect(capturedBody.address).toBe(VALID);
		expect(result.address).toBe(VALID);
	});
});
