import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractMethods } from "../../src/commands/contract/methods.js";
import { functionSelector } from "../../src/utils/keccak.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/**
 * Minimal ABI with 3 functions (2 write, 1 read) + 1 event.
 * Uses TronGrid's capitalized format ("Function"/"Event", "View"/"Nonpayable").
 */
function makeTronGridAbi() {
	return {
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
			{
				type: "Event",
				name: "Transfer",
				inputs: [
					{ name: "from", type: "address", indexed: true },
					{ name: "to", type: "address", indexed: true },
					{ name: "value", type: "uint256", indexed: false },
				],
			},
		],
	};
}

function makeContractResponse(overrides: Record<string, unknown> = {}) {
	return {
		bytecode: "608060405234801561001057600080fd5b50",
		name: "TetherToken",
		origin_address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
		contract_address: CONTRACT,
		abi: makeTronGridAbi(),
		trx_hash: "abc123def456",
		consume_user_resource_percent: 100,
		origin_energy_limit: 10000000,
		...overrides,
	};
}

describe("fetchContractMethods", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(makeContractResponse()))),
		);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns all methods without filter (events excluded)", async () => {
		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT);

		// 3 functions from fixture, event excluded
		expect(methods).toHaveLength(3);
		const names = methods.map((m) => m.name);
		expect(names).toContain("transfer");
		expect(names).toContain("approve");
		expect(names).toContain("balanceOf");
	});

	it("filters to read-only methods with --type read", async () => {
		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT, "read");

		expect(methods).toHaveLength(1);
		expect(methods[0]?.name).toBe("balanceOf");
		expect(methods[0]?.type).toBe("read");
		expect(methods[0]?.mutability).toBe("view");
	});

	it("filters to write methods with --type write", async () => {
		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT, "write");

		expect(methods).toHaveLength(2);
		const names = methods.map((m) => m.name);
		expect(names).toContain("transfer");
		expect(names).toContain("approve");
		for (const m of methods) {
			expect(m.type).toBe("write");
		}
	});

	it("returns empty array for empty ABI", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify(makeContractResponse({ abi: { entrys: [] } })),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT);

		expect(methods).toEqual([]);
	});

	it("returns empty array when ABI is missing", async () => {
		const raw = makeContractResponse();
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).abi;

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(raw))),
		);

		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT);

		expect(methods).toEqual([]);
	});

	it("computes selectors correctly", async () => {
		const client = createClient({ network: "mainnet" });
		const methods = await fetchContractMethods(client, CONTRACT);

		const transfer = methods.find((m) => m.name === "transfer");
		const approve = methods.find((m) => m.name === "approve");
		const balanceOf = methods.find((m) => m.name === "balanceOf");

		// Verify against independently computed selectors
		expect(transfer?.selector).toBe(functionSelector("transfer(address,uint256)"));
		expect(approve?.selector).toBe(functionSelector("approve(address,uint256)"));
		expect(balanceOf?.selector).toBe(functionSelector("balanceOf(address)"));

		// Well-known selectors from Ethereum ecosystem
		expect(transfer?.selector).toBe("0xa9059cbb");
		expect(approve?.selector).toBe("0x095ea7b3");
		expect(balanceOf?.selector).toBe("0x70a08231");
	});

	it("rejects invalid address", async () => {
		const client = createClient({ network: "mainnet" });

		await expect(fetchContractMethods(client, "INVALID")).rejects.toThrow(
			"Invalid TRON address",
		);
	});
});
