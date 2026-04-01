import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTokens } from "../../src/commands/account/tokens.js";

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
								assetV2: [
									{ key: "1002000", value: 1000000 },
								],
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
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({ data: [{}] }))),
		);

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toEqual([]);
	});

	it("returns empty array when account does not exist", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({}))),
		);

		const client = createClient({ network: "mainnet" });
		const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

		expect(tokens).toEqual([]);
	});
});
