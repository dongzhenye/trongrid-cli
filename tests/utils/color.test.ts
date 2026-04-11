import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { applyNoColorFromOptions } from "../../src/utils/color.js";

describe("applyNoColorFromOptions", () => {
	const originalNoColor = process.env.NO_COLOR;

	beforeEach(() => {
		delete process.env.NO_COLOR;
	});

	afterEach(() => {
		if (originalNoColor !== undefined) {
			process.env.NO_COLOR = originalNoColor;
		} else {
			delete process.env.NO_COLOR;
		}
	});

	it("sets NO_COLOR=1 when color is false", () => {
		applyNoColorFromOptions({ color: false });
		expect(process.env.NO_COLOR).toBe("1");
	});

	it("does not touch NO_COLOR when color is true (default)", () => {
		applyNoColorFromOptions({ color: true });
		expect(process.env.NO_COLOR).toBeUndefined();
	});

	it("does not touch NO_COLOR when color is omitted", () => {
		applyNoColorFromOptions({});
		expect(process.env.NO_COLOR).toBeUndefined();
	});
});
