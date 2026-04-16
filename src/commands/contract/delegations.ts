import type { Command } from "commander";
import { accountDelegationsAction } from "../account/delegations.js";

export function registerContractDelegationsCommand(contract: Command, parent: Command): void {
	contract
		.command("delegations")
		.description("List Stake 2.0 resource delegations for a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.addHelpText("after", "\nEquivalent to: trongrid account delegations <address>\n")
		.action(async (address: string) => {
			await accountDelegationsAction(address, parent);
		});
}
