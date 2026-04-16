import { describe, it, expect } from "bun:test";
import {
	parseAbi,
	normalizeAbiEntries,
	type AbiMethod,
	type AbiEvent,
	type AbiSummary,
} from "../../src/utils/abi.js";

/**
 * USDT-like ABI fixture — mirrors TronGrid's capitalized format.
 * Contains: transfer, balanceOf, approve (functions) + Transfer, Approval (events)
 *         + constructor + fallback (should be skipped).
 */
const USDT_ABI_RAW = [
	{
		type: "Function",
		stateMutability: "Nonpayable",
		name: "transfer",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "value", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		type: "Function",
		stateMutability: "View",
		name: "balanceOf",
		inputs: [{ name: "owner", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "Function",
		stateMutability: "Nonpayable",
		name: "approve",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "value", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		type: "Function",
		stateMutability: "View",
		name: "allowance",
		inputs: [
			{ name: "owner", type: "address" },
			{ name: "spender", type: "address" },
		],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		type: "Function",
		stateMutability: "View",
		name: "totalSupply",
		inputs: [],
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
	{
		type: "Event",
		name: "Approval",
		inputs: [
			{ name: "owner", type: "address", indexed: true },
			{ name: "spender", type: "address", indexed: true },
			{ name: "value", type: "uint256", indexed: false },
		],
	},
	{
		type: "Constructor",
		inputs: [
			{ name: "initialSupply", type: "uint256" },
			{ name: "tokenName", type: "string" },
			{ name: "tokenSymbol", type: "string" },
		],
	},
	{
		type: "Fallback",
	},
];

describe("normalizeAbiEntries", () => {
	it("lowercases type and stateMutability", () => {
		const input = [
			{
				type: "Function",
				stateMutability: "Nonpayable",
				name: "foo",
				inputs: [],
				outputs: [],
			},
		];
		const result = normalizeAbiEntries(input) as Array<{
			type: string;
			stateMutability: string;
		}>;
		expect(result[0].type).toBe("function");
		expect(result[0].stateMutability).toBe("nonpayable");
	});

	it("handles Event type", () => {
		const input = [{ type: "Event", name: "Foo", inputs: [] }];
		const result = normalizeAbiEntries(input) as Array<{ type: string }>;
		expect(result[0].type).toBe("event");
	});

	it("preserves other fields", () => {
		const input = [
			{
				type: "Function",
				stateMutability: "View",
				name: "myFunc",
				inputs: [{ name: "x", type: "uint256" }],
				outputs: [],
			},
		];
		const result = normalizeAbiEntries(input) as Array<{
			name: string;
			inputs: Array<{ name: string; type: string }>;
		}>;
		expect(result[0].name).toBe("myFunc");
		expect(result[0].inputs[0].name).toBe("x");
	});

	it("handles empty array", () => {
		expect(normalizeAbiEntries([])).toEqual([]);
	});

	it("skips non-object entries", () => {
		const input = [null, undefined, 42, "string"];
		const result = normalizeAbiEntries(input as unknown[]);
		expect(result.length).toBe(0);
	});
});

describe("parseAbi", () => {
	let summary: AbiSummary;

	// Parse once for all tests in this describe block
	const normalized = normalizeAbiEntries(USDT_ABI_RAW);
	summary = parseAbi(normalized);

	it("counts methods correctly (excludes constructor + fallback)", () => {
		expect(summary.method_count).toBe(5);
	});

	it("counts events correctly", () => {
		expect(summary.event_count).toBe(2);
	});

	describe("methods", () => {
		it("includes transfer with correct selector", () => {
			const transfer = summary.methods.find((m) => m.name === "transfer");
			expect(transfer).toBeDefined();
			expect(transfer!.selector).toBe("0xa9059cbb");
			expect(transfer!.signature).toBe("transfer(address,uint256)");
			expect(transfer!.type).toBe("write");
			expect(transfer!.mutability).toBe("nonpayable");
		});

		it("includes balanceOf as read type", () => {
			const balanceOf = summary.methods.find((m) => m.name === "balanceOf");
			expect(balanceOf).toBeDefined();
			expect(balanceOf!.selector).toBe("0x70a08231");
			expect(balanceOf!.signature).toBe("balanceOf(address)");
			expect(balanceOf!.type).toBe("read");
			expect(balanceOf!.mutability).toBe("view");
		});

		it("includes approve with correct selector", () => {
			const approve = summary.methods.find((m) => m.name === "approve");
			expect(approve).toBeDefined();
			expect(approve!.selector).toBe("0x095ea7b3");
		});

		it("includes allowance with correct selector", () => {
			const allowance = summary.methods.find((m) => m.name === "allowance");
			expect(allowance).toBeDefined();
			expect(allowance!.selector).toBe("0xdd62ed3e");
		});

		it("includes totalSupply with correct selector", () => {
			const totalSupply = summary.methods.find(
				(m) => m.name === "totalSupply",
			);
			expect(totalSupply).toBeDefined();
			expect(totalSupply!.selector).toBe("0x18160ddd");
			expect(totalSupply!.signature).toBe("totalSupply()");
		});

		it("captures inputs correctly", () => {
			const transfer = summary.methods.find((m) => m.name === "transfer");
			expect(transfer!.inputs).toEqual([
				{ name: "to", type: "address" },
				{ name: "value", type: "uint256" },
			]);
		});

		it("captures outputs correctly", () => {
			const transfer = summary.methods.find((m) => m.name === "transfer");
			expect(transfer!.outputs).toEqual([{ name: "", type: "bool" }]);
		});
	});

	describe("events", () => {
		it("includes Transfer event", () => {
			const transfer = summary.events.find((e) => e.name === "Transfer");
			expect(transfer).toBeDefined();
			expect(transfer!.signature).toBe("Transfer(address,address,uint256)");
		});

		it("includes Approval event", () => {
			const approval = summary.events.find((e) => e.name === "Approval");
			expect(approval).toBeDefined();
			expect(approval!.signature).toBe("Approval(address,address,uint256)");
		});

		it("captures indexed flag on event inputs", () => {
			const transfer = summary.events.find((e) => e.name === "Transfer");
			expect(transfer!.inputs[0].indexed).toBe(true);
			expect(transfer!.inputs[1].indexed).toBe(true);
			expect(transfer!.inputs[2].indexed).toBe(false);
		});
	});

	describe("edge cases", () => {
		it("handles empty ABI", () => {
			const result = parseAbi([]);
			expect(result.method_count).toBe(0);
			expect(result.event_count).toBe(0);
			expect(result.methods).toEqual([]);
			expect(result.events).toEqual([]);
		});

		it("skips entries without name", () => {
			const abi = [
				{ type: "function", inputs: [], outputs: [] },
				{
					type: "function",
					name: "good",
					stateMutability: "view",
					inputs: [],
					outputs: [],
				},
			];
			const result = parseAbi(abi);
			expect(result.method_count).toBe(1);
			expect(result.methods[0].name).toBe("good");
		});

		it("skips constructor and fallback", () => {
			const abi = [
				{ type: "constructor", inputs: [] },
				{ type: "fallback" },
				{ type: "receive" },
				{
					type: "function",
					name: "foo",
					stateMutability: "nonpayable",
					inputs: [],
					outputs: [],
				},
			];
			const result = parseAbi(abi);
			expect(result.method_count).toBe(1);
		});

		it("skips malformed entries (missing inputs)", () => {
			const abi = [
				{ type: "function", name: "broken", stateMutability: "view" },
				{
					type: "function",
					name: "good",
					stateMutability: "pure",
					inputs: [],
					outputs: [],
				},
			];
			const result = parseAbi(abi);
			expect(result.method_count).toBe(1);
			expect(result.methods[0].name).toBe("good");
		});

		it("classifies pure as read", () => {
			const abi = [
				{
					type: "function",
					name: "pureFunc",
					stateMutability: "pure",
					inputs: [],
					outputs: [{ name: "", type: "uint256" }],
				},
			];
			const result = parseAbi(abi);
			expect(result.methods[0].type).toBe("read");
			expect(result.methods[0].mutability).toBe("pure");
		});

		it("classifies payable as write", () => {
			const abi = [
				{
					type: "function",
					name: "payMe",
					stateMutability: "payable",
					inputs: [],
					outputs: [],
				},
			];
			const result = parseAbi(abi);
			expect(result.methods[0].type).toBe("write");
			expect(result.methods[0].mutability).toBe("payable");
		});

		it("handles non-array entries gracefully", () => {
			const abi = [null, undefined, 42, "string"] as unknown[];
			const result = parseAbi(abi);
			expect(result.method_count).toBe(0);
			expect(result.event_count).toBe(0);
		});
	});
});
