import { describe, expect, it } from "bun:test";
import { Command } from "commander";

describe("global --confirmed flag", () => {
	it("parses --confirmed into opts.confirmed", () => {
		const program = new Command();
		program.option("--confirmed", "read confirmed (irreversible) chain state", false);
		program.parse(["node", "cli", "--confirmed"], { from: "node" });
		expect(program.opts().confirmed).toBe(true);
	});

	it("defaults confirmed to false", () => {
		const program = new Command();
		program.option("--confirmed", "read confirmed (irreversible) chain state", false);
		program.parse(["node", "cli"], { from: "node" });
		expect(program.opts().confirmed).toBe(false);
	});
});
