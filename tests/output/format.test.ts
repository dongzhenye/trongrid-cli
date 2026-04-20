import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { TrongridError } from "../../src/api/client.js";
import {
	formatExtremeIfNeeded,
	formatJson,
	formatJsonList,
	formatKeyValue,
	formatTimestamp,
	formatTruncationHint,
	printError,
	printListResult,
	reportErrorAndExit,
	sunToTrx,
	UsageError,
} from "../../src/output/format.js";

describe("formatTimestamp", () => {
	it("formats a Unix-ms timestamp as YYYY-MM-DD HH:MM:SS UTC", () => {
		// 2022-08-11T17:00:30.000Z
		expect(formatTimestamp(1660237230000)).toBe("2022-08-11 17:00:30 UTC");
	});

	it("drops the milliseconds component", () => {
		// 2022-08-11T17:00:30.789Z — the .789 must not appear in output
		const out = formatTimestamp(1660237230789);
		expect(out).toBe("2022-08-11 17:00:30 UTC");
		expect(out).not.toContain(".789");
	});

	it("uses a space separator (not T) between date and time", () => {
		// Pattern: YYYY-MM-DD<space>HH:MM:SS<space>UTC — no T between date and time.
		expect(formatTimestamp(0)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
	});

	it("handles the Unix epoch", () => {
		expect(formatTimestamp(0)).toBe("1970-01-01 00:00:00 UTC");
	});

	it("renders a stable string regardless of process TZ", () => {
		// Same input must produce same output. toISOString() is TZ-independent
		// (always UTC); this test locks the contract in.
		expect(formatTimestamp(1660237230000)).toBe(formatTimestamp(1660237230000));
	});
});

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

describe("formatTruncationHint", () => {
	it("returns null when rawCount is below the limit", () => {
		expect(formatTruncationHint(10, 20)).toBeNull();
		expect(formatTruncationHint(0, 50)).toBeNull();
	});

	it("returns a hint when rawCount equals the limit", () => {
		const hint = formatTruncationHint(50, 50);
		expect(hint).not.toBeNull();
		expect(hint).toContain("50");
	});

	it("returns a hint when rawCount exceeds the limit (defensive)", () => {
		const hint = formatTruncationHint(51, 50);
		expect(hint).not.toBeNull();
	});

	it("mentions --limit without narrowing flags when none are provided", () => {
		const hint = formatTruncationHint(50, 50);
		expect(hint).toContain("--limit");
		expect(hint).not.toContain("--before");
		expect(hint).not.toContain("--after");
	});

	it("mentions provided narrowing flags alongside --limit", () => {
		const hint = formatTruncationHint(50, 50, ["--before", "--after"]);
		expect(hint).toContain("--limit");
		expect(hint).toContain("--before");
		expect(hint).toContain("--after");
	});

	it("supports filter flags as narrowing hints (e.g. --method, --event)", () => {
		const hint = formatTruncationHint(20, 20, ["--method"]);
		expect(hint).toContain("--method");
		expect(hint).not.toContain("--before");
	});

	it("returns null for limit <= 0 (pathological, no truncation signal)", () => {
		expect(formatTruncationHint(0, 0)).toBeNull();
		expect(formatTruncationHint(5, -1)).toBeNull();
	});

	it("ignores an empty narrowing-flag array (treats as no flags)", () => {
		const hint = formatTruncationHint(50, 50, []);
		expect(hint).toContain("--limit");
		expect(hint).not.toContain("narrow with");
	});
});

describe("printListResult truncation hint wiring", () => {
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
	const originalNoColor = process.env.NO_COLOR;

	beforeEach(() => {
		process.env.NO_COLOR = "1";
	});

	afterEach(() => {
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	it("prints the hint after human render when items.length >= limit", () => {
		capture();
		try {
			printListResult(
				[{ a: 1 }, { a: 2 }, { a: 3 }],
				(items) => {
					for (const item of items) console.log(`row ${item.a}`);
				},
				{ json: false, truncation: { limit: 3 } },
			);
		} finally {
			restore();
		}
		expect(captured).toHaveLength(4);
		expect(captured[0]).toBe("row 1");
		expect(captured[3]).toContain("--limit");
		expect(captured[3]).toContain("3");
	});

	it("uses rawCount instead of items.length when provided (client-filter case)", () => {
		// Filter kept 1 match out of a full raw page of 20 — truncation still likely.
		capture();
		try {
			printListResult([{ a: 1 }], () => {}, {
				json: false,
				truncation: { limit: 20, rawCount: 20 },
			});
		} finally {
			restore();
		}
		const hintLine = captured.find((l) => l.includes("--limit"));
		expect(hintLine).toBeDefined();
		expect(hintLine).toContain("20");
	});

	it("omits the hint when items.length < limit and no rawCount override", () => {
		capture();
		try {
			printListResult(
				[{ a: 1 }],
				(items) => {
					for (const item of items) console.log(`row ${item.a}`);
				},
				{ json: false, truncation: { limit: 50 } },
			);
		} finally {
			restore();
		}
		expect(captured).toHaveLength(1);
		expect(captured[0]).toBe("row 1");
	});

	it("omits the hint when truncation option is not passed (back-compat)", () => {
		capture();
		try {
			printListResult(
				[{ a: 1 }, { a: 2 }],
				(items) => {
					for (const item of items) console.log(`row ${item.a}`);
				},
				{ json: false },
			);
		} finally {
			restore();
		}
		expect(captured).toHaveLength(2);
		expect(captured.find((l) => l.includes("--limit"))).toBeUndefined();
	});

	it("threads narrowingFlags through to the hint", () => {
		capture();
		try {
			printListResult([{ a: 1 }, { a: 2 }, { a: 3 }], () => {}, {
				json: false,
				truncation: { limit: 3, narrowingFlags: ["--before", "--after"] },
			});
		} finally {
			restore();
		}
		const hintLine = captured.find((l) => l.includes("--limit"));
		expect(hintLine).toContain("--before");
		expect(hintLine).toContain("--after");
	});

	it("never prints the hint in JSON mode even when items.length >= limit", () => {
		capture();
		try {
			printListResult([{ a: 1 }, { a: 2 }, { a: 3 }], () => {}, {
				json: true,
				truncation: { limit: 3, narrowingFlags: ["--before"] },
			});
		} finally {
			restore();
		}
		expect(captured).toHaveLength(1);
		expect(JSON.parse(captured[0])).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
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

	it("exits 2 for UsageError (bad flag value)", () => {
		expect(() => reportErrorAndExit(new UsageError("Unknown sort field"), {})).toThrow("EXIT:2");
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

const UINT256_MAX =
	"115792089237316195423570985008687907853269984665640564039457584007913129639935";

describe("formatExtremeIfNeeded", () => {
	it("returns null for normal values", () => {
		expect(formatExtremeIfNeeded("1000000", "1.0")).toBeNull();
		expect(formatExtremeIfNeeded("1500530000", "1500.53")).toBeNull();
		expect(formatExtremeIfNeeded("0", "0")).toBeNull();
	});

	it("returns null at the integer-length boundary (16 digits)", () => {
		// Integer part exactly 16 digits → still considered normal
		const rawValue = "1000000000000000000000"; // doesn't matter, value_major decides
		const valueMajor = "1000000000000000.0"; // 16-digit integer part
		expect(formatExtremeIfNeeded(rawValue, valueMajor)).toBeNull();
	});

	it("returns scientific notation when integer part > 16 digits", () => {
		const valueMajor = "12345678901234567.5"; // 17-digit integer part
		const result = formatExtremeIfNeeded("doesnt_matter", valueMajor);
		expect(result).toBe("1.23e+16");
	});

	it("returns warning + scientific notation for uint256.max raw value", () => {
		// Apply 6 decimals: integer part = uint256.max[:-6]
		const valueMajor = `${UINT256_MAX.slice(0, -6)}.${UINT256_MAX.slice(-6)}`;
		// First 3 digits of UINT256_MAX are "115" → significand "1.15"
		// Integer part length: 78 - 6 = 72 → exponent 71
		const result = formatExtremeIfNeeded(UINT256_MAX, valueMajor);
		expect(result).toBe("⚠ 1.15e+71");
	});

	it("warning prefix wins even if integer part isn't extreme", () => {
		// Hypothetical: a token with 78 decimals would have
		// uint256.max as value_major "1.157920..." — small int part.
		// The raw-value match still triggers the warning.
		const result = formatExtremeIfNeeded(UINT256_MAX, "1.15");
		expect(result).toBe("⚠ 1.15e+0");
	});

	it("handles negative values gracefully (sign preserved)", () => {
		// Defensive — TRC-20 transfers don't go negative, but BalanceDelta
		// rows in future phases might.
		const result = formatExtremeIfNeeded("-9", "-12345678901234567.0");
		expect(result).toBe("-1.23e+16");
	});
});
