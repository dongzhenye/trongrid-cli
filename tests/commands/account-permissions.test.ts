import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import {
	type AccountPermissions,
	fetchAccountPermissions,
	rejectSortFlags,
	renderPermissions,
} from "../../src/commands/account/permissions.js";
import { formatJson, UsageError } from "../../src/output/format.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

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

// ---------- renderPermissions (human output) ----------

const SUBJECT_ADDR = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function mkPermissions(overrides: Partial<AccountPermissions> = {}): AccountPermissions {
	return {
		address: SUBJECT_ADDR,
		owner: {
			type: "Owner",
			permission_name: "owner",
			threshold: 1,
			keys: [{ address: "TOnlyKey111111111111111111111111111", weight: 1 }],
		},
		active: [
			{
				type: "Active",
				id: 0,
				permission_name: "active",
				threshold: 1,
				keys: [{ address: "TOnlyKey111111111111111111111111111", weight: 1 }],
			},
		],
		witness: null,
		...overrides,
	};
}

describe("renderPermissions (human render)", () => {
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

	it("single-key owner, no extra active, no witness → minimal render", () => {
		renderPermissions(mkPermissions());
		const joined = captured.join("\n");
		expect(joined).toContain(`Address: ${SUBJECT_ADDR}`);
		expect(joined).toContain("normal account");
		expect(joined).toContain("Owner permission:");
		expect(joined).toContain("threshold: 1");
		expect(joined).toContain("Active permission #0");
		expect(joined).not.toContain("Witness permission");
	});

	it("multi-sig (2-of-3) owner renders threshold 2 with three weight rows", () => {
		const data = mkPermissions({
			owner: {
				type: "Owner",
				permission_name: "owner",
				threshold: 2,
				keys: [
					{ address: "THighAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", weight: 3 },
					{ address: "TMidBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", weight: 2 },
					{ address: "TLowCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC", weight: 1 },
				],
			},
		});
		renderPermissions(data);
		const joined = captured.join("\n");
		expect(joined).toContain("Owner permission:");
		expect(joined).toContain("threshold: 2");
		expect(joined).toContain("weight 3");
		expect(joined).toContain("weight 2");
		expect(joined).toContain("weight 1");
	});

	it("multi-permission active renders numbered sections #0 / #1 / #2", () => {
		const data = mkPermissions({
			active: [
				{
					type: "Active",
					id: 0,
					permission_name: "active0",
					threshold: 1,
					keys: [{ address: "TA11111111111111111111111111111111", weight: 1 }],
				},
				{
					type: "Active",
					id: 1,
					permission_name: "active1",
					threshold: 1,
					keys: [{ address: "TB22222222222222222222222222222222", weight: 1 }],
				},
				{
					type: "Active",
					id: 2,
					permission_name: "hot-wallet",
					threshold: 1,
					keys: [{ address: "TC33333333333333333333333333333333", weight: 1 }],
				},
			],
		});
		renderPermissions(data);
		const joined = captured.join("\n");
		expect(joined).toContain("Active permission #0 (active0)");
		expect(joined).toContain("Active permission #1 (active1)");
		expect(joined).toContain("Active permission #2 (hot-wallet)");
	});

	it("witness present renders an extra Witness permission section and flags SR account", () => {
		const data = mkPermissions({
			witness: {
				type: "Witness",
				permission_name: "witness",
				threshold: 1,
				keys: [{ address: "TSRWitnessXXXXXXXXXXXXXXXXXXXXXXXXX", weight: 1 }],
			},
		});
		renderPermissions(data);
		const joined = captured.join("\n");
		expect(joined).toContain("SR account");
		expect(joined).toContain("Witness permission:");
	});

	it("witness absent → no Witness permission line at all (silent omission)", () => {
		renderPermissions(mkPermissions({ witness: null }));
		const joined = captured.join("\n");
		expect(joined).not.toContain("Witness permission");
	});
});

// ---------- --json output (structured object, not array) ----------

describe("account permissions --json output", () => {
	it("--json returns { owner, active, witness } shape, not an array", () => {
		const data = mkPermissions({
			witness: {
				type: "Witness",
				permission_name: "witness",
				threshold: 1,
				keys: [{ address: "TSRWitnessXXXXXXXXXXXXXXXXXXXXXXXXX", weight: 1 }],
			},
		});
		const raw = formatJson(data);
		const parsed = JSON.parse(raw) as unknown;
		expect(Array.isArray(parsed)).toBe(false);
		expect(typeof parsed).toBe("object");
		const obj = parsed as Record<string, unknown>;
		expect(obj.address).toBe(SUBJECT_ADDR);
		expect(obj.owner).toBeDefined();
		expect(Array.isArray(obj.active)).toBe(true);
		expect(obj.witness).toBeDefined();
	});

	it("--json --fields owner,witness filters top-level keys", () => {
		const data = mkPermissions({
			witness: {
				type: "Witness",
				permission_name: "witness",
				threshold: 1,
				keys: [{ address: "TSRWitnessXXXXXXXXXXXXXXXXXXXXXXXXX", weight: 1 }],
			},
		});
		const raw = formatJson(data, ["owner", "witness"]);
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		expect(Object.keys(parsed).sort()).toEqual(["owner", "witness"]);
		expect(parsed.address).toBeUndefined();
		expect(parsed.active).toBeUndefined();
		expect(parsed.owner).toBeDefined();
		expect(parsed.witness).toBeDefined();
	});
});

// ---------- rejectSortFlags (action-level UsageError) ----------

describe("rejectSortFlags (--sort-by / --reverse rejection)", () => {
	it("throws UsageError with a distinct hint on --sort-by", () => {
		expect(() => rejectSortFlags({ sortBy: "weight" })).toThrow(UsageError);
		try {
			rejectSortFlags({ sortBy: "weight" });
		} catch (err) {
			expect(err).toBeInstanceOf(UsageError);
			expect((err as Error).message).toContain("permissions are structured");
			expect((err as Error).message).toContain("--json | jq");
		}
	});

	it("throws UsageError on --reverse", () => {
		expect(() => rejectSortFlags({ reverse: true })).toThrow(UsageError);
	});

	it("accepts empty opts (no flags → no throw)", () => {
		expect(() => rejectSortFlags({})).not.toThrow();
		expect(() => rejectSortFlags({ sortBy: undefined, reverse: false })).not.toThrow();
	});
});

// ---------- default_address resolution ----------

describe("account permissions default_address resolution", () => {
	const TEST_DIR = join(import.meta.dirname, ".tmp-account-permissions-default-test");
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
