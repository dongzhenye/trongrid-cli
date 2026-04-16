import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	type DelegationRow,
	fetchAccountDelegations,
	renderDelegations,
	sortDelegations,
} from "../../src/commands/account/delegations.js";
import { formatJsonList } from "../../src/output/format.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

interface IndexFixture {
	toAccounts?: string[];
	fromAccounts?: string[];
}

interface DetailEntry {
	from?: string;
	to?: string;
	frozen_balance_for_bandwidth?: number;
	frozen_balance_for_energy?: number;
	expire_time_for_bandwidth?: number;
	expire_time_for_energy?: number;
}

interface DetailFixture {
	delegatedResource?: DetailEntry[];
}

/**
 * Install a fetch mock that dispatches by URL:
 *   - index endpoint → indexFixture
 *   - detail endpoint → detailResolver(body)
 */
function installFetchMock(
	indexFixture: IndexFixture,
	detailResolver: (body: { fromAddress?: string; toAddress?: string }) => DetailFixture,
): void {
	globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
		const url =
			typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
		const lower = url.toLowerCase();
		if (lower.includes("getdelegatedresourceaccountindexv2")) {
			return new Response(JSON.stringify(indexFixture), { status: 200 });
		}
		if (lower.includes("getdelegatedresourcev2")) {
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				fromAddress?: string;
				toAddress?: string;
			};
			return new Response(JSON.stringify(detailResolver(body)), { status: 200 });
		}
		throw new Error(`Unexpected URL: ${url}`);
	}) as unknown as typeof fetch;
}

describe("fetchAccountDelegations", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
	const peerOut = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV";
	const peerIn = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjk8Py";
	const futureMs = 9_999_999_999_000;
	const pastMs = 1_000_000_000_000; // 2001-09-09, far in the past

	function newClient() {
		return createClient({ network: "mainnet", apiKey: undefined });
	}

	it("parses both out and in delegations from index + detail responses", async () => {
		installFetchMock(
			{ toAccounts: [peerOut], fromAccounts: [peerIn] },
			(body) => {
				if (body.fromAddress === subject) {
					return {
						delegatedResource: [
							{
								from: subject,
								to: peerOut,
								frozen_balance_for_energy: 100_000_000,
								expire_time_for_energy: futureMs,
							},
						],
					};
				}
				return {
					delegatedResource: [
						{
							from: peerIn,
							to: subject,
							frozen_balance_for_bandwidth: 50_000_000,
							expire_time_for_bandwidth: futureMs,
						},
					],
				};
			},
		);

		const rows = await fetchAccountDelegations(newClient(), subject);
		expect(rows.length).toBe(2);
		expect(rows.some((r) => r.direction === "out" && r.resource === "ENERGY")).toBe(true);
		expect(rows.some((r) => r.direction === "in" && r.resource === "BANDWIDTH")).toBe(true);
	});

	it("out-only: no incoming delegations when fromAccounts is missing", async () => {
		installFetchMock({ toAccounts: [peerOut] }, (_body) => ({
			delegatedResource: [
				{
					from: subject,
					to: peerOut,
					frozen_balance_for_energy: 100_000_000,
					expire_time_for_energy: futureMs,
				},
			],
		}));

		const rows = await fetchAccountDelegations(newClient(), subject);
		expect(rows.length).toBe(1);
		expect(rows[0]?.direction).toBe("out");
		expect(rows.some((r) => r.direction === "in")).toBe(false);
	});

	it("in-only: no outgoing delegations when toAccounts is missing", async () => {
		installFetchMock({ fromAccounts: [peerIn] }, (_body) => ({
			delegatedResource: [
				{
					from: peerIn,
					to: subject,
					frozen_balance_for_bandwidth: 50_000_000,
					expire_time_for_bandwidth: futureMs,
				},
			],
		}));

		const rows = await fetchAccountDelegations(newClient(), subject);
		expect(rows.length).toBe(1);
		expect(rows[0]?.direction).toBe("in");
		expect(rows.some((r) => r.direction === "out")).toBe(false);
	});

	it("empty: both index arrays empty produces empty result", async () => {
		installFetchMock({ toAccounts: [], fromAccounts: [] }, (_body) => ({
			delegatedResource: [],
		}));

		const rows = await fetchAccountDelegations(newClient(), subject);
		expect(rows).toEqual([]);
	});

	it("splits a pair with both energy and bandwidth into two rows", async () => {
		installFetchMock({ toAccounts: [peerOut] }, (_body) => ({
			delegatedResource: [
				{
					from: subject,
					to: peerOut,
					frozen_balance_for_bandwidth: 10_000_000,
					expire_time_for_bandwidth: futureMs,
					frozen_balance_for_energy: 20_000_000,
					expire_time_for_energy: futureMs,
				},
			],
		}));

		const rows = await fetchAccountDelegations(newClient(), subject);
		expect(rows.length).toBe(2);
		const bw = rows.find((r) => r.resource === "BANDWIDTH");
		const en = rows.find((r) => r.resource === "ENERGY");
		expect(bw?.amount).toBe(10_000_000);
		expect(en?.amount).toBe(20_000_000);
		expect(bw?.direction).toBe("out");
		expect(en?.direction).toBe("out");
	});

	it("lock flag reflects expire_time relative to now", async () => {
		installFetchMock({ toAccounts: [peerOut] }, (_body) => ({
			delegatedResource: [
				{
					from: subject,
					to: peerOut,
					frozen_balance_for_energy: 100_000_000,
					expire_time_for_energy: futureMs,
					frozen_balance_for_bandwidth: 50_000_000,
					expire_time_for_bandwidth: pastMs,
				},
			],
		}));

		const rows = await fetchAccountDelegations(newClient(), subject);
		const en = rows.find((r) => r.resource === "ENERGY");
		const bw = rows.find((r) => r.resource === "BANDWIDTH");
		expect(en?.lock).toBe(true);
		expect(bw?.lock).toBe(false);
	});
});

// ---------- sortDelegations integration ----------

const PEER_OUT = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV";
const PEER_IN = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjk8Py";
const SUBJECT_ADDR = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function mkDelegation(overrides: Partial<DelegationRow>): DelegationRow {
	return {
		direction: "out",
		from: SUBJECT_ADDR,
		to: PEER_OUT,
		resource: "ENERGY",
		amount: 1_000_000,
		amount_unit: "sun",
		decimals: 6,
		amount_trx: "1.0",
		expire_time: 1_700_000_000,
		expire_time_iso: "2023-11-14T22:13:20.000Z",
		lock: true,
		...overrides,
	};
}

describe("sortDelegations (default: amount desc, across out+in)", () => {
	const items: DelegationRow[] = [
		mkDelegation({ direction: "out", amount: 200, expire_time: 2000 }),
		mkDelegation({ direction: "in", from: PEER_IN, to: SUBJECT_ADDR, amount: 500, expire_time: 3000 }),
		mkDelegation({ direction: "out", amount: 100, expire_time: 1000 }),
	];

	it("defaults to amount desc, mixing out and in entries", () => {
		const out = sortDelegations(items, {});
		expect(out.map((r) => r.amount)).toEqual([500, 200, 100]);
	});

	it("--sort-by expire_time sorts asc (smallest / soonest-expiring first)", () => {
		const out = sortDelegations(items, { sortBy: "expire_time" });
		expect(out.map((r) => r.expire_time)).toEqual([1000, 2000, 3000]);
	});

	it("--reverse flips default amount desc into amount asc", () => {
		const out = sortDelegations(items, { reverse: true });
		expect(out.map((r) => r.amount)).toEqual([100, 200, 500]);
	});

	it("breaks ties on amount by expire_time asc (tie-break field)", () => {
		const tied: DelegationRow[] = [
			mkDelegation({ direction: "out", amount: 500, expire_time: 3000 }),
			mkDelegation({ direction: "out", amount: 500, expire_time: 1000 }),
			mkDelegation({ direction: "in", from: PEER_IN, to: SUBJECT_ADDR, amount: 900, expire_time: 2000 }),
			mkDelegation({ direction: "out", amount: 500, expire_time: 2000 }),
		];
		const out = sortDelegations(tied, {});
		// 900 first; tied 500s ordered by expire_time asc (1000, 2000, 3000)
		expect(out.map((r) => ({ amount: r.amount, expire: r.expire_time }))).toEqual([
			{ amount: 900, expire: 2000 },
			{ amount: 500, expire: 1000 },
			{ amount: 500, expire: 2000 },
			{ amount: 500, expire: 3000 },
		]);
	});

	it("rejects --sort-by on an unknown field with a UsageError", () => {
		expect(() => sortDelegations(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
	});
});

// ---------- renderDelegations (human, two-section with empty suppression) ----------

describe("renderDelegations (human two-section render)", () => {
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

	it("shows empty-state message when rows is empty", () => {
		renderDelegations([]);
		const joined = captured.join("\n");
		expect(joined).toContain("No delegations found.");
		expect(joined).not.toContain("Delegated out");
		expect(joined).not.toContain("Delegated in");
	});

	it("renders both section headers when out and in are present", () => {
		const rows: DelegationRow[] = [
			mkDelegation({ direction: "out", amount: 100_000_000, amount_trx: "100.0" }),
			mkDelegation({
				direction: "in",
				from: PEER_IN,
				to: SUBJECT_ADDR,
				amount: 50_000_000,
				amount_trx: "50.0",
			}),
		];
		renderDelegations(rows);
		const joined = captured.join("\n");
		expect(joined).toContain("Delegated out (1):");
		expect(joined).toContain("Delegated in (1):");
	});

	it("suppresses 'Delegated in' section when only out delegations exist", () => {
		const rows: DelegationRow[] = [
			mkDelegation({ direction: "out", amount: 100_000_000, amount_trx: "100.0" }),
			mkDelegation({ direction: "out", amount: 50_000_000, amount_trx: "50.0" }),
		];
		renderDelegations(rows);
		const joined = captured.join("\n");
		expect(joined).toContain("Delegated out (2):");
		expect(joined).not.toContain("Delegated in");
	});

	it("suppresses 'Delegated out' section when only in delegations exist", () => {
		const rows: DelegationRow[] = [
			mkDelegation({
				direction: "in",
				from: PEER_IN,
				to: SUBJECT_ADDR,
				amount: 50_000_000,
				amount_trx: "50.0",
			}),
		];
		renderDelegations(rows);
		const joined = captured.join("\n");
		expect(joined).toContain("Delegated in (1):");
		expect(joined).not.toContain("Delegated out");
	});
});

// ---------- JSON mode (--json flat array with direction discriminator) ----------

describe("account delegations JSON output", () => {
	it("--json emits a flat Row[] with direction field, not grouped by direction", () => {
		const rows: DelegationRow[] = [
			mkDelegation({
				direction: "out",
				amount: 100_000_000,
				amount_trx: "100.0",
				resource: "ENERGY",
			}),
			mkDelegation({
				direction: "in",
				from: PEER_IN,
				to: SUBJECT_ADDR,
				amount: 50_000_000,
				amount_trx: "50.0",
				resource: "BANDWIDTH",
			}),
		];
		const raw = formatJsonList(rows);
		const parsed = JSON.parse(raw) as DelegationRow[];
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(2);
		// Flat array: each element carries its own direction discriminator,
		// not wrapped in a { out: [...], in: [...] } object.
		expect(parsed[0]?.direction).toBe("out");
		expect(parsed[1]?.direction).toBe("in");
		expect(parsed[0]).toMatchObject({
			direction: "out",
			resource: "ENERGY",
			amount: 100_000_000,
			amount_unit: "sun",
			decimals: 6,
			amount_trx: "100.0",
		});
	});
});

// ---------- default_address resolution ----------

describe("account delegations default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-delegations-default-test");
	const TEST_CONFIG = join(TEST_DIR, "config.json");

	beforeEach(() => {
		mkdirSync(TEST_DIR, { recursive: true });
		setConfigValue(TEST_CONFIG, "default_address", SUBJECT_ADDR);
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	it("uses config default_address when argument is omitted", () => {
		expect(resolveAddress(undefined, TEST_CONFIG)).toBe(SUBJECT_ADDR);
	});
});
