import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { TrongridError } from "../../src/api/client.js";
import {
	formatJson,
	formatJsonList,
	formatKeyValue,
	printError,
	printListResult,
	reportErrorAndExit,
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

describe("printError hint option", () => {
	const originalError = console.error;
	let captured: string[];
	const originalNoColor = process.env.NO_COLOR;

	beforeEach(() => {
		process.env.NO_COLOR = "1";
		captured = [];
		console.error = (msg?: unknown) => {
			captured.push(typeof msg === "string" ? msg : String(msg));
		};
	});

	afterEach(() => {
		console.error = originalError;
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	it("emits a Hint: line in human mode when hint is provided", () => {
		printError("Something broke", { hint: "try running foo" });
		expect(captured).toHaveLength(2);
		expect(captured[0]).toContain("Error: Something broke");
		expect(captured[1]).toContain("Hint: try running foo");
	});

	it("does not emit a Hint line when hint is omitted", () => {
		printError("Something broke", {});
		expect(captured).toHaveLength(1);
		expect(captured[0]).toContain("Error: Something broke");
	});

	it("includes hint field in JSON output", () => {
		printError("Something broke", {
			json: true,
			hint: "try running foo",
			upstream: { code: 42 },
		});
		expect(captured).toHaveLength(1);
		const parsed = JSON.parse(captured[0]);
		expect(parsed.error).toBe("Something broke");
		expect(parsed.hint).toBe("try running foo");
		expect(parsed.upstream).toEqual({ code: 42 });
	});

	it("omits hint field in JSON when not provided", () => {
		printError("Something broke", { json: true });
		const parsed = JSON.parse(captured[0]);
		expect(parsed.error).toBe("Something broke");
		expect(parsed.hint).toBeUndefined();
	});
});

describe("reportErrorAndExit", () => {
	const originalError = console.error;
	const originalExit = process.exit;
	const originalNoColor = process.env.NO_COLOR;
	let captured: string[];

	// Since process.exit is typed `never`, we throw a sentinel that tests can catch.
	class ExitCalled extends Error {
		constructor(public code: number) {
			super(`EXIT:${code}`);
		}
	}

	beforeEach(() => {
		process.env.NO_COLOR = "1";
		captured = [];
		console.error = (msg?: unknown) => {
			captured.push(typeof msg === "string" ? msg : String(msg));
		};
		process.exit = ((code?: number) => {
			throw new ExitCalled(code ?? 0);
		}) as typeof process.exit;
	});

	afterEach(() => {
		console.error = originalError;
		process.exit = originalExit;
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	it("exits 3 for network-level TrongridError (status 0)", () => {
		const networkErr = new TrongridError("Cannot reach TronGrid API at X", 0, {
			cause: "fetch failed",
		});
		expect(() => reportErrorAndExit(networkErr, {})).toThrow("EXIT:3");
		// Auto-default hint fired for network error
		const hintLine = captured.find((l) => l.includes("Hint:"));
		expect(hintLine).toContain("internet connection");
	});

	it("exits 3 for 401 TrongridError with auth-specific default hint", () => {
		const authErr = new TrongridError("Unauthorized", 401);
		expect(() => reportErrorAndExit(authErr, {})).toThrow("EXIT:3");
		const hintLine = captured.find((l) => l.includes("Hint:"));
		expect(hintLine).toContain("auth login");
	});

	it("exits 1 for general Error", () => {
		expect(() => reportErrorAndExit(new Error("Something went wrong"), {})).toThrow("EXIT:1");
	});

	it("caller-supplied hint overrides default hint", () => {
		const networkErr = new TrongridError("Cannot reach TronGrid API at X", 0);
		expect(() =>
			reportErrorAndExit(networkErr, { hint: "explicit caller hint takes priority" }),
		).toThrow("EXIT:3");
		const hintLine = captured.find((l) => l.includes("Hint:"));
		expect(hintLine).toContain("explicit caller hint takes priority");
		expect(hintLine).not.toContain("internet connection");
	});

	it("emits structured JSON error shape when json=true", () => {
		const networkErr = new TrongridError("Cannot reach TronGrid API at X", 0, {
			detail: "ECONNREFUSED",
		});
		expect(() => reportErrorAndExit(networkErr, { json: true })).toThrow("EXIT:3");
		const parsed = JSON.parse(captured[0]);
		expect(parsed.error).toContain("Cannot reach TronGrid API");
		expect(parsed.hint).toContain("internet connection");
		expect(parsed.upstream).toEqual({ detail: "ECONNREFUSED" });
	});
});
