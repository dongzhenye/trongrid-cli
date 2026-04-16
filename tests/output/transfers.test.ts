import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	type CenteredTransferRow,
	renderCenteredTransferList,
	renderTransferList,
	renderUncenteredTransferList,
	type TransferRow,
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

describe("renderTransferList", () => {
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

	const SUBJECT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
	const PEER_A = "TWd4WNjBxxxxxxxxxxxxxxxxxxxxxxxxxAA";
	const TOKEN_ADDR = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

	function mkTransferRow(overrides: Partial<TransferRow>): TransferRow {
		return {
			tx_id: "4070abc5f820000000000000000000000000000000000000000000000000abcd",
			block_number: 80001,
			block_timestamp: 1776315900000,
			from: SUBJECT,
			to: PEER_A,
			value: "1000530000",
			value_unit: "raw",
			decimals: 6,
			value_major: "1000.53",
			token_address: TOKEN_ADDR,
			token_symbol: "USDT",
			direction: "out",
			...overrides,
		};
	}

	it("shows empty-state for 0 rows", () => {
		renderTransferList([]);
		expect(captured[0]).toContain("No transfers found");
	});

	it("singularizes header for 1 row", () => {
		renderTransferList([mkTransferRow({})]);
		expect(captured[0]).toContain("Found 1 transfer");
		expect(captured[0]).not.toContain("transfers");
	});

	it("pluralizes header for multiple rows", () => {
		const rows = [
			mkTransferRow({}),
			mkTransferRow({
				tx_id: "bdf8d93b0000000000000000000000000000000000000000000000000000dcba",
				value_major: "500.0",
			}),
		];
		renderTransferList(rows);
		expect(captured[0]).toContain("Found 2 transfers");
	});

	it("renders column headers (TX, Time (UTC), From, To, Amount)", () => {
		renderTransferList([mkTransferRow({})]);
		const headerLine = captured[1];
		expect(headerLine).toBeDefined();
		expect(headerLine).toContain("TX");
		expect(headerLine).toContain("Time (UTC)");
		expect(headerLine).toContain("From");
		expect(headerLine).toContain("To");
		expect(headerLine).toContain("Amount");
	});

	it("shows → arrow between From and To", () => {
		renderTransferList([mkTransferRow({})]);
		const joined = captured.join("\n");
		expect(joined).toContain("→");
	});

	it("appends token symbol as unit in Amount column", () => {
		renderTransferList([mkTransferRow({})]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		expect(dataRow).toContain("USDT");
		expect(dataRow).toContain("1,000.53");
	});

	it("uses truncated token_address as unit when symbol is undefined", () => {
		renderTransferList([mkTransferRow({ token_symbol: undefined })]);
		const dataRow = captured[2];
		expect(dataRow).toBeDefined();
		// Truncated TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8 → TEkxiT...66rdz8
		expect(dataRow).toContain("TEkxiT");
		expect(dataRow).toContain("66rdz8");
	});

	it("adds thousands separators to amounts", () => {
		renderTransferList([mkTransferRow({ value_major: "1000000.5" })]);
		const joined = captured.join("\n");
		expect(joined).toContain("1,000,000.5");
	});

	it("right-aligns amounts so decimal points stack", () => {
		// Use equal fractional width (both .xx) so right-alignment produces
		// aligned decimal points. Real-world: same token always has the same
		// number of decimal places.
		const rows = [
			mkTransferRow({ value_major: "1000.53" }),
			mkTransferRow({
				tx_id: "bdf8d93b0000000000000000000000000000000000000000000000000000dcba",
				value_major: "500.00",
			}),
		];
		renderTransferList(rows);
		const row1 = captured.find((l) => l.includes("1,000.53"));
		const row2 = captured.find((l) => l.includes("500.00"));
		expect(row1).toBeDefined();
		expect(row2).toBeDefined();
		// Decimal points must align — the "." in "1,000.53" and "500.00"
		// should be at the same column position.
		const dot1 = row1!.indexOf("1,000.53") + 5; // "1,000.53"[5] == "."
		const dot2 = row2!.indexOf("500.00") + 3; // "500.00"[3] == "."  (padded: "  500.00")
		expect(dot1).toBe(dot2);
	});

	it("uses list timestamp format YYYY-MM-DD HH:MM (no seconds)", () => {
		renderTransferList([mkTransferRow({ block_timestamp: 1776315900000 })]);
		const joined = captured.join("\n");
		// Should contain date + time without seconds
		expect(joined).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
		// Should NOT contain seconds (the detail format has HH:MM:SS)
		expect(joined).not.toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
	});

	it("right-aligns Amount header to match data cell width (number + unit)", () => {
		// Two rows with different unit lengths to verify max-unit-width logic.
		const rows = [
			mkTransferRow({ value_major: "1000.53", token_symbol: "USDT" }),
			mkTransferRow({
				tx_id: "bdf8d93b0000000000000000000000000000000000000000000000000000dcba",
				value_major: "500.00",
				token_symbol: "WTRX",
			}),
		];
		renderTransferList(rows);
		const headerLine = captured[1]!;
		const dataLine1 = captured.find((l) => l.includes("1,000.53 USDT"))!;
		expect(headerLine).toBeDefined();
		expect(dataLine1).toBeDefined();
		// "Amount" header should end at the same column position as "USDT"/"WTRX"
		// (the right edge of the data cell).
		const headerAmountEnd = headerLine.indexOf("Amount") + "Amount".length;
		const dataUsdtEnd = dataLine1.indexOf("USDT") + "USDT".length;
		expect(headerAmountEnd).toBe(dataUsdtEnd);
	});
});
