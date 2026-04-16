import type { Command } from "commander";
import { accountTokensAction } from "../account/tokens.js";

export function registerContractTokensCommand(contract: Command, parent: Command): void {
	contract
		.command("tokens")
		.description("List TRC20 and TRC10 token balances held by a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.addHelpText("after", "\nEquivalent to: trongrid account tokens <address>\n")
		.action(async (address: string) => {
			await accountTokensAction(address, parent);
		});
}
