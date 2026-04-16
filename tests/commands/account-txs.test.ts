import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	type AccountTxRow,
	fetchAccountTxs,
	renderTxs,
	sortTxs,
} from "../../src/commands/account/txs.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const VALID = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

const apiResponse = {
	data: [
		{
			txID: "tx_b",
			blockNumber: 70000002,
			block_timestamp: 1711929602000,
			net_fee: 100,
			energy_fee: 0,
			raw_data: {
				contract: [
					{
						type: "TransferContract",
						parameter: {
							value: {
								owner_address: VALID,
								to_address: "TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc",
								amount: 1000000,
							},
						},
					},
				],
			},
			ret: [{ contractRet: "SUCCESS" }],
		},
		{
			txID: "tx_c",
			blockNumber: 70000001,
			block_timestamp: 1711929601000,
			net_fee: 0,
			energy_fee: 300,
			raw_data: {
				contract: [
					{
						type: "TriggerSmartContract",
						parameter: {
							value: {
								owner_address: VALID,
								contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
								call_value: 0,
								data: "a9059cbb0000000000000000000000001234567890abcdef",
							},
						},
					},
				],
			},
			ret: [{ contractRet: "SUCCESS" }],
		},
		{
			txID: "tx_a",
			blockNumber: 70000000,
			block_timestamp: 1711929600000,
			net_fee: 50,
			energy_fee: 50,
			raw_data: {
				contract: [
					{
						type: "TransferContract",
						parameter: {
							value: {
								owner_address: "TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc",
								to_address: VALID,
								amount: 500000,
							},
						},
					},
				],
			},
			ret: [{ contractRet: "SUCCESS" }],
		},
	],
};

describe("fetchAccountTxs", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("calls /v1/accounts/:address/transactions with limit", async () => {
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(new Response(JSON.stringify(apiResponse)));
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });

		expect(capturedUrl).toContain(`/v1/accounts/${VALID}/transactions`);
		expect(capturedUrl).toContain("limit=20");
		expect(result).toHaveLength(3);
		expect(result[0]).toMatchObject({
			tx_id: "tx_b",
			block_number: 70000002,
			timestamp: 1711929602000,
			contract_type: "TransferContract",
			type_display: "Transfer",
			from: VALID,
			to: "TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc",
			amount: 1000000,
			amount_trx: "1",
			status: "SUCCESS",
			confirmed: true,
			fee: 100,
			fee_unit: "sun",
			decimals: 6,
			fee_trx: "0.0001",
		});
	});

	it("maps total fee as net_fee + energy_fee", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(apiResponse))));
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });
		const txA = result.find((r) => r.tx_id === "tx_a");
		expect(txA?.fee).toBe(100); // 50 + 50
	});

	it("extracts from/to/amount from raw_data parameter value", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(apiResponse))));
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });

		// tx_b: TransferContract
		const txB = result.find((r) => r.tx_id === "tx_b");
		expect(txB?.from).toBe(VALID);
		expect(txB?.to).toBe("TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc");
		expect(txB?.amount).toBe(1000000);

		// tx_c: TriggerSmartContract (uses contract_address and call_value)
		const txC = result.find((r) => r.tx_id === "tx_c");
		expect(txC?.from).toBe(VALID);
		expect(txC?.to).toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
		expect(txC?.amount).toBe(0);
		expect(txC?.method_selector).toBe("0xa9059cbb");
	});

	it("derives type_display for TriggerSmartContract with data as selector hex", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(apiResponse))));
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });
		const txC = result.find((r) => r.tx_id === "tx_c");
		expect(txC?.type_display).toBe("0xa9059cbb");
	});

	it("returns empty array when the account has no txs", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ data: [] }))));
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });
		expect(result).toEqual([]);
	});

	it("handles missing optional fields gracefully", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						data: [{ txID: "tx_x", blockNumber: 1, block_timestamp: 0, raw_data: { contract: [] } }],
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchAccountTxs(client, VALID, { limit: 20 });
		expect(result[0]).toMatchObject({
			tx_id: "tx_x",
			contract_type: "Unknown",
			status: "UNKNOWN",
			fee: 0,
			from: "",
			to: "",
			amount: 0,
			confirmed: true,
		});
	});
});

// Helper to build a minimal AccountTxRow for sort tests
function makeRow(overrides: Partial<AccountTxRow> & { tx_id: string }): AccountTxRow {
	return {
		timestamp: 0,
		block_number: 0,
		fee: 0,
		contract_type: "T",
		type_display: "Transfer",
		from: "",
		to: "",
		amount: 0,
		amount_unit: "sun",
		amount_trx: "0",
		status: "SUCCESS",
		confirmed: true,
		fee_unit: "sun",
		decimals: 6,
		fee_trx: "0",
		...overrides,
	};
}

describe("sortTxs (default: timestamp desc)", () => {
	const items: AccountTxRow[] = [
		makeRow({ tx_id: "tx_b", timestamp: 2, block_number: 2, fee: 100 }),
		makeRow({ tx_id: "tx_c", timestamp: 3, block_number: 3, fee: 50 }),
		makeRow({ tx_id: "tx_a", timestamp: 1, block_number: 1, fee: 300 }),
	];

	it("defaults to timestamp desc (newest first)", () => {
		const out = sortTxs(items, {});
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--reverse flips to oldest first", () => {
		const out = sortTxs(items, { reverse: true });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by fee sorts by fee desc", () => {
		const out = sortTxs(items, { sortBy: "fee" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
	});

	it("--sort-by block_number desc", () => {
		const out = sortTxs(items, { sortBy: "block_number" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
	});

	it("--sort-by amount sorts by amount desc", () => {
		const amountItems = [
			makeRow({ tx_id: "tx_low", timestamp: 1, amount: 100 }),
			makeRow({ tx_id: "tx_high", timestamp: 2, amount: 5000000 }),
			makeRow({ tx_id: "tx_mid", timestamp: 3, amount: 1000 }),
		];
		const out = sortTxs(amountItems, { sortBy: "amount" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_high", "tx_mid", "tx_low"]);
	});

	it("rejects --sort-by on an unknown field with a hint", () => {
		expect(() => sortTxs(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});

	it("--sort-by fee breaks ties by timestamp desc (newest first)", () => {
		const tiedItems: AccountTxRow[] = [
			makeRow({ tx_id: "tx_zero_old", timestamp: 10, block_number: 10, fee: 0 }),
			makeRow({ tx_id: "tx_zero_new", timestamp: 30, block_number: 30, fee: 0 }),
			makeRow({ tx_id: "tx_paid", timestamp: 20, block_number: 20, fee: 500 }),
			makeRow({ tx_id: "tx_zero_mid", timestamp: 20, block_number: 20, fee: 0 }),
		];
		const out = sortTxs(tiedItems, { sortBy: "fee" });
		expect(out.map((x) => x.tx_id)).toEqual(["tx_paid", "tx_zero_new", "tx_zero_mid", "tx_zero_old"]);
	});
});

describe("account txs default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-txs-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", VALID);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("uses config default_address when argument is omitted", () => {
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(VALID);
	});
});

describe("renderTxs (human output)", () => {
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

	const sampleItem: AccountTxRow = {
		tx_id: "abc1234deadbeef0000000000000000000000000000000000000000000000f3e9",
		block_number: 70000001,
		timestamp: 1711929601000,
		contract_type: "TransferContract",
		type_display: "Transfer",
		from: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
		to: "TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc",
		amount: 1000000,
		amount_unit: "sun",
		amount_trx: "1",
		status: "SUCCESS",
		confirmed: true,
		fee: 100,
		fee_unit: "sun",
		decimals: 6,
		fee_trx: "0.0001",
	};

	it("shows empty-state message for an empty list", () => {
		renderTxs([]);
		expect(captured).toHaveLength(1);
		expect(captured[0]).toContain("No transactions found");
	});

	it("renders singular header when n=1", () => {
		renderTxs([sampleItem]);
		expect(captured[0]).toContain("Found 1 transaction");
		expect(captured[0]).not.toMatch(/Found 1 transactions/);
	});

	it("renders plural header when n>1", () => {
		const second: AccountTxRow = { ...sampleItem, tx_id: "tx_two", fee_trx: "1.2345" };
		renderTxs([sampleItem, second]);
		expect(captured[0]).toContain("Found 2 transactions");
	});

	it("header includes Type / Method, From, To, Amount columns", () => {
		renderTxs([sampleItem]);
		const headerRow = captured[1] ?? "";
		expect(headerRow).toContain("Type / Method");
		expect(headerRow).toContain("From");
		expect(headerRow).toContain("To");
		expect(headerRow).toContain("Amount");
	});

	it("shows time in YYYY-MM-DD HH:MM format without seconds", () => {
		renderTxs([sampleItem]);
		// 1711929601000 → 2024-04-01T00:00:01Z → display as "2024-04-01 00:00"
		const dataRow = captured[2] ?? "";
		expect(dataRow).toMatch(/2024-04-01 00:00/);
		// Should not contain seconds from old format
		expect(dataRow).not.toContain("00:00:01");
	});

	it("right-aligns fee so decimal points stack when widths differ", () => {
		const big: AccountTxRow = { ...sampleItem, tx_id: "tx_big", fee_trx: "12.3456" };
		renderTxs([sampleItem, big]);
		// captured[0] = "Found N transactions", captured[1] = header row, data starts at [2]
		const row1 = captured[2] ?? "";
		const row2 = captured[3] ?? "";
		expect(row1).toContain("0.0001");
		expect(row2).toContain("12.3456");
		const dot1 = row1.indexOf("0.0001") + 1;
		const dot2 = row2.indexOf("12.3456") + 2;
		expect(dot1).toBe(dot2);
	});

	it("right-aligns amount column", () => {
		const small: AccountTxRow = { ...sampleItem, tx_id: "tx_small", amount_trx: "1" };
		const large: AccountTxRow = { ...sampleItem, tx_id: "tx_large", amount_trx: "1000" };
		renderTxs([small, large]);
		const row1 = captured[2] ?? "";
		const row2 = captured[3] ?? "";
		// "1" and "1,000" should have decimal points (or ends) aligned
		expect(row1).toContain("    1");
		expect(row2).toContain("1,000");
	});

	it("mutes subject address in From/To columns", () => {
		const subject = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
		renderTxs([sampleItem], subject);
		const dataRow = captured[2] ?? "";
		// In NO_COLOR mode, muted() returns the string as-is (no ANSI),
		// so we just verify From and To truncated addresses are present
		// TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW → TJCnKs...Q6sxMW (6+6)
		// TKHuVq1vMNY4kSjEQX3MzgNj2aCGeWkZcc → TKHuVq...eWkZcc (6+6)
		expect(dataRow).toContain("TJCnKs...Q6sxMW");
		expect(dataRow).toContain("TKHuVq...eWkZcc");
	});

	it("does not show Confirmed column when all transactions are confirmed", () => {
		renderTxs([sampleItem]);
		const headerRow = captured[1] ?? "";
		expect(headerRow).not.toContain("Confirmed");
	});

	it("shows Confirmed column when any transaction is unconfirmed", () => {
		const unconfirmed: AccountTxRow = { ...sampleItem, tx_id: "tx_unc", confirmed: false };
		renderTxs([sampleItem, unconfirmed]);
		const headerRow = captured[1] ?? "";
		expect(headerRow).toContain("Confirmed");
	});

	it("does not show Result column when all transactions succeed", () => {
		renderTxs([sampleItem]);
		const headerRow = captured[1] ?? "";
		expect(headerRow).not.toContain("Result");
	});

	it("shows Result column when any transaction has non-success status", () => {
		const failed: AccountTxRow = { ...sampleItem, tx_id: "tx_fail", status: "REVERT" };
		renderTxs([sampleItem, failed]);
		const headerRow = captured[1] ?? "";
		expect(headerRow).toContain("Result");
	});

	it("renders arrow between From and To", () => {
		renderTxs([sampleItem]);
		const dataRow = captured[2] ?? "";
		expect(dataRow).toContain("\u2192");
	});
});
