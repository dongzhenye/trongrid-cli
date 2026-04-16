import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { accent, command, fail, id, muted, pass, warn } from "../../src/output/colors.js";

// Hand-written ANSI escape patterns so the tests are not coupled to the
// exact codes node:util / Bun emit. We assert the prefix `\x1b[` is or is
// not present; that's enough to verify the strip-vs-emit branch.
const ANSI = /\x1b\[/;

describe("color tokens — color suppression", () => {
	const originalNoColor = process.env.NO_COLOR;
	const originalIsTTY = process.stdout.isTTY;

	beforeEach(() => {
		// Default test state: TTY present, NO_COLOR not set → colors emitted.
		delete process.env.NO_COLOR;
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
	});

	afterEach(() => {
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
		Object.defineProperty(process.stdout, "isTTY", { value: originalIsTTY, configurable: true });
	});

	it("emits ANSI when TTY and NO_COLOR not set", () => {
		expect(muted("hello")).toMatch(ANSI);
		expect(accent("hello")).toMatch(ANSI);
		expect(fail("hello")).toMatch(ANSI);
	});

	it("strips ANSI when NO_COLOR is set (any non-empty value)", () => {
		process.env.NO_COLOR = "1";
		expect(muted("hello")).toBe("hello");
		expect(accent("hello")).toBe("hello");
		expect(command("hello")).toBe("hello");
		expect(pass("hello")).toBe("hello");
		expect(warn("hello")).toBe("hello");
		expect(fail("hello")).toBe("hello");
		expect(id("hello")).toBe("hello");
	});

	it("strips ANSI when stdout is not a TTY (piped: isTTY === false)", () => {
		Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true });
		expect(muted("hello")).toBe("hello");
		expect(accent("hello")).toBe("hello");
	});

	it("strips ANSI when stdout is not a TTY (piped: isTTY === undefined)", () => {
		// In Node and Bun, `process.stdout.isTTY` is `undefined` (not `false`)
		// when stdout is redirected to a file or piped. Both must strip.
		Object.defineProperty(process.stdout, "isTTY", { value: undefined, configurable: true });
		expect(muted("hello")).toBe("hello");
		expect(accent("hello")).toBe("hello");
	});

	it("treats NO_COLOR='' as not set (per no-color.org convention)", () => {
		process.env.NO_COLOR = "";
		expect(muted("hello")).toMatch(ANSI);
	});

	it("NO_COLOR wins over TTY", () => {
		// Even with a TTY, NO_COLOR must suppress.
		process.env.NO_COLOR = "1";
		Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true });
		expect(muted("hello")).toBe("hello");
	});
});
