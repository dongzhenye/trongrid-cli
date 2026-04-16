import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchInternalTxs, sortInternalTxs } from "../../src/api/internal-txs.js";

const ADDRESS = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

function mockFetch(fixture: unknown): void {
	globalThis.fetch = mock((input: Request | string | URL) => {
		return Promise.resolve(
			new Response(JSON.stringify(fixture), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

describe("fetchInternalTxs", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses internal transactions with S1 unit shape", async () => {
		const fixture = {
			data: [
				{
					internal_id: "itx_001",
					hash: "abc123",
					block_timestamp: 1776315840000,
					caller_address: "TFromAddr",
					transferTo_address: "TToAddr",
					callValueInfo: [{ callValue: 1000000 }],
					call_type: "call",
					rejected: false,
				},
			],
		};
		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });

		expect(rows.length).toBe(1);
		const row = rows[0]!;
		expect(row.internal_id).toBe("itx_001");
		expect(row.tx_id).toBe("abc123");
		expect(row.from).toBe("TFromAddr");
		expect(row.to).toBe("TToAddr");
		expect(row.value).toBe(1000000);
		expect(row.value_unit).toBe("sun");
		expect(row.decimals).toBe(6);
		expect(row.value_trx).toBe("1");
		expect(row.call_type).toBe("call");
		expect(row.rejected).toBe(false);
	});

	it("returns empty array when no internal txs", async () => {
		mockFetch({ data: [] });
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
		expect(rows).toEqual([]);
	});

	it("handles rejected internal transactions", async () => {
		const fixture = {
			data: [
				{
					internal_id: "itx_rej",
					hash: "def456",
					block_timestamp: 1776315840000,
					caller_address: "TA",
					transferTo_address: "TB",
					callValueInfo: [{ callValue: 0 }],
					call_type: "call",
					rejected: true,
				},
			],
		};
		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
		expect(rows[0]?.rejected).toBe(true);
	});

	it("passes time range query params", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((input: Request | string | URL) => {
			capturedUrl = typeof input === "string" ? input : input.toString();
			return Promise.resolve(
				new Response(JSON.stringify({ data: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}) as unknown as typeof fetch;

		const client = createClient({ network: "mainnet" });
		await fetchInternalTxs(client, ADDRESS, {
			limit: 10,
			minTimestamp: 1744000000000,
			maxTimestamp: 1744999999000,
		});

		expect(capturedUrl).toContain("min_timestamp=1744000000000");
		expect(capturedUrl).toContain("max_timestamp=1744999999000");
		expect(capturedUrl).toContain("limit=10");
	});

	it("handles missing callValueInfo gracefully", async () => {
		const fixture = {
			data: [
				{
					internal_id: "itx_no_value",
					hash: "xyz789",
					block_timestamp: 1776315840000,
					caller_address: "TA",
					transferTo_address: "TB",
					call_type: "staticcall",
					rejected: false,
				},
			],
		};
		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });

		expect(rows[0]?.value).toBe(0);
		expect(rows[0]?.value_trx).toBe("0");
	});

	it("handles missing optional fields with defaults", async () => {
		const fixture = {
			data: [{}],
		};
		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });

		const row = rows[0]!;
		expect(row.internal_id).toBe("");
		expect(row.tx_id).toBe("");
		expect(row.block_timestamp).toBe(0);
		expect(row.from).toBe("");
		expect(row.to).toBe("");
		expect(row.call_type).toBe("call");
		expect(row.value).toBe(0);
		expect(row.rejected).toBe(false);
	});
});

describe("sortInternalTxs", () => {
	const mkRow = (overrides: Record<string, unknown>) => ({
		internal_id: "itx_x",
		tx_id: "tx_x",
		block_timestamp: 1000,
		from: "TA",
		to: "TB",
		call_type: "call",
		value: 0,
		value_unit: "sun" as const,
		decimals: 6 as const,
		value_trx: "0",
		rejected: false,
		...overrides,
	});

	it("defaults to block_timestamp desc", () => {
		const items = [
			mkRow({ internal_id: "a", block_timestamp: 1000 }),
			mkRow({ internal_id: "b", block_timestamp: 3000 }),
			mkRow({ internal_id: "c", block_timestamp: 2000 }),
		];
		const out = sortInternalTxs(items, {});
		expect(out.map((x) => x.internal_id)).toEqual(["b", "c", "a"]);
	});

	it("--sort-by value sorts by value desc", () => {
		const items = [
			mkRow({ internal_id: "a", value: 100 }),
			mkRow({ internal_id: "b", value: 300 }),
			mkRow({ internal_id: "c", value: 200 }),
		];
		const out = sortInternalTxs(items, { sortBy: "value" });
		expect(out.map((x) => x.internal_id)).toEqual(["b", "c", "a"]);
	});

	it("--sort-by call_type sorts asc", () => {
		const items = [
			mkRow({ internal_id: "a", call_type: "staticcall" }),
			mkRow({ internal_id: "b", call_type: "call" }),
			mkRow({ internal_id: "c", call_type: "delegatecall" }),
		];
		const out = sortInternalTxs(items, { sortBy: "call_type" });
		expect(out.map((x) => x.internal_id)).toEqual(["b", "c", "a"]);
	});

	it("--reverse flips direction", () => {
		const items = [
			mkRow({ internal_id: "a", block_timestamp: 1000 }),
			mkRow({ internal_id: "b", block_timestamp: 3000 }),
			mkRow({ internal_id: "c", block_timestamp: 2000 }),
		];
		const out = sortInternalTxs(items, { reverse: true });
		expect(out.map((x) => x.internal_id)).toEqual(["a", "c", "b"]);
	});

	it("returns empty array unchanged", () => {
		const out = sortInternalTxs([], {});
		expect(out).toEqual([]);
	});

	it("throws on unknown sort field", () => {
		const items = [mkRow({})];
		expect(() => sortInternalTxs(items, { sortBy: "nonexistent" })).toThrow(
			/Unknown sort field/,
		);
	});
});
