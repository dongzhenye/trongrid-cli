import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTokens } from "../../src/commands/account/tokens.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";
import {
	_resetTrc10DecimalsCacheForTests,
	_resetTrc20DecimalsCacheForTests,
} from "../../src/utils/tokens.js";

describe("account tokens", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		_resetTrc20DecimalsCacheForTests();
		_resetTrc10DecimalsCacheForTests();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses TRC20 and TRC10 tokens from /v1/accounts/:address", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
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
				);
			}
			if (url.includes("/wallet/getassetissuebyid")) {
				return Promise.resolve(new Response(JSON.stringify({ id: "1002000", precision: 0 })));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toHaveLength(3);
		expect(tokens[0]).toMatchObject({
			type: "TRC20",
			contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
			balance: "38927318000",
			decimals: 6,
			balance_major: "38927.318",
		});
		expect(tokens[1]).toMatchObject({
			type: "TRC20",
			contract_address: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
			balance: "500000000000000000",
			decimals: 6,
			balance_major: "500000000000.0",
		});
		expect(tokens[2]).toMatchObject({
			type: "TRC10",
			contract_address: "1002000",
			balance: "1000000",
			decimals: 0,
			balance_major: "1000000",
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

	it("enriches TRC20 entries with decimals and balance_major", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [
								{
									trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "1234000" }],
								},
							],
						}),
					),
				);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toHaveLength(1);
		expect(tokens[0]).toMatchObject({
			type: "TRC20",
			contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
			balance: "1234000",
			decimals: 6,
			balance_major: "1.234",
		});
	});

	it("enriches TRC10 entries with decimals and balance_major via getassetissuebyid", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [
								{
									assetV2: [{ key: "1002000", value: 1234567 }],
								},
							],
						}),
					),
				);
			}
			if (url.includes("/wallet/getassetissuebyid")) {
				return Promise.resolve(new Response(JSON.stringify({ id: "1002000", precision: 6 })));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});
		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
		expect(tokens[0]).toMatchObject({
			type: "TRC10",
			contract_address: "1002000",
			balance: "1234567",
			decimals: 6,
			balance_major: "1.234567",
		});
	});

	it("leaves decimals undefined on lookup failure without breaking siblings", async () => {
		_resetTrc20DecimalsCacheForTests();

		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [
								{
									trc20: [
										{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "1000000" }, // USDT, static map
										{ TXYZunknownnnnnnnnnnnnnnnnnnnnnnnnn: "500000" }, // unknown, will fail
									],
								},
							],
						}),
					),
				);
			}
			if (url.includes("/wallet/triggerconstantcontract")) {
				return Promise.resolve(new Response("not json at all", { status: 500 }));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toHaveLength(2);

		// USDT (static path) should be fully populated.
		const usdt = tokens.find((t) => t.contract_address === "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
		expect(usdt).toMatchObject({
			type: "TRC20",
			balance: "1000000",
			decimals: 6,
			balance_major: "1.0",
		});

		// Unknown token failed decimals lookup — fields should be undefined, balance still present.
		const unknown = tokens.find(
			(t) => t.contract_address === "TXYZunknownnnnnnnnnnnnnnnnnnnnnnnnn",
		);
		expect(unknown).toBeDefined();
		expect(unknown?.balance).toBe("500000");
		expect(unknown?.decimals).toBeUndefined();
		expect(unknown?.balance_major).toBeUndefined();
	});

	it("handles TRC10 tokens with precision 0 (legacy early tokens)", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [
								{
									assetV2: [{ key: "1000001", value: 42 }],
								},
							],
						}),
					),
				);
			}
			if (url.includes("/wallet/getassetissuebyid")) {
				return Promise.resolve(new Response(JSON.stringify({ id: "1000001" })));
			}
			throw new Error(`Unexpected URL: ${url}`);
		});
		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
		expect(tokens[0]).toMatchObject({
			type: "TRC10",
			contract_address: "1000001",
			balance: "42",
			decimals: 0,
			balance_major: "42",
		});
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
		_resetTrc20DecimalsCacheForTests();
		_resetTrc10DecimalsCacheForTests();
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
