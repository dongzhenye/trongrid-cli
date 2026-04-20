import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import {
	fetchContractEvents,
	sortContractEvents,
} from "../../src/commands/contract/events.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const FROM_HEX = "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c";
const TO_HEX = "0xffd14c4e694cb47f3cd909ecaf2d73859796553e";

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

describe("fetchContractEvents", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses event logs with hex→Base58 address conversion in params", async () => {
		mockFetch({
			data: [
				{
					event_name: "Transfer",
					transaction_id: "tx_abc",
					block_number: 81882707,
					block_timestamp: 1776315840000,
					result: { from: FROM_HEX, to: TO_HEX, value: "1000000" },
				},
			],
		});

		const client = createClient({ network: "mainnet" });
		const { rows } = await fetchContractEvents(client, CONTRACT, { limit: 20 });

		expect(rows.length).toBe(1);
		expect(rows[0]?.event_name).toBe("Transfer");
		expect(rows[0]?.transaction_id).toBe("tx_abc");
		// Address params should be converted to Base58
		expect(BASE58_REGEX.test(rows[0]?.params.from ?? "")).toBe(true);
		expect(BASE58_REGEX.test(rows[0]?.params.to ?? "")).toBe(true);
		// Non-address value passes through unchanged
		expect(rows[0]?.params.value).toBe("1000000");
	});

	it("filters by event name case-insensitively", async () => {
		mockFetch({
			data: [
				{
					event_name: "Transfer",
					transaction_id: "tx1",
					block_number: 1,
					block_timestamp: 1000,
					result: {},
				},
				{
					event_name: "Approval",
					transaction_id: "tx2",
					block_number: 2,
					block_timestamp: 2000,
					result: {},
				},
				{
					event_name: "Transfer",
					transaction_id: "tx3",
					block_number: 3,
					block_timestamp: 3000,
					result: {},
				},
			],
		});

		const client = createClient({ network: "mainnet" });
		// lowercase "transfer" should match "Transfer"
		const { rows } = await fetchContractEvents(client, CONTRACT, {
			limit: 20,
			eventFilter: "transfer",
		});
		expect(rows.length).toBe(2);
		expect(rows.every((r) => r.event_name === "Transfer")).toBe(true);
	});

	it("returns empty array when no events", async () => {
		mockFetch({ data: [] });
		const client = createClient({ network: "mainnet" });
		const { rows } = await fetchContractEvents(client, CONTRACT, { limit: 20 });
		expect(rows).toEqual([]);
	});

	it("non-address params pass through unchanged", async () => {
		mockFetch({
			data: [
				{
					event_name: "Swap",
					transaction_id: "tx_swap",
					block_number: 100,
					block_timestamp: 5000,
					result: {
						amount0In: "50000000",
						amount1Out: "123456",
						sender: FROM_HEX,
					},
				},
			],
		});

		const client = createClient({ network: "mainnet" });
		const { rows } = await fetchContractEvents(client, CONTRACT, { limit: 20 });

		expect(rows.length).toBe(1);
		// Numeric strings pass through
		expect(rows[0]?.params.amount0In).toBe("50000000");
		expect(rows[0]?.params.amount1Out).toBe("123456");
		// Hex address is converted
		expect(BASE58_REGEX.test(rows[0]?.params.sender ?? "")).toBe(true);
	});
});

describe("sortContractEvents", () => {
	function mkRow(overrides: Partial<ReturnType<typeof buildRow>>): ReturnType<typeof buildRow> {
		return { ...buildRow(), ...overrides };
	}

	function buildRow() {
		return {
			event_name: "Transfer",
			transaction_id: "tx_x",
			block_number: 1,
			block_timestamp: 1000,
			params: {} as Record<string, string>,
		};
	}

	it("defaults to block_timestamp desc", () => {
		const items = [
			mkRow({ transaction_id: "a", block_timestamp: 1000 }),
			mkRow({ transaction_id: "b", block_timestamp: 3000 }),
			mkRow({ transaction_id: "c", block_timestamp: 2000 }),
		];
		const out = sortContractEvents(items, {});
		expect(out.map((x) => x.transaction_id)).toEqual(["b", "c", "a"]);
	});

	it("--reverse flips to block_timestamp asc", () => {
		const items = [
			mkRow({ transaction_id: "a", block_timestamp: 1000 }),
			mkRow({ transaction_id: "b", block_timestamp: 3000 }),
			mkRow({ transaction_id: "c", block_timestamp: 2000 }),
		];
		const out = sortContractEvents(items, { reverse: true });
		expect(out.map((x) => x.transaction_id)).toEqual(["a", "c", "b"]);
	});

	it("--sort-by event_name sorts alphabetically asc", () => {
		const items = [
			mkRow({ event_name: "Transfer", block_timestamp: 1000 }),
			mkRow({ event_name: "Approval", block_timestamp: 2000 }),
			mkRow({ event_name: "Swap", block_timestamp: 3000 }),
		];
		const out = sortContractEvents(items, { sortBy: "event_name" });
		expect(out.map((x) => x.event_name)).toEqual(["Approval", "Swap", "Transfer"]);
	});

	it("rejects unknown sort field", () => {
		const items = [mkRow({})];
		expect(() => sortContractEvents(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});
});
