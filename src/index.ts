#!/usr/bin/env node

import { Command } from "commander";
import { readConfig } from "./utils/config.js";
import { resolveApiKey } from "./auth/store.js";
import { createClient, type ApiClient } from "./api/client.js";

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

// Import commands (added as tasks implement them)
import { registerBlockCommands } from "./commands/block/latest.js";
import { registerAccountCommands } from "./commands/account/view.js";
import { registerAccountTokensCommand } from "./commands/account/tokens.js";
import { registerAccountResourcesCommand } from "./commands/account/resources.js";
import { registerTxCommands } from "./commands/tx/view.js";
import { registerAuthCommands } from "./commands/auth/login.js";
import { registerConfigCommands } from "./commands/config/set.js";

registerBlockCommands(program);
const account = registerAccountCommands(program);
registerAccountTokensCommand(account, program);
registerAccountResourcesCommand(account, program);
registerTxCommands(program);
registerAuthCommands(program);
registerConfigCommands(program);

program.parse();
