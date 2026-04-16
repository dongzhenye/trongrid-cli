import { describe, expect, it } from "bun:test";
import {
	alignNumber,
	alignText,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../../src/output/columns.js";

describe("alignNumber", () => {
	it("right-aligns numeric strings to a fixed width", () => {
		expect(alignNumber("1.234", 8)).toBe("   1.234");
		expect(alignNumber("500.00", 8)).toBe("  500.00");
	});
	it("leaves overlong values untruncated (caller's responsibility)", () => {
		expect(alignNumber("12345.678", 5)).toBe("12345.678");
	});
});

describe("alignText", () => {
	it("left-aligns by default", () => {
		expect(alignText("ENERGY", 9)).toBe("ENERGY   ");
	});
	it("right-aligns when requested", () => {
		expect(alignText("OK", 5, "right")).toBe("   OK");
	});
});

describe("truncateAddress", () => {
	it("returns 6+6 truncated form by default (anti-spoofing)", () => {
		expect(truncateAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe("TR7NHq...gjLj6t");
	});
	it("respects custom head/tail widths", () => {
		expect(truncateAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", 3, 3)).toBe("TR7...j6t");
	});
	it("returns address unchanged if shorter than head+tail+3", () => {
		expect(truncateAddress("TR7N")).toBe("TR7N");
	});
});

describe("computeColumnWidths", () => {
	it("returns max width per column", () => {
		const rows = [
			["a", "bb", "ccc"],
			["aaa", "b", "cc"],
		];
		expect(computeColumnWidths(rows)).toEqual([3, 2, 3]);
	});
	it("handles empty rows", () => {
		expect(computeColumnWidths([])).toEqual([]);
	});
});

describe("renderColumns", () => {
	it("joins cells with 2-space separator by default", () => {
		const rows = [
			["a  ", "bb", "ccc"],
			["aaa", "b ", "cc "],
		];
		const widths = [3, 2, 3];
		const lines = renderColumns(rows, widths);
		expect(lines).toEqual(["a    bb  ccc", "aaa  b   cc "]);
	});
	it("respects a custom separator", () => {
		const rows = [["a", "b"]];
		const widths = [1, 1];
		expect(renderColumns(rows, widths, " | ")).toEqual(["a | b"]);
	});
});
