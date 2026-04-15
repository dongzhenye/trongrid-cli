import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountDelegations } from "../../src/commands/account/delegations.js";

describe("fetchAccountDelegations", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses both out and in delegations from index + detail responses", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const peerOut = "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV";
		const peerIn = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjk8Py";

		const indexFixture = {
			toAccounts: [peerOut],
			fromAccounts: [peerIn],
		};
		const detailFixtures: Record<string, unknown> = {
			out: {
				delegatedResource: [
					{
						from: subject,
						to: peerOut,
						frozen_balance_for_energy: 100_000_000,
						expire_time_for_energy: 9_999_999_999_000,
					},
				],
			},
			in: {
				delegatedResource: [
					{
						from: peerIn,
						to: subject,
						frozen_balance_for_bandwidth: 50_000_000,
						expire_time_for_bandwidth: 9_999_999_999_000,
					},
				],
			},
		};

		globalThis.fetch = (async (input: Request | string | URL, init?: RequestInit) => {
			const url =
				typeof input === "string"
					? input
					: input instanceof URL
						? input.toString()
						: input.url;
			const lower = url.toLowerCase();
			if (lower.includes("getdelegatedresourceaccountindexv2")) {
				return new Response(JSON.stringify(indexFixture), { status: 200 });
			}
			if (lower.includes("getdelegatedresourcev2")) {
				const body = JSON.parse(String(init?.body ?? "{}")) as {
					fromAddress?: string;
				};
				const key = body.fromAddress === subject ? "out" : "in";
				return new Response(JSON.stringify(detailFixtures[key]), { status: 200 });
			}
			throw new Error(`Unexpected URL: ${url}`);
		}) as unknown as typeof fetch;

		const client = createClient({ network: "mainnet", apiKey: undefined });
		const rows = await fetchAccountDelegations(client, subject);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.some((r) => r.direction === "out")).toBe(true);
		expect(rows.some((r) => r.direction === "in")).toBe(true);
	});
});
