import type { Command } from "commander";
import { fetchInternalTxs, renderInternalTxs, sortInternalTxs } from "../../api/internal-txs.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { parseTimeRange } from "../../utils/time-range.js";

export function registerAccountInternalsCommand(account: Command, parent: Command): void {
	account
		.command("internals")
		.description("List internal transactions for an address")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account internals TR7N...
  $ trongrid account internals                    # uses default_address
  $ trongrid account internals TR7N... --limit 50
  $ trongrid account internals TR7N... --after 2026-04-01
  $ trongrid account internals TR7N... --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value, call_type
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const range = parseTimeRange(opts.before, opts.after);
				const rows = await fetchInternalTxs(client, resolved, {
					limit: Number.parseInt(opts.limit, 10),
					minTimestamp: range.minTimestamp,
					maxTimestamp: range.maxTimestamp,
				});
				const sorted = sortInternalTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });
				printListResult(sorted, renderInternalTxs, { json: opts.json, fields: parseFields(opts) });
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: addressErrorHint(err),
				});
			}
		});
}
