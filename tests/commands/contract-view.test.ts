import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import {
	buildContractViewPairs,
	fetchContractView,
} from "../../src/commands/contract/view.js";

const USDT_ADDRESS = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

/** Minimal ABI matching TronGrid's capitalized, `entrys`-keyed format. */
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
			{
				type: "Event",
				name: "Approval",
				inputs: [
					{ name: "owner", type: "address", indexed: true },
					{ name: "spender", type: "address", indexed: true },
					{ name: "value", type: "uint256", indexed: false },
				],
			},
		],
	};
}

function makeContractResponse(overrides: Record<string, unknown> = {}) {
	return {
		bytecode:
			"608060405234801561001057600080fd5b50610150806100206000396000f3fe",
		name: "TetherToken",
		origin_address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
		contract_address: USDT_ADDRESS,
		abi: makeTronGridAbi(),
		trx_hash: "abc123def456",
		consume_user_resource_percent: 100,
		origin_energy_limit: 10000000,
		...overrides,
	};
}

describe("contract view", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(makeContractResponse()))),
		);
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches and maps contract data correctly", async () => {
		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.address).toBe(USDT_ADDRESS);
		expect(result.name).toBe("TetherToken");
		expect(result.deployer).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
		expect(result.status).toBe("active");
		expect(result.deploy_tx).toBe("abc123def456");
		expect(result.caller_energy_ratio).toBe(100);
		expect(result.deployer_energy_cap).toBe(10000000);
	});

	it("parses ABI summary with correct counts and signatures", async () => {
		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.abi_summary.method_count).toBe(2);
		expect(result.abi_summary.event_count).toBe(2);
		expect(result.abi_summary.methods).toEqual([
			"transfer(address,uint256)",
			"balanceOf(address)",
		]);
		expect(result.abi_summary.events).toEqual([
			"Transfer(address,address,uint256)",
			"Approval(address,address,uint256)",
		]);
	});

	it("computes bytecode_length from hex string", async () => {
		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		// "608060405234801561001057600080fd5b50610150806100206000396000f3fe"
		// = 64 hex chars → 32 bytes
		expect(result.bytecode_length).toBe(32);
	});

	it("derives status as destroyed when bytecode is empty", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(makeContractResponse({ bytecode: "" }))),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.status).toBe("destroyed");
		expect(result.bytecode_length).toBe(0);
	});

	it("derives status as destroyed when bytecode is missing", async () => {
		const raw = makeContractResponse();
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).bytecode;

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(raw))),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.status).toBe("destroyed");
	});

	it("handles unnamed contract", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify(makeContractResponse({ name: "" }))),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.name).toBe("");
	});

	it("handles missing origin_address and trx_hash", async () => {
		const raw = makeContractResponse();
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).origin_address;
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).trx_hash;

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(raw))),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.deployer).toBe("");
		expect(result.deploy_tx).toBe("");
	});

	it("handles missing ABI (no abi field)", async () => {
		const raw = makeContractResponse();
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).abi;

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(raw))),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.abi_summary.method_count).toBe(0);
		expect(result.abi_summary.event_count).toBe(0);
		expect(result.abi_summary.methods).toEqual([]);
		expect(result.abi_summary.events).toEqual([]);
	});

	it("handles empty ABI entrys array", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify(makeContractResponse({ abi: { entrys: [] } })),
				),
			),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.abi_summary.method_count).toBe(0);
		expect(result.abi_summary.event_count).toBe(0);
	});

	it("defaults caller_energy_ratio and deployer_energy_cap to 0", async () => {
		const raw = makeContractResponse();
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).consume_user_resource_percent;
		// biome-ignore lint/performance/noDelete: test needs missing field
		delete (raw as Record<string, unknown>).origin_energy_limit;

		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify(raw))),
		);

		const client = createClient({ network: "mainnet" });
		const result = await fetchContractView(client, USDT_ADDRESS);

		expect(result.caller_energy_ratio).toBe(0);
		expect(result.deployer_energy_cap).toBe(0);
	});

	it("rejects invalid address with UsageError", async () => {
		const client = createClient({ network: "mainnet" });

		await expect(fetchContractView(client, "INVALID")).rejects.toThrow(
			"Invalid TRON address",
		);
	});

	it("sends POST with visible: true to /wallet/getcontract", async () => {
		// biome-ignore lint/suspicious/noExplicitAny: test helper
		let capturedUrl: any;
		// biome-ignore lint/suspicious/noExplicitAny: test helper
		let capturedBody: any;
		globalThis.fetch = mock((url: string, init: RequestInit) => {
			capturedUrl = url;
			capturedBody = JSON.parse(init.body as string);
			return Promise.resolve(
				new Response(JSON.stringify(makeContractResponse())),
			);
		});

		const client = createClient({ network: "mainnet" });
		await fetchContractView(client, USDT_ADDRESS);

		expect(capturedUrl).toContain("/wallet/getcontract");
		expect(capturedBody.value).toBe(USDT_ADDRESS);
		expect(capturedBody.visible).toBe(true);
	});
});

describe("contract view human pairs", () => {
	it("builds correct labels and values", () => {
		const data = {
			address: USDT_ADDRESS,
			name: "TetherToken",
			deployer: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			status: "active" as const,
			deploy_tx: "abc123",
			caller_energy_ratio: 100,
			deployer_energy_cap: 10000000,
			abi_summary: {
				method_count: 5,
				event_count: 3,
				methods: ["transfer(address,uint256)"],
				events: ["Transfer(address,address,uint256)"],
			},
			bytecode_length: 1234,
		};

		const pairs = buildContractViewPairs(data);
		const map = new Map(pairs.map(([key, label, value]) => [key, { label, value }]));

		expect(map.get("address")?.label).toBe("Contract");
		expect(map.get("address")?.value).toBe(USDT_ADDRESS);

		expect(map.get("name")?.label).toBe("Name");
		expect(map.get("name")?.value).toBe("TetherToken");

		expect(map.get("deployer")?.label).toBe("Deployer");

		expect(map.get("status")?.label).toBe("Status");
		expect(map.get("status")?.value).toBe("Active");

		expect(map.get("deploy_tx")?.label).toBe("Deploy TX");

		expect(map.get("caller_energy_ratio")?.label).toBe("Caller pays");
		expect(map.get("caller_energy_ratio")?.value).toBe("100%");

		expect(map.get("deployer_energy_cap")?.label).toBe("Deployer cap");
		expect(map.get("deployer_energy_cap")?.value).toBe("10000000");

		expect(map.get("abi_summary")?.label).toBe("ABI Summary");
		expect(map.get("abi_summary")?.value).toBe("5 methods, 3 events");

		expect(map.get("bytecode_length")?.label).toBe("Bytecode");
		expect(map.get("bytecode_length")?.value).toBe("1,234 bytes");
	});

	it("shows (unnamed) muted for empty name", () => {
		const data = {
			address: USDT_ADDRESS,
			name: "",
			deployer: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
			status: "active" as const,
			deploy_tx: "abc123",
			caller_energy_ratio: 0,
			deployer_energy_cap: 0,
			abi_summary: {
				method_count: 0,
				event_count: 0,
				methods: [],
				events: [],
			},
			bytecode_length: 100,
		};

		const pairs = buildContractViewPairs(data);
		const namePair = pairs.find(([key]) => key === "name");
		// muted wraps in dim escape codes in TTY; in test (non-TTY) it's plain text
		expect(namePair?.[2]).toContain("(unnamed)");
	});

	it("shows (unknown) for empty deployer and deploy_tx", () => {
		const data = {
			address: USDT_ADDRESS,
			name: "Test",
			deployer: "",
			status: "active" as const,
			deploy_tx: "",
			caller_energy_ratio: 0,
			deployer_energy_cap: 0,
			abi_summary: {
				method_count: 0,
				event_count: 0,
				methods: [],
				events: [],
			},
			bytecode_length: 100,
		};

		const pairs = buildContractViewPairs(data);
		const deployerPair = pairs.find(([key]) => key === "deployer");
		const deployTxPair = pairs.find(([key]) => key === "deploy_tx");
		expect(deployerPair?.[2]).toContain("(unknown)");
		expect(deployTxPair?.[2]).toContain("(unknown)");
	});

	it("shows Destroyed for destroyed status", () => {
		const data = {
			address: USDT_ADDRESS,
			name: "Test",
			deployer: "",
			status: "destroyed" as const,
			deploy_tx: "",
			caller_energy_ratio: 0,
			deployer_energy_cap: 0,
			abi_summary: {
				method_count: 0,
				event_count: 0,
				methods: [],
				events: [],
			},
			bytecode_length: 0,
		};

		const pairs = buildContractViewPairs(data);
		const statusPair = pairs.find(([key]) => key === "status");
		expect(statusPair?.[2]).toBe("Destroyed");
	});
});
