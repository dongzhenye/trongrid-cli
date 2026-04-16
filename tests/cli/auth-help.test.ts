import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";

describe("trongrid auth --help", () => {
	const out = execSync("node dist/index.js auth --help", { encoding: "utf-8" });

	it("shows Credentials: and Read commands: headers", () => {
		expect(out).toContain("Credentials:");
		expect(out).toContain("Read commands:");
	});

	it("places login and logout under Credentials:", () => {
		const credentialsIdx = out.indexOf("Credentials:");
		const readIdx = out.indexOf("Read commands:");
		const loginIdx = out.indexOf("login");
		const logoutIdx = out.indexOf("logout");

		expect(credentialsIdx).toBeGreaterThanOrEqual(0);
		expect(loginIdx).toBeGreaterThan(credentialsIdx);
		expect(loginIdx).toBeLessThan(readIdx);
		expect(logoutIdx).toBeGreaterThan(credentialsIdx);
		expect(logoutIdx).toBeLessThan(readIdx);
	});

	it("places status under Read commands:", () => {
		const readIdx = out.indexOf("Read commands:");
		const statusIdx = out.indexOf("status");
		expect(readIdx).toBeGreaterThanOrEqual(0);
		expect(statusIdx).toBeGreaterThan(readIdx);
	});

	it("orders Credentials: before Read commands:", () => {
		const credentialsIdx = out.indexOf("Credentials:");
		const readIdx = out.indexOf("Read commands:");
		expect(credentialsIdx).toBeLessThan(readIdx);
	});
});
