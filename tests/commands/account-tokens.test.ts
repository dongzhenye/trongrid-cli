import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTokens } from "../../src/commands/account/tokens.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

describe("account tokens", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses TRC20 and TRC10 tokens from /v1/accounts/:address", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						data: [
							{
								trc20: [
									{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "38927318000" },
									{ TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: "500000000000000000" },
								],
								assetV2: [{ key: "1002000", value: 1000000 }],
							},
						],
					}),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toHaveLength(3);
		expect(tokens[0]).toEqual({
			type: "TRC20",
			contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
			balance: "38927318000",
		});
		expect(tokens[1].type).toBe("TRC20");
		expect(tokens[2]).toEqual({
			type: "TRC10",
			contract_address: "1002000",
			balance: "1000000",
		});
	});

	it("returns empty array when account has no tokens", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ data: [{}] }))));

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toEqual([]);
	});

	it("returns empty array when account does not exist", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toEqual([]);
	});
});

// Tests for the default_address resolution helpers (resolveAddress + fetchAccountTokens).
//
// The commander-level wiring — that the action passes `address: string | undefined`
// to resolveAddress rather than validateAddress — is enforced by TypeScript's type
// system: reverting to validateAddress would be a compile error because the action
// argument type is `string | undefined`, which validateAddress does not accept.
describe("default_address resolution helpers", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-tokens-default-test");
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

		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(
				new Response(
					JSON.stringify({
						data: [{ trc20: [], assetV2: [] }],
					}),
				),
			);
		});

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, resolved);

		expect(capturedUrl).toContain(VALID);
		expect(tokens).toEqual([]);
	});
});
