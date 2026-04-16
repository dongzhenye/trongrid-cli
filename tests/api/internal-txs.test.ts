import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchInternalTxs, sortInternalTxs } from "../../src/api/internal-txs.js";

const ADDRESS = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

// Known hex addresses for testing hex→Base58 conversion
const FROM_HEX = "416e0617948fe030a7e4970f8389d4ad295f249b7e";
const TO_HEX = "41891cdb91d149f23b1a45d9c5ca78a88d0cb44c18";
const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function mockFetch(fixture: unknown): void {
	globalThis.fetch = mock(() => {
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

	it("extracts internal txs from parent transactions with S1 unit shape", async () => {
		const fixture = {
			data: [
				{
					txID: "parent_tx_abc123",
					block_timestamp: 1776315840000,
					internal_transactions: [
						{
							internal_tx_id: "itx_001",
							from_address: FROM_HEX,
							to_address: TO_HEX,
							data: {
								note: "63616c6c", // "call" in hex
								rejected: false,
								call_value: { _: 1000000 },
							},
						},
					],
				},
			],
		};
		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });

		expect(rows.length).toBe(1);
		const row = rows[0]!;
		expect(row.internal_id).toBe("itx_001");
		expect(row.tx_id).toBe("parent_tx_abc123");
		expect(row.block_timestamp).toBe(1776315840000);
		// Hex addresses converted to Base58
		expect(BASE58_REGEX.test(row.from)).toBe(true);
		expect(BASE58_REGEX.test(row.to)).toBe(true);
		expect(row.call_type).toBe("call");
		expect(row.value).toBe(1000000);
		expect(row.value_unit).toBe("sun");
		expect(row.decimals).toBe(6);
		expect(row.value_trx).toBe("1");
		expect(row.rejected).toBe(false);
	});

	it("returns empty array when no transactions have internals", async () => {
		mockFetch({
			data: [
				{ txID: "tx1", block_timestamp: 1000, internal_transactions: [] },
				{ txID: "tx2", block_timestamp: 2000 }, // no internal_transactions field
			],
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
		expect(rows).toEqual([]);
	});

	it("handles rejected internal transactions", async () => {
		mockFetch({
			data: [
				{
					txID: "tx_rej",
					block_timestamp: 1776315840000,
					internal_transactions: [
						{
							internal_tx_id: "itx_rej",
							from_address: FROM_HEX,
							to_address: TO_HEX,
							data: { note: "63616c6c", rejected: true, call_value: { _: 0 } },
						},
					],
				},
			],
		});
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
		// Fetches 3x limit to account for txs without internals
		expect(capturedUrl).toContain("limit=30");
	});

	it("collects internals from multiple parent transactions", async () => {
		mockFetch({
			data: [
				{
					txID: "tx1",
					block_timestamp: 2000,
					internal_transactions: [
						{
							internal_tx_id: "itx_a",
							from_address: FROM_HEX,
							to_address: TO_HEX,
							data: { note: "63616c6c", rejected: false, call_value: { _: 100 } },
						},
					],
				},
				{
					txID: "tx2",
					block_timestamp: 1000,
					internal_transactions: [
						{
							internal_tx_id: "itx_b",
							from_address: FROM_HEX,
							to_address: TO_HEX,
							data: { note: "637265617465", rejected: false, call_value: { _: 200 } },
						},
						{
							internal_tx_id: "itx_c",
							from_address: TO_HEX,
							to_address: FROM_HEX,
							data: { note: "63616c6c", rejected: false, call_value: { _: 300 } },
						},
					],
				},
			],
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
		expect(rows.length).toBe(3);
		expect(rows[1]?.call_type).toBe("create");
	});

	it("respects limit on returned internal txs", async () => {
		mockFetch({
			data: [
				{
					txID: "tx1",
					block_timestamp: 1000,
					internal_transactions: Array.from({ length: 10 }, (_, i) => ({
						internal_tx_id: `itx_${i}`,
						from_address: FROM_HEX,
						to_address: TO_HEX,
						data: { note: "63616c6c", rejected: false, call_value: { _: 0 } },
					})),
				},
			],
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchInternalTxs(client, ADDRESS, { limit: 3 });
		expect(rows.length).toBe(3);
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

	it("throws on unknown sort field", () => {
		const items = [mkRow({})];
		expect(() => sortInternalTxs(items, { sortBy: "nonexistent" })).toThrow(
			/Unknown sort field/,
		);
	});
});
