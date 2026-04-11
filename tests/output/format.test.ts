import { describe, expect, it } from "bun:test";
import {
	formatJson,
	formatJsonList,
	formatKeyValue,
	printListResult,
	sunToTrx,
} from "../../src/output/format.js";

describe("sunToTrx", () => {
	it("converts sun to TRX", () => {
		expect(sunToTrx(1_000_000)).toBe("1");
		expect(sunToTrx(1_500_000)).toBe("1.5");
		expect(sunToTrx(0)).toBe("0");
	});

	it("handles large values", () => {
		expect(sunToTrx(1_000_000_000_000)).toBe("1000000");
	});

	it("preserves full precision for fractional values", () => {
		expect(sunToTrx(35216519)).toBe("35.216519");
		expect(sunToTrx(100001)).toBe("0.100001");
		expect(sunToTrx(1)).toBe("0.000001");
	});

	it("handles negative values", () => {
		expect(sunToTrx(-500000)).toBe("-0.5");
		expect(sunToTrx(-1_000_000)).toBe("-1");
		expect(sunToTrx(-1)).toBe("-0.000001");
	});
});

describe("formatKeyValue", () => {
	it("formats key-value pairs with aligned columns", () => {
		const output = formatKeyValue([
			["Address", "TXxx"],
			["Balance", "100 TRX"],
		]);
		expect(output).toContain("Address");
		expect(output).toContain("TXxx");
		expect(output).toContain("Balance");
		expect(output).toContain("100 TRX");
	});
});

describe("formatJson", () => {
	it("outputs stable JSON", () => {
		const data = { address: "TXxx", balance: 100 };
		const output = formatJson(data);
		expect(JSON.parse(output)).toEqual(data);
	});

	it("filters fields when specified", () => {
		const data = { address: "TXxx", balance: 100, type: "EOA" };
		const output = formatJson(data, ["address", "balance"]);
		const parsed = JSON.parse(output);
		expect(parsed).toEqual({ address: "TXxx", balance: 100 });
		expect(parsed.type).toBeUndefined();
	});
});

describe("formatJsonList", () => {
	it("outputs an array as stable JSON", () => {
		const items = [
			{ symbol: "USDT", balance: "100" },
			{ symbol: "JST", balance: "200" },
		];
		const output = formatJsonList(items);
		expect(JSON.parse(output)).toEqual(items);
	});

	it("filters fields per item when specified", () => {
		const items = [
			{ symbol: "USDT", balance: "100", decimals: 6 },
			{ symbol: "JST", balance: "200", decimals: 18 },
		];
		const output = formatJsonList(items, ["symbol", "balance"]);
		const parsed = JSON.parse(output);
		expect(parsed).toEqual([
			{ symbol: "USDT", balance: "100" },
			{ symbol: "JST", balance: "200" },
		]);
	});

	it("preserves order and handles empty arrays", () => {
		expect(JSON.parse(formatJsonList([]))).toEqual([]);
		expect(JSON.parse(formatJsonList([]), ["x"] as never)).toEqual([]);
	});
});

describe("printListResult", () => {
	const originalLog = console.log;
	let captured: string[];
	const capture = () => {
		captured = [];
		console.log = (msg?: unknown) => {
			captured.push(typeof msg === "string" ? msg : JSON.stringify(msg));
		};
	};
	const restore = () => {
		console.log = originalLog;
	};

	it("prints JSON list when json=true and skips human renderer", () => {
		capture();
		let humanCalled = false;
		try {
			printListResult(
				[{ a: 1 }, { a: 2 }],
				() => {
					humanCalled = true;
				},
				{ json: true },
			);
		} finally {
			restore();
		}
		expect(humanCalled).toBe(false);
		expect(captured).toHaveLength(1);
		expect(JSON.parse(captured[0])).toEqual([{ a: 1 }, { a: 2 }]);
	});

	it("invokes human renderer when json=false", () => {
		let receivedItems: Array<{ a: number }> = [];
		capture();
		try {
			printListResult(
				[{ a: 1 }, { a: 2 }],
				(items) => {
					receivedItems = items;
				},
				{ json: false },
			);
		} finally {
			restore();
		}
		expect(receivedItems).toEqual([{ a: 1 }, { a: 2 }]);
		expect(captured).toHaveLength(0); // Human renderer didn't log here
	});

	it("passes fields filter into formatJsonList when json=true", () => {
		capture();
		try {
			printListResult(
				[
					{ a: 1, b: 2, c: 3 },
					{ a: 4, b: 5, c: 6 },
				],
				() => {},
				{ json: true, fields: ["a", "c"] },
			);
		} finally {
			restore();
		}
		expect(JSON.parse(captured[0])).toEqual([
			{ a: 1, c: 3 },
			{ a: 4, c: 6 },
		]);
	});
});
