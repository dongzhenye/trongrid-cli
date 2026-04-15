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
			raw_data: { contract: [{ type: "TransferContract" }] },
			ret: [{ contractRet: "SUCCESS" }],
		},
		{
			txID: "tx_c",
			blockNumber: 70000001,
			block_timestamp: 1711929601000,
			net_fee: 0,
			energy_fee: 300,
			raw_data: { contract: [{ type: "TriggerSmartContract" }] },
			ret: [{ contractRet: "SUCCESS" }],
		},
		{
			txID: "tx_a",
			blockNumber: 70000000,
			block_timestamp: 1711929600000,
			net_fee: 50,
			energy_fee: 50,
			raw_data: { contract: [{ type: "TransferContract" }] },
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
			status: "SUCCESS",
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
		});
	});
});

describe("sortTxs (default: timestamp desc)", () => {
	const items: AccountTxRow[] = [
		{ tx_id: "tx_b", timestamp: 2, block_number: 2, fee: 100, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
		{ tx_id: "tx_c", timestamp: 3, block_number: 3, fee: 50, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
		{ tx_id: "tx_a", timestamp: 1, block_number: 1, fee: 300, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
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

	it("rejects --sort-by on an unknown field with a hint", () => {
		expect(() => sortTxs(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});

	it("--sort-by fee breaks ties by timestamp desc (newest first)", () => {
		// Three zero-fee txs with distinct timestamps + one non-zero fee tx.
		// Under --sort-by fee, the zero-fee block must be deterministically
		// ordered by timestamp desc rather than falling back to input order.
		const tiedItems: AccountTxRow[] = [
			{ tx_id: "tx_zero_old", timestamp: 10, block_number: 10, fee: 0, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
			{ tx_id: "tx_zero_new", timestamp: 30, block_number: 30, fee: 0, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
			{ tx_id: "tx_paid",     timestamp: 20, block_number: 20, fee: 500, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
			{ tx_id: "tx_zero_mid", timestamp: 20, block_number: 20, fee: 0, contract_type: "T", status: "S", fee_unit: "sun", decimals: 6, fee_trx: "0" },
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
		status: "SUCCESS",
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

	it("right-aligns fee so decimal points stack when widths differ", () => {
		const big: AccountTxRow = { ...sampleItem, tx_id: "tx_big", fee_trx: "12.3456" };
		renderTxs([sampleItem, big]);
		// Data rows start at captured[1] (captured[0] is the header).
		const row1 = captured[1] ?? "";
		const row2 = captured[2] ?? "";
		expect(row1).toContain("0.0001");
		expect(row2).toContain("12.3456");
		const dot1 = row1.indexOf("0.0001") + 1;
		const dot2 = row2.indexOf("12.3456") + 2;
		expect(dot1).toBe(dot2);
	});
});
