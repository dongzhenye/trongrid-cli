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

describe("global sort flags", () => {
	it("parses --reverse / -r", () => {
		const program = new Command();
		program.option("-r, --reverse", "reverse default sort", false);
		program.parse(["node", "cli", "-r"], { from: "node" });
		expect(program.opts().reverse).toBe(true);
	});

	it("parses --sort-by <field>", () => {
		const program = new Command();
		program.option("--sort-by <field>", "override sort field");
		program.parse(["node", "cli", "--sort-by", "fee"], { from: "node" });
		expect(program.opts().sortBy).toBe("fee");
	});
});
