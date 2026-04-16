import { describe, expect, it } from "bun:test";
import { registerContractDelegationsCommand } from "../../src/commands/contract/delegations.js";
import { registerContractResourcesCommand } from "../../src/commands/contract/resources.js";
import { registerContractTokensCommand } from "../../src/commands/contract/tokens.js";
import { registerContractTransfersCommand } from "../../src/commands/contract/transfers.js";

describe("contract mirror commands — import smoke", () => {
	it("exports registerContractTransfersCommand", () => {
		expect(typeof registerContractTransfersCommand).toBe("function");
	});

	it("exports registerContractTokensCommand", () => {
		expect(typeof registerContractTokensCommand).toBe("function");
	});

	it("exports registerContractResourcesCommand", () => {
		expect(typeof registerContractResourcesCommand).toBe("function");
	});

	it("exports registerContractDelegationsCommand", () => {
		expect(typeof registerContractDelegationsCommand).toBe("function");
	});
});
