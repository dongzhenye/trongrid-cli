import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTransfers } from "../../src/commands/account/transfers.js";

const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

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
					to: "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV",
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
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(fixture), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			),
		);

		const client = createClient({ network: "mainnet" });
		const rows = await fetchAccountTransfers(client, SUBJECT, { limit: 20 });

		expect(rows.length).toBeGreaterThan(0);
		expect(rows[0]?.direction).toBe("out");
		expect(rows[0]?.token_symbol).toBe("USDT");
		expect(rows[0]?.amount_major).toBe("1.000000");
	});
});
