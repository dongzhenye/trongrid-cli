import { describe, expect, it } from "bun:test";
import { registerContractInternalsCommand } from "../../src/commands/contract/internals.js";

describe("contract internals command", () => {
	it("exports registerContractInternalsCommand as a function", () => {
		expect(typeof registerContractInternalsCommand).toBe("function");
	});

	it("re-exports shared internal-txs API functions via the module graph", async () => {
		const mod = await import("../../src/api/internal-txs.js");
		expect(typeof mod.fetchInternalTxs).toBe("function");
		expect(typeof mod.sortInternalTxs).toBe("function");
		expect(typeof mod.renderInternalTxs).toBe("function");
	});
});
