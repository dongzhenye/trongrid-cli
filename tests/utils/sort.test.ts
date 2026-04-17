import { describe, expect, it } from "bun:test";
import { UsageError } from "../../src/output/format.js";
import { applySort, type SortConfig } from "../../src/utils/sort.js";

const items = [
	{ id: "a", ts: 10, fee: 100 },
	{ id: "b", ts: 30, fee: 50 },
	{ id: "c", ts: 20, fee: 300 },
];

const config = {
	defaultField: "ts",
	fieldDirections: { ts: "desc", fee: "desc", id: "asc" } as const,
};

describe("applySort", () => {
	it("sorts by defaultField with its default direction", () => {
		const out = applySort(items, config, {});
		expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]); // ts desc
	});

	it("--sort-by switches field, using the new field's default direction", () => {
		const out = applySort(items, config, { sortBy: "fee" });
		expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]); // fee desc
	});

	it("--sort-by respects asc direction for dim-like fields", () => {
		const out = applySort(items, config, { sortBy: "id" });
		expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]); // id asc
	});

	it("--reverse flips the current direction (default field)", () => {
		const out = applySort(items, config, { reverse: true });
		expect(out.map((x) => x.id)).toEqual(["a", "c", "b"]); // ts asc
	});

	it("--reverse combines with --sort-by", () => {
		const out = applySort(items, config, { sortBy: "fee", reverse: true });
		expect(out.map((x) => x.id)).toEqual(["b", "a", "c"]); // fee asc
	});

	it("rejects --sort-by on an unknown field with an actionable error", () => {
		expect(() => applySort(items, config, { sortBy: "unknown" })).toThrow(
			/unknown sort field.*ts.*fee.*id/i,
		);
	});

	it("throws UsageError (not generic Error) on unknown field", () => {
		// Marker class drives reportErrorAndExit to map to exit 2 (usage
		// error) instead of 1 (general). Agents read the exit code to
		// decide whether to retry — exit 2 means "do not retry".
		try {
			applySort(items, config, { sortBy: "bogus" });
			throw new Error("expected applySort to throw");
		} catch (e) {
			expect(e).toBeInstanceOf(UsageError);
		}
	});

	it("returns empty array unchanged", () => {
		expect(applySort([], config, {})).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const input = [...items];
		applySort(input, config, { sortBy: "fee" });
		expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
	});
});

describe("applySort tieBreakField", () => {
	interface Row {
		primary: number;
		tie: number;
	}

	it("breaks ties using tieBreakField per its own direction", () => {
		const rows: Row[] = [
			{ primary: 5, tie: 100 },
			{ primary: 5, tie: 300 },
			{ primary: 5, tie: 200 },
			{ primary: 3, tie: 999 },
		];
		const sorted = applySort(
			rows,
			{
				defaultField: "primary",
				fieldDirections: { primary: "desc", tie: "desc" },
				tieBreakField: "tie",
			},
			{},
		);
		expect(sorted.map((r) => r.tie)).toEqual([300, 200, 100, 999]);
	});

	it("leaves input order for ties when no tieBreakField", () => {
		const rows: Row[] = [
			{ primary: 5, tie: 100 },
			{ primary: 5, tie: 300 },
			{ primary: 5, tie: 200 },
		];
		const sorted = applySort(
			rows,
			{ defaultField: "primary", fieldDirections: { primary: "desc", tie: "desc" } },
			{},
		);
		expect(sorted.map((r) => r.tie)).toEqual([100, 300, 200]);
	});

	it("ignores tieBreakField when it equals the primary sort field", () => {
		const rows: Row[] = [
			{ primary: 5, tie: 100 },
			{ primary: 3, tie: 200 },
		];
		const sorted = applySort(
			rows,
			{
				defaultField: "primary",
				fieldDirections: { primary: "desc", tie: "desc" },
				tieBreakField: "primary",
			},
			{},
		);
		expect(sorted.map((r) => r.primary)).toEqual([5, 3]);
	});
});

describe("applySort with fieldTypes", () => {
	interface Row {
		id: string;
		value: string; // raw integer string (variable length)
		count: number; // safe-integer
		rank: number; // safe-integer
	}

	const items: Row[] = [
		{ id: "a", value: "1000", count: 5, rank: 2 },
		{ id: "b", value: "99", count: 1, rank: 1 },
		{ id: "c", value: "100", count: 3, rank: 3 },
	];

	it("bigint sort orders unequal-width numeric strings correctly", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			fieldTypes: { value: "bigint" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["a", "c", "b"]); // 1000 > 100 > 99
	});

	it("number sort orders integers correctly", () => {
		const config: SortConfig<Row> = {
			defaultField: "count",
			fieldDirections: { count: "desc" },
			fieldTypes: { count: "number" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["a", "c", "b"]); // 5, 3, 1
	});

	it("string sort (default) gives lexicographic order — preserved for backward compat", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			// fieldTypes omitted — defaults to string
		};
		const out = applySort(items, config, {});
		// Lex order desc: "99" > "1000" > "100"
		expect(out.map((r) => r.id)).toEqual(["b", "a", "c"]);
	});

	it("bigint sort handles asc direction", () => {
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "asc" },
			fieldTypes: { value: "bigint" },
		};
		const out = applySort(items, config, {});
		expect(out.map((r) => r.id)).toEqual(["b", "c", "a"]); // 99, 100, 1000
	});

	it("bigint sort falls back to string compare when value is not a valid integer", () => {
		const dirty: Row[] = [
			{ id: "a", value: "not_a_number", count: 0, rank: 0 },
			{ id: "b", value: "100", count: 0, rank: 0 },
		];
		const config: SortConfig<Row> = {
			defaultField: "value",
			fieldDirections: { value: "desc" },
			fieldTypes: { value: "bigint" },
		};
		// Should not throw; fallback to lex compare
		expect(() => applySort(dirty, config, {})).not.toThrow();
	});
});
