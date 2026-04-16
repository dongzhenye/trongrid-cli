import { describe, expect, it } from "bun:test";
import { printResult } from "../../src/output/format.js";

describe("printResult human mode --fields filtering", () => {
	const sample = { address: "TR7NHqj", balance: 100, type: "EOA" };
	const pairs: [string, string, string][] = [
		["address", "Address", sample.address],
		["balance", "Balance", String(sample.balance)],
		["type", "Type", sample.type],
	];

	it("prints all pairs when no fields filter", () => {
		const out: string[] = [];
		const origLog = console.log;
		console.log = (msg: string) => out.push(msg);
		try {
			printResult(sample, pairs, { json: false });
		} finally {
			console.log = origLog;
		}
		expect(out[0]).toContain("Address");
		expect(out[0]).toContain("Balance");
		expect(out[0]).toContain("Type");
	});

	it("filters human output by field key", () => {
		const out: string[] = [];
		const origLog = console.log;
		console.log = (msg: string) => out.push(msg);
		try {
			printResult(sample, pairs, { json: false, fields: ["address", "type"] });
		} finally {
			console.log = origLog;
		}
		expect(out[0]).toContain("Address");
		expect(out[0]).toContain("Type");
		expect(out[0]).not.toContain("Balance");
	});

	it("ignores unknown field keys without crashing", () => {
		const out: string[] = [];
		const origLog = console.log;
		console.log = (msg: string) => out.push(msg);
		try {
			printResult(sample, pairs, { json: false, fields: ["address", "nonexistent"] });
		} finally {
			console.log = origLog;
		}
		expect(out[0]).toContain("Address");
		expect(out[0]).not.toContain("Balance");
	});

	it("JSON mode still filters by field", () => {
		const out: string[] = [];
		const origLog = console.log;
		console.log = (msg: string) => out.push(msg);
		try {
			printResult(sample, pairs, { json: true, fields: ["address"] });
		} finally {
			console.log = origLog;
		}
		expect(out[0]).toContain('"address"');
		expect(out[0]).not.toContain('"balance"');
	});
});
