import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";

describe("trongrid account --help", () => {
	const out = execSync("node dist/index.js account --help", { encoding: "utf-8" });

	it("shows Read commands: header for all leaves", () => {
		expect(out).toContain("Read commands:");
	});

	it("lists all seven read leaves under Read commands:", () => {
		const readIdx = out.indexOf("Read commands:");
		expect(readIdx).toBeGreaterThanOrEqual(0);
		for (const name of [
			"view",
			"resources",
			"tokens",
			"txs",
			"transfers",
			"delegations",
			"permissions",
		]) {
			const leafIdx = out.indexOf(`\n  ${name}`);
			expect(leafIdx).toBeGreaterThan(readIdx);
		}
	});
});
