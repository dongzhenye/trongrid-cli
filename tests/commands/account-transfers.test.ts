import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTransfers } from "../../src/commands/account/transfers.js";

const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const PEER = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV";

function mockFetchWithCapture(fixture: unknown): { capturedUrl: string | undefined } {
	const ctx: { capturedUrl: string | undefined } = { capturedUrl: undefined };
	globalThis.fetch = mock((input: Request | string | URL) => {
		ctx.capturedUrl = typeof input === "string" ? input : input.toString();
		return Promise.resolve(
			new Response(JSON.stringify(fixture), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
	return ctx;
}

describe("fetchAccountTransfers", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses TRC-20 transfer rows with direction=out when from matches queried address", async () => {
		const fixture = {
			data: [
				{
					transaction_id: "abc123",
					block_timestamp: 1744694400000,
					block_number: 70000000,
					from: SUBJECT,
					to: PEER,
					type: "Transfer",
					value: "1000000",
					token_info: {
						symbol: "USDT",
						address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
						decimals: 6,
					},
				},
			],
		};
		mockFetchWithCapture(fixture);

		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });

		expect(rows.length).toBe(1);
		expect(rows[0]?.direction).toBe("out");
		expect(rows[0]?.counterparty).toBe(PEER);
		expect(rows[0]?.token_symbol).toBe("USDT");
		expect(rows[0]?.amount_major).toBe("1.0");
	});

	it("sets direction=in when from does not match subject", async () => {
		const fixture = {
			data: [
				{
					transaction_id: "def456",
					block_timestamp: 1744694500000,
					block_number: 70000001,
					from: PEER,
					to: SUBJECT,
					type: "Transfer",
					value: "2500000",
					token_info: {
						symbol: "USDT",
						address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
						decimals: 6,
					},
				},
			],
		};
		mockFetchWithCapture(fixture);

		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });

		expect(rows[0]?.direction).toBe("in");
		expect(rows[0]?.counterparty).toBe(PEER);
		expect(rows[0]?.amount_major).toBe("2.5");
	});

	it("passes --before / --after as min_timestamp / max_timestamp query params", async () => {
		const ctx = mockFetchWithCapture({ data: [] });
		const client = createClient({ network: "mainnet" });
		await fetchAccountTransfers(client, SUBJECT, {
			limit: 20,
			minTimestamp: 1744000000000,
			maxTimestamp: 1744999999000,
		});

		expect(ctx.capturedUrl).toBeDefined();
		expect(ctx.capturedUrl).toContain("min_timestamp=1744000000000");
		expect(ctx.capturedUrl).toContain("max_timestamp=1744999999000");
		expect(ctx.capturedUrl).toContain("limit=20");
		expect(ctx.capturedUrl).toContain(`/v1/accounts/${SUBJECT}/transactions/trc20`);
	});

	it("returns empty array when API returns no data", async () => {
		mockFetchWithCapture({ data: [] });
		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });
		expect(rows).toEqual([]);
	});
});
