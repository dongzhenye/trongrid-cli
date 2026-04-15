import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	type AccountTransferRow,
	fetchAccountTransfers,
	sortTransfers,
} from "../../src/commands/account/transfers.js";
import { formatJsonList } from "../../src/output/format.js";
import { renderCenteredTransferList } from "../../src/output/transfers.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

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

// ---------- sortTransfers integration ----------

function mkRow(overrides: Partial<AccountTransferRow>): AccountTransferRow {
	return {
		tx_id: "tx_x",
		block_number: 1,
		timestamp: 1,
		direction: "out",
		counterparty: PEER,
		token_address: "Ttoken",
		token_symbol: "USDT",
		amount: "1000000",
		amount_unit: "raw",
		decimals: 6,
		amount_major: "1.0",
		...overrides,
	};
}

describe("sortTransfers (default: timestamp desc)", () => {
	const items: AccountTransferRow[] = [
		mkRow({ tx_id: "tx_b", timestamp: 2, block_number: 2, amount: "200", amount_major: "0.2" }),
		mkRow({ tx_id: "tx_c", timestamp: 3, block_number: 3, amount: "100", amount_major: "0.1" }),
		mkRow({ tx_id: "tx_a", timestamp: 1, block_number: 1, amount: "300", amount_major: "0.3" }),
	];

	it("defaults to timestamp desc (newest first)", () => {
		const out = sortTransfers(items, {});
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--sort-by amount sorts by amount desc (largest first)", () => {
		const out = sortTransfers(items, { sortBy: "amount" });
		// "300" > "200" > "100" as strings (equal length), but comparison is
		// string-based via compareField. For equal widths this matches numeric.
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by block_number sorts by block_number desc", () => {
		const out = sortTransfers(items, { sortBy: "block_number" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--reverse flips default to timestamp asc (oldest first)", () => {
		const out = sortTransfers(items, { reverse: true });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by amount breaks ties by timestamp desc (newest first)", () => {
		// Three tied-amount rows with distinct timestamps + one distinct amount
		// row. Under --sort-by amount, the tied block must order by timestamp
		// desc rather than falling back to input order.
		const tied: AccountTransferRow[] = [
			mkRow({ tx_id: "tx_tie_old", timestamp: 10, amount: "500", amount_major: "0.5" }),
			mkRow({ tx_id: "tx_tie_new", timestamp: 30, amount: "500", amount_major: "0.5" }),
			mkRow({ tx_id: "tx_big", timestamp: 20, amount: "900", amount_major: "0.9" }),
			mkRow({ tx_id: "tx_tie_mid", timestamp: 20, amount: "500", amount_major: "0.5" }),
		];
		const out = sortTransfers(tied, { sortBy: "amount" });
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

// ---------- renderCenteredTransferList (human) ----------

describe("renderCenteredTransferList (account transfers human output)", () => {
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
		renderCenteredTransferList([]);
		expect(captured).toHaveLength(1);
		expect(captured[0]).toContain("No transfers found");
	});

	it("renders singular header when n=1 and shows direction arrow", () => {
		const row = mkRow({
			tx_id: "abc1234deadbeef0000000000000000000000000000000000000000000000f3e9",
			timestamp: 1744694400000,
			direction: "out",
			amount_major: "1.0",
		});
		renderCenteredTransferList([row]);
		expect(captured[0]).toContain("Found 1 transfer");
		expect(captured[0]).not.toMatch(/Found 1 transfers/);
		// Row line contains the outbound arrow.
		const dataRow = captured[1] ?? "";
		expect(dataRow).toContain("→");
		expect(dataRow).toContain("USDT");
	});

	it("renders plural header and uses ← for inbound rows", () => {
		const rows: AccountTransferRow[] = [
			mkRow({ tx_id: "tx_out", direction: "out", amount_major: "1.0", timestamp: 2 }),
			mkRow({ tx_id: "tx_in", direction: "in", amount_major: "5.0", timestamp: 1 }),
		];
		renderCenteredTransferList(rows);
		expect(captured[0]).toContain("Found 2 transfers");
		const joined = captured.slice(1).join("\n");
		expect(joined).toContain("→");
		expect(joined).toContain("←");
	});
});

// ---------- JSON mode (--json, --fields) ----------

describe("account transfers JSON output", () => {
	const items: AccountTransferRow[] = [
		mkRow({
			tx_id: "tx_json_1",
			timestamp: 1744694400000,
			block_number: 70000000,
			direction: "out",
			counterparty: PEER,
			amount: "1000000",
			amount_major: "1.0",
		}),
	];

	it("--json emits the full S2 row shape including direction", () => {
		const raw = formatJsonList(items);
		const parsed = JSON.parse(raw) as AccountTransferRow[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed[0]).toMatchObject({
			tx_id: "tx_json_1",
			direction: "out",
			counterparty: PEER,
			token_address: "Ttoken",
			token_symbol: "USDT",
			amount: "1000000",
			amount_unit: "raw",
			decimals: 6,
			amount_major: "1.0",
		});
	});

	it("--json --fields projects only the requested keys", () => {
		const raw = formatJsonList(items, ["from", "to", "amount"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		// S2 shape doesn't have literal `from` / `to` fields (it has
		// `counterparty` + `direction`), so only `amount` survives.
		expect(parsed[0]).toEqual({ amount: "1000000" });
	});

	it("--json --fields with valid S2 keys keeps the selected columns", () => {
		const raw = formatJsonList(items, ["tx_id", "direction", "counterparty", "amount_major"]);
		const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
		expect(parsed[0]).toEqual({
			tx_id: "tx_json_1",
			direction: "out",
			counterparty: PEER,
			amount_major: "1.0",
		});
	});
});
