import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	type CenteredTransferRow,
	renderCenteredTransferList,
	renderUncenteredTransferList,
	type UncenteredTransferRow,
} from "../../src/output/transfers.js";

describe("renderCenteredTransferList", () => {
	// NO_COLOR forces styleText to emit plain ASCII; assertions stay simple.
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

	const sample: CenteredTransferRow[] = [
		{
			tx_id: "abc1234deadbeef0000000000000000000000000000000000000000000000f3e9",
			block_number: 70001,
			timestamp: 1744694400000,
			direction: "out",
			counterparty: "TQ4ge2gr7LvrKKeoQsrwxxxxxxxxxxfyEV",
			token_address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
			token_symbol: "USDT",
			amount: "1000000",
			amount_unit: "raw",
			decimals: 6,
			amount_major: "1.000000",
		},
		{
			tx_id: "def456abba0000000000000000000000000000000000000000000000000a012c",
			block_number: 70000,
			timestamp: 1744694100000,
			direction: "in",
			counterparty: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjk8Py",
			token_address: "TR7NUSDCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
			token_symbol: "USDC",
			amount: "500000000",
			amount_unit: "raw",
			decimals: 6,
			amount_major: "500.000000",
		},
	];

	it("renders header + aligned rows for n=2", () => {
		renderCenteredTransferList(sample);
		expect(captured[0]).toContain("Found 2 transfers");
		expect(captured.length).toBeGreaterThanOrEqual(3); // header + 2 rows
	});

	it("singularizes header for 1 row", () => {
		const first = sample[0];
		if (!first) throw new Error("sample[0] missing");
		renderCenteredTransferList([first]);
		expect(captured[0]).toContain("Found 1 transfer");
		expect(captured[0]).not.toContain("transfers");
	});

	it("shows empty-state for 0 rows", () => {
		renderCenteredTransferList([]);
		expect(captured[0]).toContain("No transfers found");
	});

	it("right-aligns amounts so decimal points stack", () => {
		renderCenteredTransferList(sample);
		const row1 = captured.find((l) => l.includes("1.000000"));
		const row2 = captured.find((l) => l.includes("500.000000"));
		if (!row1 || !row2) throw new Error("rows not found");
		// Decimal-point alignment: the index of "." in the amount column must
		// be identical across rows because the shorter value is left-padded.
		const dot1 = row1.indexOf("1.000000") + 1; // position of "."
		const dot2 = row2.indexOf("500.000000") + 3;
		expect(dot1).toBe(dot2);
	});
});

describe("renderUncenteredTransferList", () => {
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

	const sampleRows: UncenteredTransferRow[] = [
		{
			tx_id: "a1b2c3d4e5f6000000000000000000000000000000000000000000000000abcd",
			block_timestamp: 1744694400000,
			from: "TQsampleFromAddress000000000000000A",
			to: "TQsampleToAddress0000000000000000BB",
			value: "5000000",
			decimals: 6,
			value_major: "5.000000",
		},
		{
			tx_id: "f1e2d3c4b5a6000000000000000000000000000000000000000000000000dcba",
			block_timestamp: 1744694100000,
			from: "TQsampleFromAddress000000000000000C",
			to: "TQsampleToAddress0000000000000000DD",
			value: "250000000",
			decimals: 6,
			value_major: "250.000000",
		},
	];

	it("renders empty state for 0 rows", () => {
		renderUncenteredTransferList([]);
		expect(captured[0]).toContain("No transfers found.");
	});

	it("singularizes header and shows → for 1 row", () => {
		const first = sampleRows[0];
		if (!first) throw new Error("sampleRows[0] missing");
		renderUncenteredTransferList([first]);
		expect(captured[0]).toContain("Found 1 transfer");
		expect(captured[0]).not.toContain("transfers");
		const lines = captured.join("\n");
		expect(lines).toContain("→");
		expect(lines).toContain("5.000000");
	});

	it("pluralizes header for multiple rows", () => {
		renderUncenteredTransferList(sampleRows);
		expect(captured[0]).toContain("Found 2 transfers");
		expect(captured.length).toBeGreaterThanOrEqual(3); // header + 2 rows
	});
});
