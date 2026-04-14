import { describe, expect, it } from "bun:test";
import { applySort } from "../../src/utils/sort.js";

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

	it("returns empty array unchanged", () => {
		expect(applySort([], config, {})).toEqual([]);
	});

	it("does not mutate the input array", () => {
		const input = [...items];
		applySort(input, config, { sortBy: "fee" });
		expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
	});
});
