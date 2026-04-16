import { describe, expect, it } from "bun:test";
import { UsageError } from "../../src/output/format.js";
import { parseTimeRange } from "../../src/utils/time-range.js";

describe("parseTimeRange", () => {
	it("accepts unix seconds", () => {
		expect(parseTimeRange("1744694400", undefined)).toEqual({ maxTimestamp: 1744694400_000 });
		expect(parseTimeRange(undefined, "1744694400")).toEqual({ minTimestamp: 1744694400_000 });
	});

	it("accepts ISO-8601 datetime", () => {
		const iso = "2026-04-15T00:00:00Z";
		const expected = new Date(iso).getTime();
		expect(parseTimeRange(iso, undefined)).toEqual({ maxTimestamp: expected });
	});

	it("accepts ISO-8601 date-only (treated as UTC midnight)", () => {
		const expected = new Date("2026-04-15T00:00:00Z").getTime();
		expect(parseTimeRange("2026-04-15", undefined)).toEqual({ maxTimestamp: expected });
	});

	it("accepts both bounds", () => {
		const result = parseTimeRange("2026-04-15", "2026-04-01");
		expect(result.maxTimestamp).toBeGreaterThan(result.minTimestamp as number);
	});

	it("throws UsageError on unparseable value", () => {
		expect(() => parseTimeRange("not-a-date", undefined)).toThrow(UsageError);
	});

	it("throws UsageError on inverted range (before < after)", () => {
		expect(() => parseTimeRange("2026-04-01", "2026-04-15")).toThrow(UsageError);
	});

	it("returns empty object when both bounds absent", () => {
		expect(parseTimeRange(undefined, undefined)).toEqual({});
	});

	it("rejects unix milliseconds (too large to be seconds)", () => {
		expect(() => parseTimeRange("1744694400000", undefined)).toThrow(UsageError);
	});
});
