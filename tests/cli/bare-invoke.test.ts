import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";

describe("trongrid bare invoke", () => {
	it("prints full help when invoked with no arguments", () => {
		const out = execSync("node dist/index.js", { encoding: "utf-8" });
		expect(out).toContain("Read commands:");
		expect(out).toContain("account");
		expect(out).toContain("block");
	});

	it("bare output is equivalent to --help output", () => {
		const bare = execSync("node dist/index.js", { encoding: "utf-8" });
		const helpFlag = execSync("node dist/index.js --help", { encoding: "utf-8" });
		expect(bare.trim()).toBe(helpFlag.trim());
	});
});
