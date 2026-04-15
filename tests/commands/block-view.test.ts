import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchBlockView } from "../../src/commands/block/view.js";

const blockFixture = {
	blockID: "000000000427d540abc123",
	block_header: {
		raw_data: {
			number: 70000000,
			timestamp: 1711929600000,
			witness_address: "41abc123",
			parentHash: "000000000427d53fabc122",
		},
	},
	transactions: [{}, {}, {}],
};

describe("block view", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches by number via /wallet/getblockbynum", async () => {
		let capturedUrl: string | undefined;
		let capturedBody: string | undefined;
		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			capturedUrl = url;
			capturedBody = init?.body as string | undefined;
			return Promise.resolve(new Response(JSON.stringify(blockFixture)));
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchBlockView(
			client,
			{ kind: "number", value: 70000000 },
			{ confirmed: false },
		);

		expect(capturedUrl).toContain("/wallet/getblockbynum");
		expect(capturedBody).toContain("70000000");
		expect(result.block_id).toBe("000000000427d540abc123");
		expect(result.number).toBe(70000000);
		expect(result.tx_count).toBe(3);
		expect(result.parent_hash).toBe("000000000427d53fabc122");
	});

	it("fetches by hash via /wallet/getblockbyid", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(new Response(JSON.stringify(blockFixture)));
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchBlockView(
			client,
			{ kind: "hash", value: "000000000427d540abc123" },
			{ confirmed: false },
		);

		expect(capturedUrl).toContain("/wallet/getblockbyid");
		expect(result.block_id).toBe("000000000427d540abc123");
	});

	it("routes to /walletsolidity/* when confirmed is true", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(new Response(JSON.stringify(blockFixture)));
		});

		const client = createClient({ network: "mainnet" });
		await fetchBlockView(client, { kind: "number", value: 70000000 }, { confirmed: true });

		expect(capturedUrl).toContain("/walletsolidity/getblockbynum");
	});

	it("routes to /walletsolidity/getblockbyid when confirmed + hash", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(new Response(JSON.stringify(blockFixture)));
		});

		const client = createClient({ network: "mainnet" });
		await fetchBlockView(
			client,
			{ kind: "hash", value: "000000000427d540abc123" },
			{ confirmed: true },
		);

		expect(capturedUrl).toContain("/walletsolidity/getblockbyid");
	});

	it("throws a friendly error when the block is not found", async () => {
		// FullNode returns an empty object for an unknown block.
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));

		const client = createClient({ network: "mainnet" });
		await expect(
			fetchBlockView(client, { kind: "number", value: 999999999999 }, { confirmed: false }),
		).rejects.toThrow(/block not found/i);
	});

	it("handles blocks with no transactions", async () => {
		const noTxs = { ...blockFixture, transactions: undefined };
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(noTxs))));

		const client = createClient({ network: "mainnet" });
		const result = await fetchBlockView(
			client,
			{ kind: "number", value: 70000000 },
			{ confirmed: false },
		);
		expect(result.tx_count).toBe(0);
	});
});
