import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountDelegations } from "../../src/commands/account/delegations.js";

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
