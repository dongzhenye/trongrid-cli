#!/usr/bin/env node

import { Command } from "commander";
import { type ApiClient, createClient } from "./api/client.js";
import { resolveApiKey } from "./auth/store.js";
import { muted } from "./output/colors.js";
import { applyNoColorFromOptions } from "./utils/color.js";
import { readConfig } from "./utils/config.js";

const program = new Command();

program
	.name("trongrid")
	.description("CLI for TronGrid — query TRON blockchain from terminal or AI agent")
	.version("0.1.0")
	.option("-j, --json", "output as JSON", false)
	.option("-n, --network <network>", "network: mainnet, shasta, nile", "mainnet")
	.option("--api-key <key>", "TronGrid API key (highest priority; overrides env + config)")
	.option("--no-color", "disable colored output")
	.option("-v, --verbose", "show upstream API details in errors", false)
	.option("-l, --limit <number>", "max items for list commands", "20")
	.option("-f, --fields <fields>", "select output fields (JSON mode)")
	.option("--confirmed", "read confirmed (irreversible, ~60s lag) state instead of latest", false)
	// Deterministic exit code scheme (see docs/design/cli-best-practices.md §4):
	//   0 — success (help / version display included)
	//   1 — general / unexpected error (thrown by TrongridError with non-auth status)
	//   2 — usage error (unknown flag / subcommand / missing argument)
	//   3 — network or auth failure (TrongridError with status 0 / 401 / 403)
	// This override maps commander's own parse errors to exit code 2.
	.exitOverride((err) => {
		const code = err.code ?? "";
		if (code === "commander.helpDisplayed" || code === "commander.version") {
			process.exit(0);
		}
		process.exit(2);
	});

export interface GlobalOptions {
	json: boolean;
	network: string;
	apiKey?: string;
	color: boolean;
	verbose: boolean;
	limit: string;
	fields?: string;
	confirmed: boolean;
}

export function getClient(opts: GlobalOptions): ApiClient {
	const config = readConfig();
	const network = opts.network ?? config.network ?? "mainnet";
	const apiKey = resolveApiKey({ inlineKey: opts.apiKey });
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
import { registerBlockViewCommand } from "./commands/block/view.js";
import { registerConfigCommands } from "./commands/config/set.js";
import { registerTxCommands } from "./commands/tx/view.js";

const block = registerBlockCommands(program);
registerBlockViewCommand(block, program);
const account = registerAccountCommands(program);
registerAccountTokensCommand(account, program);
registerAccountResourcesCommand(account, program);
registerTxCommands(program);
registerAuthCommands(program);
registerConfigCommands(program);

program.hook("preAction", (thisCommand) => {
	const rootOpts = program.opts<GlobalOptions>();
	applyNoColorFromOptions(rootOpts);
	const name = thisCommand.parent?.name() ?? thisCommand.name();
	if (name === "auth" || name === "config") return;
	if (!resolveApiKey({ inlineKey: rootOpts.apiKey })) {
		console.error(muted('Tip: Run "trongrid auth login" for 5x faster rate limits.\n'));
	}
});

program.parse();
