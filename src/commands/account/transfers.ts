import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { type CenteredTransferRow, renderCenteredTransferList } from "../../output/transfers.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig } from "../../utils/sort.js";

/**
 * Unit shape per docs/design/units.md S2 (TRC-10/20 scalable quantity).
 * Includes `direction: "out" | "in"` — this is a **centered** transfer
 * list (per memory feedback_transfer_list_two_styles); the direction is
 * computed at fetch time against the queried subject address so agents
 * don't have to compare.
 */
export interface AccountTransferRow extends CenteredTransferRow {}

// Raw response shapes (RawTransfer, AccountTransfersResponse) land in M1.2
// alongside the real parse implementation.

export async function fetchAccountTransfers(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<AccountTransferRow[]> {
	// Stub for M1.1; real implementation in M1.2.
	void client;
	void address;
	void opts;
	throw new Error("fetchAccountTransfers: not implemented (M1.1 scaffold)");
}

const TRANSFERS_SORT_CONFIG: SortConfig<AccountTransferRow> = {
	defaultField: "timestamp",
	fieldDirections: {
		timestamp: "desc",
		block_number: "desc",
		amount: "desc",
	},
	tieBreakField: "timestamp",
};

export function registerAccountTransfersCommand(account: Command, parent: Command): void {
	account
		.command("transfers")
		.description("List TRC-10/20 token transfers for an address")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account transfers TR...
  $ trongrid account transfers                            # uses default_address
  $ trongrid account transfers TR... --limit 50
  $ trongrid account transfers TR... --reverse            # oldest first
  $ trongrid account transfers TR... --sort-by amount     # largest transfer first
  $ trongrid account transfers TR... --after 2026-04-01   # since 2026-04-01
  $ trongrid account transfers TR... --before 2026-04-15 --after 2026-04-01

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, amount (all default desc)
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				// NOTE: --confirmed has no effect here —
				// /v1/accounts/:address/transactions/trc20 has no /walletsolidity
				// mirror. Accepted silently for flag uniformity; tracked as a
				// Phase D follow-up.
				const rows = await fetchAccountTransfers(client, resolved, {
					limit: Number.parseInt(opts.limit, 10),
					// minTimestamp / maxTimestamp come from M1.2's parseTimeRange.
				});
				const sorted = applySort(rows, TRANSFERS_SORT_CONFIG, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderCenteredTransferList, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: addressErrorHint(err),
				});
			}
		});
}
