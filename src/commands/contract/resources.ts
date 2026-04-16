import type { Command } from "commander";
import { accountResourcesAction } from "../account/resources.js";

export function registerContractResourcesCommand(contract: Command, parent: Command): void {
	contract
		.command("resources")
		.description("View energy, bandwidth, and staking state for a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.addHelpText("after", "\nEquivalent to: trongrid account resources <address>\n")
		.action(async (address: string) => {
			await accountResourcesAction(address, parent);
		});
}
