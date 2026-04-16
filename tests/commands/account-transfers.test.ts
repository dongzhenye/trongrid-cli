import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	fetchAccountTransfers,
	sortTransfers,
} from "../../src/commands/account/transfers.js";
import { formatJsonList } from "../../src/output/format.js";
import type { TransferRow } from "../../src/output/transfers.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const PEER = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxxxxfyEV";

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

	it("parses TRC-20 transfer rows with from/to and direction=out when from matches subject", async () => {
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
		expect(rows[0]?.from).toBe(SUBJECT);
		expect(rows[0]?.to).toBe(PEER);
		expect(rows[0]?.direction).toBe("out");
		expect(rows[0]?.token_symbol).toBe("USDT");
		expect(rows[0]?.value_major).toBe("1.0");
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

		expect(rows[0]?.from).toBe(PEER);
		expect(rows[0]?.to).toBe(SUBJECT);
		expect(rows[0]?.direction).toBe("in");
		expect(rows[0]?.value_major).toBe("2.5");
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

// ---------- sortTransfers integration ----------

function mkRow(overrides: Partial<TransferRow>): TransferRow {
	return {
		tx_id: "tx_x",
		block_number: 1,
		block_timestamp: 1,
		from: SUBJECT,
		to: PEER,
		value: "1000000",
		value_unit: "raw",
		decimals: 6,
		value_major: "1.0",
		token_address: "Ttoken",
		token_symbol: "USDT",
		direction: "out",
		...overrides,
	};
}

describe("sortTransfers (default: block_timestamp desc)", () => {
	const items: TransferRow[] = [
		mkRow({ tx_id: "tx_b", block_timestamp: 2, block_number: 2, value: "200", value_major: "0.2" }),
		mkRow({ tx_id: "tx_c", block_timestamp: 3, block_number: 3, value: "100", value_major: "0.1" }),
		mkRow({ tx_id: "tx_a", block_timestamp: 1, block_number: 1, value: "300", value_major: "0.3" }),
	];

	it("defaults to block_timestamp desc (newest first)", () => {
		const out = sortTransfers(items, {});
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--sort-by value sorts by value desc (largest first)", () => {
		const out = sortTransfers(items, { sortBy: "value" });
		// "300" > "200" > "100" as strings (equal length), but comparison is
		// string-based via compareField. For equal widths this matches numeric.
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by block_number sorts by block_number desc", () => {
		const out = sortTransfers(items, { sortBy: "block_number" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--reverse flips default to block_timestamp asc (oldest first)", () => {
		const out = sortTransfers(items, { reverse: true });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by value breaks ties by block_timestamp desc (newest first)", () => {
		const tied: TransferRow[] = [
			mkRow({ tx_id: "tx_tie_old", block_timestamp: 10, value: "500", value_major: "0.5" }),
			mkRow({ tx_id: "tx_tie_new", block_timestamp: 30, value: "500", value_major: "0.5" }),
			mkRow({ tx_id: "tx_big", block_timestamp: 20, value: "900", value_major: "0.9" }),
			mkRow({ tx_id: "tx_tie_mid", block_timestamp: 20, value: "500", value_major: "0.5" }),
		];
		const out = sortTransfers(tied, { sortBy: "value" });
		expect(out.map((x) => x.tx_id)).toEqual([
			"tx_big",
			"tx_tie_new",
			"tx_tie_mid",
			"tx_tie_old",
		]);
	});

	it("rejects --sort-by on an unknown field with a UsageError", () => {
		expect(() => sortTransfers(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});
});

// ---------- default_address resolution ----------

describe("account transfers default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-transfers-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", SUBJECT);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("uses config default_address when argument is omitted", () => {
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(SUBJECT);
	});
});

// ---------- JSON mode (--json, --fields) ----------

describe("account transfers JSON output", () => {
	const items: TransferRow[] = [
		mkRow({
			tx_id: "tx_json_1",
			block_timestamp: 1744694400000,
			block_number: 70000000,
			from: SUBJECT,
			to: PEER,
			direction: "out",
			value: "1000000",
			value_major: "1.0",
		}),
	];

	it("--json emits the full TransferRow shape including from/to and direction", () => {
		const raw = formatJsonList(items);
		const parsed = JSON.parse(raw) as TransferRow[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0]).toMatchObject({
			tx_id: "tx_json_1",
			from: SUBJECT,
			to: PEER,
			direction: "out",
			token_address: "Ttoken",
			token_symbol: "USDT",
			value: "1000000",
			value_unit: "raw",
			decimals: 6,
			value_major: "1.0",
		});
	});

	it("--json --fields projects only the requested keys", () => {
		const raw = formatJsonList(items, ["from", "to", "value"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		expect(parsed[0]).toEqual({ from: SUBJECT, to: PEER, value: "1000000" });
	});

	it("--json --fields with valid keys keeps the selected columns", () => {
		const raw = formatJsonList(items, ["tx_id", "direction", "from", "value_major"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		expect(parsed[0]).toEqual({
			tx_id: "tx_json_1",
			direction: "out",
			from: SUBJECT,
			value_major: "1.0",
		});
	});
});
