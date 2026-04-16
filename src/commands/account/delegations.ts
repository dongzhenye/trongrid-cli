import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
	alignNumber,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
	visibleLength,
} from "../../output/columns.js";
import {
	formatTimestamp,
	printListResult,
	reportErrorAndExit,
	sunToTrx,
} from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";

/**
 * Stake 2.0 delegation row. Unit shape per docs/designs/units.md S1
 * (TRX quantity): amount + amount_unit: "sun" + decimals: 6 + amount_trx.
 *
 * `direction` discriminates incoming vs outgoing delegations. Flattened
 * to a single Row[] per memory feedback_transfer_list_two_styles — a
 * centered-style list with direction field, sortable across both
 * directions by amount desc. Human render groups into two sections
 * (out / in) with empty-section suppression; JSON stays a flat array.
 */
export interface DelegationRow {
	direction: "out" | "in";
	from: string;
	to: string;
	resource: "ENERGY" | "BANDWIDTH";
	amount: number;
	amount_unit: "sun";
	decimals: 6;
	amount_trx: string;
	expire_time: number;
	expire_time_iso: string;
	lock: boolean;
}

interface IndexV2Response {
	toAccounts?: string[];
	fromAccounts?: string[];
}

interface DelegatedResourceV2Response {
	delegatedResource?: Array<{
		from?: string;
		to?: string;
		frozen_balance_for_bandwidth?: number;
		frozen_balance_for_energy?: number;
		expire_time_for_bandwidth?: number;
		expire_time_for_energy?: number;
	}>;
}

export async function fetchAccountDelegations(
	client: ApiClient,
	address: string,
): Promise<DelegationRow[]> {
	const index = await client.post<IndexV2Response>("/wallet/getdelegatedresourceaccountindexv2", {
		value: address,
		visible: true,
	});

	const outPairs = (index.toAccounts ?? []).map((to) => ({ from: address, to }));
	const inPairs = (index.fromAccounts ?? []).map((from) => ({ from, to: address }));
	const allPairs = [...outPairs, ...inPairs];

	const results = await Promise.all(
		allPairs.map(async (pair) => {
			const detail = await client.post<DelegatedResourceV2Response>(
				"/wallet/getdelegatedresourcev2",
				{ fromAddress: pair.from, toAddress: pair.to, visible: true },
			);
			return { pair, detail };
		}),
	);

	const rows: DelegationRow[] = [];
	for (const { pair, detail } of results) {
		const isOut = pair.from === address;
		for (const d of detail.delegatedResource ?? []) {
			if (d.frozen_balance_for_bandwidth && d.frozen_balance_for_bandwidth > 0) {
				rows.push(
					makeRow(
						pair,
						"BANDWIDTH",
						d.frozen_balance_for_bandwidth,
						d.expire_time_for_bandwidth ?? 0,
						isOut,
					),
				);
			}
			if (d.frozen_balance_for_energy && d.frozen_balance_for_energy > 0) {
				rows.push(
					makeRow(
						pair,
						"ENERGY",
						d.frozen_balance_for_energy,
						d.expire_time_for_energy ?? 0,
						isOut,
					),
				);
			}
		}
	}
	return rows;
}

function makeRow(
	pair: { from: string; to: string },
	resource: "BANDWIDTH" | "ENERGY",
	frozen: number,
	expireMs: number,
	isOut: boolean,
): DelegationRow {
	const expireSec = Math.floor(expireMs / 1000);
	const now = Math.floor(Date.now() / 1000);
	return {
		direction: isOut ? "out" : "in",
		from: pair.from,
		to: pair.to,
		resource,
		amount: frozen,
		amount_unit: "sun",
		decimals: 6,
		amount_trx: sunToTrx(frozen),
		expire_time: expireSec,
		expire_time_iso: new Date(expireMs).toISOString(),
		lock: expireSec > now,
	};
}

const DELEGATIONS_SORT_CONFIG: SortConfig<DelegationRow> = {
	defaultField: "amount",
	fieldDirections: {
		amount: "desc",
		expire_time: "asc",
	},
	tieBreakField: "expire_time",
};

/**
 * Thin wrapper over {@link applySort} + {@link DELEGATIONS_SORT_CONFIG}.
 * Exported so tests can exercise the sort config (default field, tie-break,
 * unknown-field UsageError) without going through commander.
 */
export function sortDelegations(items: DelegationRow[], opts: SortOptions): DelegationRow[] {
	return applySort(items, DELEGATIONS_SORT_CONFIG, opts);
}

export function renderDelegations(rows: DelegationRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No delegations found."));
		return;
	}
	const out = rows.filter((r) => r.direction === "out");
	const inc = rows.filter((r) => r.direction === "in");
	if (out.length > 0) renderSection("Delegated out", out);
	if (out.length > 0 && inc.length > 0) console.log("");
	if (inc.length > 0) renderSection("Delegated in", inc);
}

function renderSection(label: string, rows: DelegationRow[]): void {
	console.log(muted(`${label} (${rows.length}):`));
	const cells: string[][] = rows.map((r) => [
		r.amount_trx,
		"TRX",
		r.resource,
		r.direction === "out" ? "→" : "←",
		truncateAddress(r.direction === "out" ? r.to : r.from),
		`expires ${formatTimestamp(r.expire_time * 1000)}`,
		r.lock ? muted("(locked)") : "",
	]);

	const amountCol = 0;
	const amountWidth = Math.max(...cells.map((c) => visibleLength(c[amountCol] ?? "")));
	for (const row of cells) {
		const cur = row[amountCol] ?? "";
		row[amountCol] = alignNumber(cur, amountWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

export async function accountDelegationsAction(
	address: string | undefined,
	parent: Command,
): Promise<void> {
	const { getClient, parseFields } = await import("../../index.js");
	const opts = parent.opts<GlobalOptions>();
	try {
		const resolved = resolveAddress(address);
		const client = getClient(opts);
		const rows = await fetchAccountDelegations(client, resolved);
		const sorted = sortDelegations(rows, {
			sortBy: opts.sortBy,
			reverse: opts.reverse,
		});
		printListResult(sorted, renderDelegations, {
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
}

export function registerAccountDelegationsCommand(account: Command, parent: Command): void {
	account
		.command("delegations")
		.description("List Stake 2.0 resource delegations (out + in)")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account delegations TR...
  $ trongrid account delegations                    # uses default_address
  $ trongrid account delegations TR... --sort-by expire_time
  $ trongrid account delegations TR... --json

Sort:
  default — amount desc (largest position first)
  fields  — amount, expire_time
`,
		)
		.action(async (address: string | undefined) => {
			await accountDelegationsAction(address, parent);
		});
}
