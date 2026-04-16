import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractTxs } from "../../src/commands/contract/txs.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const SENDER = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

// --- Fixtures ---

/**
 * Three raw transactions as returned by /v1/accounts/:address/transactions:
 * 1. tx_transfer — TriggerSmartContract with transfer(address,uint256) selector
 * 2. tx_approve  — TriggerSmartContract with approve(address,uint256) selector
 * 3. tx_trx      — TransferContract (plain TRX transfer, no data field)
 */
const tx_transfer = {
	txID: "tx_transfer",
	blockNumber: 80000001,
	block_timestamp: 1710000001000,
	net_fee: 0,
	energy_fee: 500000,
	raw_data: {
		contract: [
			{
				type: "TriggerSmartContract",
				parameter: {
					value: {
						owner_address: SENDER,
						contract_address: CONTRACT,
						call_value: 0,
						data: "a9059cbb0000000000000000000000001234567890abcdef1234567890abcdef12345678000000000000000000000000000000000000000000000000000000003b9aca00",
					},
				},
			},
		],
	},
	ret: [{ contractRet: "SUCCESS" }],
};

const tx_approve = {
	txID: "tx_approve",
	blockNumber: 80000002,
	block_timestamp: 1710000002000,
	net_fee: 0,
	energy_fee: 300000,
	raw_data: {
		contract: [
			{
				type: "TriggerSmartContract",
				parameter: {
					value: {
						owner_address: SENDER,
						contract_address: CONTRACT,
						call_value: 0,
						data: "095ea7b30000000000000000000000001234567890abcdef1234567890abcdef1234567800000000000000000000000000000000000000000000000000000000ffffffff",
					},
				},
			},
		],
	},
	ret: [{ contractRet: "SUCCESS" }],
};

const tx_trx = {
	txID: "tx_trx",
	blockNumber: 80000003,
	block_timestamp: 1710000003000,
	net_fee: 268,
	energy_fee: 0,
	raw_data: {
		contract: [
			{
				type: "TransferContract",
				parameter: {
					value: {
						owner_address: SENDER,
						to_address: CONTRACT,
						amount: 5000000,
					},
				},
			},
		],
	},
	ret: [{ contractRet: "SUCCESS" }],
};

const txsApiResponse = { data: [tx_transfer, tx_approve, tx_trx] };

/**
 * ABI response from POST /wallet/getcontract — includes transfer and approve
 * functions in TronGrid's capitalized format.
 */
function makeContractResponse() {
	return {
		bytecode: "608060405234801561001057600080fd5b50",
		name: "TetherToken",
		origin_address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
		contract_address: CONTRACT,
		abi: {
			entrys: [
				{
					type: "Function",
					name: "transfer",
					stateMutability: "Nonpayable",
					inputs: [
						{ name: "to", type: "address" },
						{ name: "value", type: "uint256" },
					],
					outputs: [{ name: "", type: "bool" }],
				},
				{
					type: "Function",
					name: "approve",
					stateMutability: "Nonpayable",
					inputs: [
						{ name: "spender", type: "address" },
						{ name: "value", type: "uint256" },
					],
					outputs: [{ name: "", type: "bool" }],
				},
				{
					type: "Function",
					name: "balanceOf",
					stateMutability: "View",
					inputs: [{ name: "owner", type: "address" }],
					outputs: [{ name: "", type: "uint256" }],
				},
			],
		},
		trx_hash: "abc123def456",
	};
}

/**
 * Mock fetch that dispatches based on URL:
 *   - GET /v1/accounts/... → txs fixture
 *   - POST /wallet/getcontract → ABI fixture
 */
function mockFetchMulti(): void {
	globalThis.fetch = mock((url: string, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		if (method === "POST" && typeof url === "string" && url.includes("/wallet/getcontract")) {
			return Promise.resolve(
				new Response(JSON.stringify(makeContractResponse()), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				}),
			);
		}
		// Default: GET txs endpoint
		return Promise.resolve(
			new Response(JSON.stringify(txsApiResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as unknown as typeof fetch;
}

describe("fetchContractTxs", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns all txs without --method filter", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, { limit: 20 });

		expect(rows).toHaveLength(3);
		const ids = rows.map((r) => r.tx_id);
		expect(ids).toContain("tx_transfer");
		expect(ids).toContain("tx_approve");
		expect(ids).toContain("tx_trx");
	});

	it("filters by 4-byte selector (--method 0xa9059cbb)", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "0xa9059cbb",
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.tx_id).toBe("tx_transfer");
	});

	it("filters by method name via ABI lookup (--method transfer)", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "transfer",
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.tx_id).toBe("tx_transfer");
	});

	it("excludes plain TRX transfers when --method is specified", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "0xa9059cbb",
		});

		// tx_trx has no data field — must be excluded
		const ids = rows.map((r) => r.tx_id);
		expect(ids).not.toContain("tx_trx");
	});

	it("matches method name case-insensitively", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });

		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "TRANSFER",
		});

		expect(rows).toHaveLength(1);
		expect(rows[0]?.tx_id).toBe("tx_transfer");
	});

	it("returns empty when method name matches no ABI entry", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "nonexistent",
		});

		expect(rows).toHaveLength(0);
	});

	it("returns empty when selector matches no transactions", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "0xdeadbeef",
		});

		expect(rows).toHaveLength(0);
	});

	it("maps rows to AccountTxRow shape correctly", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, {
			limit: 20,
			method: "0xa9059cbb",
		});

		expect(rows[0]).toMatchObject({
			tx_id: "tx_transfer",
			block_number: 80000001,
			timestamp: 1710000001000,
			contract_type: "TriggerSmartContract",
			type_display: "0xa9059cbb",
			method_selector: "0xa9059cbb",
			from: SENDER,
			to: CONTRACT,
			amount: 0,
			amount_trx: "0",
			status: "SUCCESS",
			confirmed: true,
			fee: 500000,
			fee_unit: "sun",
			decimals: 6,
		});
	});

	it("extracts from/to/amount for plain TRX transfer rows", async () => {
		mockFetchMulti();
		const client = createClient({ network: "mainnet" });
		const rows = await fetchContractTxs(client, CONTRACT, { limit: 20 });
		const trxRow = rows.find((r) => r.tx_id === "tx_trx");

		expect(trxRow).toMatchObject({
			from: SENDER,
			to: CONTRACT,
			amount: 5000000,
			amount_trx: "5",
			type_display: "Transfer",
		});
	});
});
