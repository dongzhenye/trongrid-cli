import { describe, expect, it } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountPermissions } from "../../src/commands/account/permissions.js";
import { UsageError } from "../../src/output/format.js";

function mockFetchOnce(fixture: unknown): () => void {
	const origFetch = globalThis.fetch;
	globalThis.fetch = async () =>
		new Response(JSON.stringify(fixture), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	return () => {
		globalThis.fetch = origFetch;
	};
}

const client = createClient({ network: "mainnet", apiKey: undefined });

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
		const restore = mockFetchOnce(fixture);
		try {
			const result = await fetchAccountPermissions(client, subject);
			expect(result.owner.type).toBe("Owner");
			expect(result.owner.keys).toHaveLength(3);
			// Keys sorted by weight desc in fetch layer — top-weighted first
			expect(result.owner.keys[0]?.weight).toBe(2);
			expect(result.active.length).toBeGreaterThan(0);
			expect(result.witness).not.toBeNull();
		} finally {
			restore();
		}
	});

	it("handles single-key owner, no witness", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const fixture = {
			address: subject,
			owner_permission: {
				type: "Owner",
				permission_name: "owner",
				threshold: 1,
				keys: [{ address: "TOnlyKey", weight: 1 }],
			},
			active_permission: [
				{
					type: "Active",
					permission_name: "active",
					threshold: 1,
					keys: [{ address: "TOnlyKey", weight: 1 }],
				},
			],
		};
		const restore = mockFetchOnce(fixture);
		try {
			const result = await fetchAccountPermissions(client, subject);
			expect(result.owner.threshold).toBe(1);
			expect(result.owner.keys).toHaveLength(1);
			expect(result.owner.keys[0]?.address).toBe("TOnlyKey");
			expect(result.witness).toBeNull();
			expect(result.active).toHaveLength(1);
			expect(result.active[0]?.id).toBe(0);
		} finally {
			restore();
		}
	});

	it("sorts multi-sig owner keys by weight desc (2-of-3)", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const fixture = {
			address: subject,
			owner_permission: {
				type: "Owner",
				permission_name: "owner",
				threshold: 2,
				keys: [
					{ address: "TLow", weight: 1 },
					{ address: "TMid", weight: 2 },
					{ address: "THigh", weight: 3 },
				],
			},
			active_permission: [],
		};
		const restore = mockFetchOnce(fixture);
		try {
			const result = await fetchAccountPermissions(client, subject);
			expect(result.owner.keys.map((k) => k.address)).toEqual(["THigh", "TMid", "TLow"]);
			expect(result.owner.keys.map((k) => k.weight)).toEqual([3, 2, 1]);
		} finally {
			restore();
		}
	});

	it("assigns sequential ids to multiple active_permission entries", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const fixture = {
			address: subject,
			owner_permission: {
				type: "Owner",
				permission_name: "owner",
				threshold: 1,
				keys: [{ address: "TOwner", weight: 1 }],
			},
			active_permission: [
				{
					type: "Active",
					permission_name: "active0",
					threshold: 1,
					keys: [{ address: "TA", weight: 1 }],
				},
				{
					type: "Active",
					permission_name: "active1",
					threshold: 1,
					keys: [{ address: "TB", weight: 1 }],
				},
				{
					type: "Active",
					permission_name: "active2",
					threshold: 1,
					keys: [{ address: "TC", weight: 1 }],
				},
			],
		};
		const restore = mockFetchOnce(fixture);
		try {
			const result = await fetchAccountPermissions(client, subject);
			expect(result.active).toHaveLength(3);
			expect(result.active[0]?.id).toBe(0);
			expect(result.active[1]?.id).toBe(1);
			expect(result.active[2]?.id).toBe(2);
			expect(result.active[0]?.permission_name).toBe("active0");
			expect(result.active[2]?.permission_name).toBe("active2");
		} finally {
			restore();
		}
	});

	it("parses witness_permission on SR account", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const fixture = {
			address: subject,
			owner_permission: {
				type: "Owner",
				permission_name: "owner",
				threshold: 1,
				keys: [{ address: "TSROwner", weight: 1 }],
			},
			active_permission: [],
			witness_permission: {
				type: "Witness",
				permission_name: "witness",
				threshold: 1,
				keys: [{ address: "TSRWitness", weight: 1 }],
			},
		};
		const restore = mockFetchOnce(fixture);
		try {
			const result = await fetchAccountPermissions(client, subject);
			expect(result.witness).not.toBeNull();
			expect(result.witness?.type).toBe("Witness");
			expect(result.witness?.keys[0]?.address).toBe("TSRWitness");
		} finally {
			restore();
		}
	});

	it("throws plain Error (not UsageError) on not-activated account", async () => {
		const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
		const restore = mockFetchOnce({});
		try {
			let thrown: unknown;
			try {
				await fetchAccountPermissions(client, subject);
			} catch (err) {
				thrown = err;
			}
			expect(thrown).toBeInstanceOf(Error);
			expect(thrown).not.toBeInstanceOf(UsageError);
			expect((thrown as Error).message).toContain("not activated");
		} finally {
			restore();
		}
	});
});
