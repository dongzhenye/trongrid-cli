import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	fetchAccountTokens,
	renderTokenList,
	type TokenBalance,
} from "../../src/commands/account/tokens.js";
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
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({ data: [] })));
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
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({ data: [] })));
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
			// Batch endpoint returns empty — forces individual fallback for both tokens.
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({ data: [] })));
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

	it("populates symbol and name from batch /v1/trc20/info response", async () => {
		const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [{ trc20: [{ [CONTRACT]: "6000000" }] }],
						}),
					),
				);
			}
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [
								{
									contract_address: CONTRACT,
									name: "Tether USD",
									symbol: "USDT",
									decimals: "6",
									type: "trc20",
									total_supply: "999999999999",
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
			contract_address: CONTRACT,
			balance: "6000000",
			decimals: 6,
			balance_major: "6.0",
			symbol: "USDT",
			name: "Tether USD",
		});
	});

	it("gracefully degrades to individual resolver when batch fetch fails", async () => {
		const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/accounts/")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({
							data: [{ trc20: [{ [CONTRACT]: "1000000" }] }],
						}),
					),
				);
			}
			// Batch endpoint hard-fails — individual on-chain path should take over.
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response("Service Unavailable", { status: 503 }));
			}
			// Individual resolver falls back to static map for USDT.
			if (url.includes("/wallet/triggerconstantcontract")) {
				throw new Error("should not be called for USDT (static map)");
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		// USDT is in the static map so individual resolver returns 6.
		expect(tokens[0]).toMatchObject({
			decimals: 6,
			balance_major: "1.0",
		});
		// Symbol not populated (batch failed, individual resolver doesn't return it).
		expect(tokens[0].symbol).toBeUndefined();
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

describe("renderTokenList (human output)", () => {
	// NO_COLOR forces styleText to emit plain ASCII; assertions stay simple.
	const originalNoColor = process.env.NO_COLOR;
	const originalLog = console.log;
	let captured: string[];

	beforeEach(() => {
		process.env.NO_COLOR = "1";
		captured = [];
		console.log = (msg?: unknown) => {
			captured.push(typeof msg === "string" ? msg : String(msg));
		};
	});

	afterEach(() => {
		console.log = originalLog;
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	it("shows empty-state message for an empty list", () => {
		renderTokenList([]);
		expect(captured).toHaveLength(1);
		expect(captured[0]).toContain("No tokens found");
	});

	it("shows singular 'Found 1 token' header when n=1", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				balance: "1234000",
				decimals: 6,
				balance_major: "1.234",
			},
		];
		renderTokenList(tokens);
		expect(captured[0]).toContain("Found 1 token");
		expect(captured[0]).not.toMatch(/Found 1 tokens/);
	});

	it("shows plural 'Found N tokens' header when n>1", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				balance: "1234000",
				decimals: 6,
				balance_major: "1.234",
			},
			{
				type: "TRC10",
				contract_address: "1000001",
				balance: "42",
				decimals: 0,
				balance_major: "42",
			},
		];
		renderTokenList(tokens);
		expect(captured[0]).toContain("Found 2 tokens");
	});

	it("renders `SYMBOL (contract) balance (raw N)` when balance_major is set", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				balance: "1234000",
				decimals: 6,
				balance_major: "1.234",
				symbol: "USDT",
			},
		];
		renderTokenList(tokens);
		// captured[0] = "Found N tokens:", captured[1] = header row, captured[2+] = data
		expect(captured[1]).toContain("Type");
		expect(captured[1]).toContain("Balance");
		const row = captured[2];
		expect(row).toContain("[TRC20]");
		expect(row).toContain("USDT");
		// Contract address rendered in parentheses with both-ends truncation (4+4).
		expect(row).toContain("(TR7NHq...gjLj6t)");
		expect(row).toContain("1.234");
		expect(row).toContain("(raw 1234000)");
	});

	it("shows [?] and (decimals unresolved) when balance_major is undefined", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TXYZunknownunknownunknownunknowxxxx",
				balance: "500000",
				// decimals and balance_major intentionally omitted (lookup failure)
			},
		];
		renderTokenList(tokens);
		const row = captured[2]; // skip header
		expect(row).toContain("[TRC20]");
		expect(row).toContain("[?]");
		expect(row).toContain("(TXYZun...owxxxx)");
		expect(row).toContain("500,000");
		expect(row).toContain("(decimals unresolved)");
		expect(row).not.toContain("(raw");
	});

	it("renders mixed resolved and unresolved tokens in one pass", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				balance: "1000000",
				decimals: 6,
				balance_major: "1",
			},
			{
				type: "TRC10",
				contract_address: "1000001",
				balance: "42",
				// unresolved
			},
		];
		renderTokenList(tokens);
		expect(captured[0]).toContain("Found 2 tokens");
		// captured[1] = header, captured[2] = first data, captured[3] = second data
		expect(captured[2]).toContain("(raw 1000000)");
		expect(captured[3]).toContain("[TRC10]");
		// TRC10 has unresolved decimals — shows (decimals unresolved), not (raw …)
		expect(captured[3]).not.toContain("(raw");
		expect(captured[3]).toContain("(decimals unresolved)");
	});

	it("shows symbol from batch info when available", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC20",
				contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
				balance: "1000000",
				decimals: 6,
				balance_major: "1.0",
				symbol: "USDT",
				name: "Tether USD",
			},
		];
		renderTokenList(tokens);
		const row = captured[2]; // skip header
		expect(row).toContain("USDT");
		expect(row).toContain("(TR7NHq...gjLj6t)");
	});

	it("suppresses (raw N) when balance_major equals balance (decimals=0)", () => {
		const tokens: TokenBalance[] = [
			{
				type: "TRC10",
				contract_address: "1000001",
				balance: "42",
				decimals: 0,
				balance_major: "42", // same as balance → no raw annotation
			},
		];
		renderTokenList(tokens);
		const row = captured[2]; // skip header
		expect(row).toContain("[TRC10]");
		expect(row).toContain("42");
		expect(row).not.toContain("(raw");
	});
});
