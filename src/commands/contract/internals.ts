import type { Command } from "commander";
import { fetchInternalTxs, renderInternalTxs, sortInternalTxs } from "../../api/internal-txs.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import { parseTimeRange } from "../../utils/time-range.js";

export function registerContractInternalsCommand(contract: Command, parent: Command): void {
	contract
		.command("internals")
		.description("List internal transactions for a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid contract internals TR7N...
  $ trongrid contract internals TR7N... --limit 50
  $ trongrid contract internals TR7N... --after 2026-04-01
  $ trongrid contract internals TR7N... --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value, call_type
`,
		)
		.action(async (address: string) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);
				const client = getClient(opts);
				const range = parseTimeRange(opts.before, opts.after);
				const limit = Number.parseInt(opts.limit, 10);
				const { rows } = await fetchInternalTxs(client, address, {
					limit,
					minTimestamp: range.minTimestamp,
					maxTimestamp: range.maxTimestamp,
				});
				const sorted = sortInternalTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });
				// No truncation hint: see note in account/internals.ts — the
				// over-fetch + client-slice heuristic's rawCount is unreliable.
				printListResult(sorted, renderInternalTxs, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, { json: opts.json, verbose: opts.verbose });
			}
		});
}
