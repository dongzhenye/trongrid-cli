import { describe, expect, it } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountPermissions } from "../../src/commands/account/permissions.js";

describe("fetchAccountPermissions", () => {
	it("returns structured owner + active + witness shape", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const fixture = {
			address: subject,
			owner_permission: {
				type: "Owner",
				permission_name: "owner",
				threshold: 2,
				keys: [
					{ address: "TKeyA", weight: 1 },
					{ address: "TKeyB", weight: 1 },
					{ address: "TKeyC", weight: 2 },
				],
			},
			active_permission: [
				{
					type: "Active",
					permission_name: "active0",
					threshold: 1,
					operations: "7fff1fc0037e0000000000000000000000000000000000000000000000000000",
					keys: [{ address: "TKeyA", weight: 1 }],
				},
			],
			witness_permission: {
				type: "Witness",
				permission_name: "witness",
				threshold: 1,
				keys: [{ address: "TSR", weight: 1 }],
			},
		};
		const origFetch = globalThis.fetch;
		globalThis.fetch = async () =>
			new Response(JSON.stringify(fixture), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		try {
			const client = createClient({ network: "mainnet", apiKey: undefined });
			const result = await fetchAccountPermissions(client, subject);
			expect(result.owner.type).toBe("Owner");
			expect(result.owner.keys).toHaveLength(3);
			// Keys sorted by weight desc in fetch layer — top-weighted first
			expect(result.owner.keys[0]?.weight).toBe(2);
			expect(result.active.length).toBeGreaterThan(0);
			expect(result.witness).not.toBeNull();
		} finally {
			globalThis.fetch = origFetch;
		}
	});
});
