import type { Command } from "commander";
import { accountTransfersAction } from "../account/transfers.js";

export function registerContractTransfersCommand(contract: Command, parent: Command): void {
	contract
		.command("transfers")
		.description("List TRC-10/20 token transfers for a contract address")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.addHelpText("after", "\nEquivalent to: trongrid account transfers <address>\n")
		.action(async (address: string) => {
			await accountTransfersAction(address, parent);
		});
}
