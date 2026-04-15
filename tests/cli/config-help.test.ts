import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";

describe("trongrid config --help", () => {
	const out = execSync("node dist/index.js config --help", { encoding: "utf-8" });

	it("shows Write commands: and Read commands: headers", () => {
		expect(out).toContain("Write commands:");
		expect(out).toContain("Read commands:");
	});

	it("places set under Write commands:", () => {
		const writeIdx = out.indexOf("Write commands:");
		const readIdx = out.indexOf("Read commands:");
		const setIdx = out.indexOf("set <key>");

		expect(writeIdx).toBeGreaterThanOrEqual(0);
		expect(setIdx).toBeGreaterThan(writeIdx);
		expect(setIdx).toBeLessThan(readIdx);
	});

	it("places get and list under Read commands:", () => {
		const readIdx = out.indexOf("Read commands:");
		const getIdx = out.indexOf("get <key>");
		const listIdx = out.indexOf("\n  list");

		expect(readIdx).toBeGreaterThanOrEqual(0);
		expect(getIdx).toBeGreaterThan(readIdx);
		expect(listIdx).toBeGreaterThan(readIdx);
	});

	it("orders Write commands: before Read commands:", () => {
		const writeIdx = out.indexOf("Write commands:");
		const readIdx = out.indexOf("Read commands:");
		expect(writeIdx).toBeLessThan(readIdx);
	});
});
