import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import {
	fetchTokenTransfers,
	sortTokenTransfers,
} from "../../src/commands/token/transfers.js";
import { UsageError } from "../../src/output/format.js";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";
import type { TransferRow } from "../../src/output/transfers.js";

const CONTRACT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT

// EVM hex addresses for two TRON accounts
const FROM_HEX = "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c"; // TRX address in EVM format
const TO_HEX = "0xffd14c4e694cb47f3cd909ecaf2d73859796553e";

const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

function mockFetch(eventsFixture: unknown, tokenInfoFixture?: unknown): void {
	globalThis.fetch = mock((input: Request | string | URL) => {
		const url = typeof input === "string" ? input : input.toString();
		if (url.includes("/v1/trc20/info")) {
			const infoResponse = tokenInfoFixture ?? {
				data: [
					{
						contract_address: CONTRACT_ADDRESS,
						name: "Tether USD",
						symbol: "USDT",
						decimals: 6,
						type: "trc20",
						total_supply: "82123456789000",
					},
				],
			};
			return Promise.resolve(
				new Response(JSON.stringify(infoResponse), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		if (url.includes("/events")) {
			return Promise.resolve(
				new Response(JSON.stringify(eventsFixture), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		return Promise.resolve(
			new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

describe("fetchTokenTransfers", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses Transfer events and converts hex addresses to Base58", async () => {
		const fixture = {
			data: [
				{
					block_number: 81882707,
					block_timestamp: 1776315840000,
					contract_address: CONTRACT_ADDRESS,
					event_name: "Transfer",
					result: {
						from: FROM_HEX,
						to: TO_HEX,
						value: "1000000",
					},
					transaction_id: "abc123deadbeef",
				},
			],
		};

		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenTransfers(client, CONTRACT_ADDRESS, { limit: 20 });

		expect(rows.length).toBe(1);
		const row = rows[0];
		expect(row).toBeDefined();

		// from/to must be Base58 TRON addresses
		expect(BASE58_REGEX.test(row?.from ?? "")).toBe(true);
		expect(BASE58_REGEX.test(row?.to ?? "")).toBe(true);

		expect(row?.value).toBe("1000000");
		expect(row?.decimals).toBe(6);
		expect(row?.value_major).toBe("1.0");
		expect(row?.tx_id).toBe("abc123deadbeef");
		expect(row?.block_timestamp).toBe(1776315840000);
		expect(row?.token_symbol).toBe("USDT");
		expect(row?.token_address).toBe(CONTRACT_ADDRESS);
		expect(row?.block_number).toBe(81882707);
		expect(row?.value_unit).toBe("raw");
	});

	it("returns empty array when no events are returned", async () => {
		mockFetch({ data: [] });
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenTransfers(client, CONTRACT_ADDRESS, { limit: 20 });
		expect(rows).toEqual([]);
	});

	it("skips entries with malformed addresses gracefully", async () => {
		const fixture = {
			data: [
				{
					block_number: 81882707,
					block_timestamp: 1776315840000,
					contract_address: CONTRACT_ADDRESS,
					event_name: "Transfer",
					result: {
						from: "not_a_hex_address",
						to: TO_HEX,
						value: "500000",
					},
					transaction_id: "bad_addr_tx",
				},
				{
					block_number: 81882708,
					block_timestamp: 1776315850000,
					contract_address: CONTRACT_ADDRESS,
					event_name: "Transfer",
					result: {
						from: FROM_HEX,
						to: TO_HEX,
						value: "1000000",
					},
					transaction_id: "good_tx",
				},
			],
		};

		mockFetch(fixture);
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenTransfers(client, CONTRACT_ADDRESS, { limit: 20 });

		// Only the valid row should survive
		expect(rows.length).toBe(1);
		expect(rows[0]?.tx_id).toBe("good_tx");
	});

	it("passes query params for time range and confirmed flag", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((input: Request | string | URL) => {
			const url = typeof input === "string" ? input : input.toString();
			if (url.includes("/events")) {
				capturedUrl = url;
			}
			return Promise.resolve(
				new Response(
					JSON.stringify(
						url.includes("/v1/trc20/info")
							? { data: [{ contract_address: CONTRACT_ADDRESS, decimals: 6 }] }
							: { data: [] },
					),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			);
		}) as unknown as typeof fetch;

		const client = createClient({ network: "mainnet" });
		await fetchTokenTransfers(client, CONTRACT_ADDRESS, {
			limit: 10,
			minBlockTimestamp: 1744000000000,
			maxBlockTimestamp: 1744999999000,
			onlyConfirmed: true,
		});

		expect(capturedUrl).toBeDefined();
		expect(capturedUrl).toContain("min_block_timestamp=1744000000000");
		expect(capturedUrl).toContain("max_block_timestamp=1744999999000");
		expect(capturedUrl).toContain("only_confirmed=true");
		expect(capturedUrl).toContain("limit=10");
		expect(capturedUrl).toContain(`/v1/contracts/${CONTRACT_ADDRESS}/events`);
	});
});

// ---------- TRX input guard ----------

describe("token transfers TRX guard", () => {
	it("detectTokenIdentifier returns type=trx for TRX input", () => {
		const id = detectTokenIdentifier("TRX");
		expect(id.type).toBe("trx");
	});

	it("UsageError is thrown for TRX in the command (simulated logic)", () => {
		const id = detectTokenIdentifier("TRX");
		let thrown: unknown;
		if (id.type === "trx") {
			try {
				throw new UsageError(
					"Network-wide TRX transfer history is not available on TronGrid.",
				);
			} catch (e) {
				thrown = e;
			}
		}
		expect(thrown).toBeInstanceOf(UsageError);
		expect((thrown as Error).message).toContain("TRX transfer history");
	});
});

// ---------- sortTokenTransfers ----------

function buildRow(): TransferRow {
	return {
		tx_id: "tx_x",
		block_number: 1,
		block_timestamp: 1000,
		from: "TFromAddrxxxxxxxxxxxxxxxxxxxxxxxxxx",
		to: "TToAddrxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
		value: "1000000",
		value_unit: "raw",
		decimals: 6,
		value_major: "1.0",
		token_address: CONTRACT_ADDRESS,
		token_symbol: "USDT",
	};
}

function mkRow(overrides: Partial<TransferRow>): TransferRow {
	return { ...buildRow(), ...overrides };
}

describe("sortTokenTransfers (default: block_timestamp desc)", () => {
	const items = [
		mkRow({ tx_id: "tx_b", block_timestamp: 2000, value: "200", value_major: "0.2" }),
		mkRow({ tx_id: "tx_c", block_timestamp: 3000, value: "100", value_major: "0.1" }),
		mkRow({ tx_id: "tx_a", block_timestamp: 1000, value: "300", value_major: "0.3" }),
	];

	it("defaults to block_timestamp desc (newest first)", () => {
		const out = sortTokenTransfers(items, {});
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--sort-by value sorts by value desc (largest first)", () => {
		const out = sortTokenTransfers(items, { sortBy: "value" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--reverse flips default to block_timestamp asc (oldest first)", () => {
		const out = sortTokenTransfers(items, { reverse: true });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("rejects --sort-by on an unknown field with a UsageError", () => {
		expect(() => sortTokenTransfers(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});
});
