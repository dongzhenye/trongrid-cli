#!/usr/bin/env node

import { styleText } from "node:util";
import { Command } from "commander";
import { type ApiClient, createClient } from "./api/client.js";
import { resolveApiKey } from "./auth/store.js";
import { readConfig } from "./utils/config.js";

const program = new Command();

program
	.name("trongrid")
	.description("CLI for TronGrid — query TRON blockchain from terminal or AI agent")
	.version("0.1.0")
	.option("-j, --json", "output as JSON", false)
	.option("-n, --network <network>", "network: mainnet, shasta, nile", "mainnet")
	.option("--no-color", "disable colored output")
	.option("-v, --verbose", "show upstream API details in errors", false)
	.option("-l, --limit <number>", "max items for list commands", "20")
	.option("-f, --fields <fields>", "select output fields (JSON mode)");

export interface GlobalOptions {
	json: boolean;
	network: string;
	verbose: boolean;
	limit: string;
	fields?: string;
}

export function getClient(opts: GlobalOptions): ApiClient {
	const config = readConfig();
	const network = opts.network ?? config.network ?? "mainnet";
	const apiKey = resolveApiKey();
	return createClient({ network, apiKey });
}

export function parseFields(opts: GlobalOptions): string[] | undefined {
	if (!opts.fields) return undefined;
	return opts.fields.split(",").map((f) => f.trim());
}

export { program };

import { registerAccountResourcesCommand } from "./commands/account/resources.js";
import { registerAccountTokensCommand } from "./commands/account/tokens.js";
import { registerAccountCommands } from "./commands/account/view.js";
import { registerAuthCommands } from "./commands/auth/login.js";
// Import commands (added as tasks implement them)
import { registerBlockCommands } from "./commands/block/latest.js";
import { registerConfigCommands } from "./commands/config/set.js";
import { registerTxCommands } from "./commands/tx/view.js";

registerBlockCommands(program);
const account = registerAccountCommands(program);
registerAccountTokensCommand(account, program);
registerAccountResourcesCommand(account, program);
registerTxCommands(program);
registerAuthCommands(program);
registerConfigCommands(program);

program.hook("preAction", () => {
	if (!resolveApiKey()) {
		console.error(styleText("dim", 'Tip: Run "trongrid auth login" for 5x faster rate limits.\n'));
	}
});

program.parse();
