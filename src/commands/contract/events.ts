import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";
import { formatTimestamp, printListResult, reportErrorAndExit } from "../../output/format.js";
import { hexToBase58, validateAddress } from "../../utils/address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";
import { parseTimeRange } from "../../utils/time-range.js";

// --- Public types ---

export interface ContractEventRow {
	event_name: string;
	transaction_id: string;
	block_number: number;
	block_timestamp: number; // unix ms
	params: Record<string, string>; // decoded event parameters
}

// --- Raw response shape ---

interface RawEvent {
	event_name?: string;
	transaction_id?: string;
	block_number?: number;
	block_timestamp?: number;
	result?: Record<string, string>;
}

interface ContractEventsResponse {
	data?: RawEvent[];
}

// --- Helpers ---

/**
 * Convert hex address params to TRON Base58. Non-address values pass through.
 *
 * An EVM hex address is exactly 40 hex chars, with or without 0x prefix.
 */
function convertParams(result: Record<string, string>): Record<string, string> {
	const converted: Record<string, string> = {};
	for (const [key, value] of Object.entries(result)) {
		if (typeof value === "string" && /^(0x)?[0-9a-fA-F]{40}$/.test(value)) {
			try {
				converted[key] = hexToBase58(value);
				continue;
			} catch {
				/* not an address — keep original */
			}
		}
		converted[key] = String(value);
	}
	return converted;
}

// --- Core fetch ---

export async function fetchContractEvents(
	client: ApiClient,
	address: string,
	opts: {
		limit: number;
		eventFilter?: string;
		minBlockTimestamp?: number;
		maxBlockTimestamp?: number;
		onlyConfirmed?: boolean;
	},
): Promise<ContractEventRow[]> {
	validateAddress(address);

	const params = new URLSearchParams();
	params.set("order_by", "block_timestamp,desc");
	params.set("limit", String(opts.limit));
	if (opts.minBlockTimestamp !== undefined) {
		params.set("min_block_timestamp", String(opts.minBlockTimestamp));
	}
	if (opts.maxBlockTimestamp !== undefined) {
		params.set("max_block_timestamp", String(opts.maxBlockTimestamp));
	}
	if (opts.onlyConfirmed) {
		params.set("only_confirmed", "true");
	}

	// Don't pass event_name to API — filter client-side for case-insensitivity
	const path = `/v1/contracts/${address}/events?${params.toString()}`;
	const raw = await client.get<ContractEventsResponse>(path);

	let events = (raw.data ?? []).map((e) => ({
		event_name: e.event_name ?? "",
		transaction_id: e.transaction_id ?? "",
		block_number: e.block_number ?? 0,
		block_timestamp: e.block_timestamp ?? 0,
		params: convertParams(e.result ?? {}),
	}));

	// Client-side case-insensitive event name filter
	if (opts.eventFilter) {
		const filter = opts.eventFilter.toLowerCase();
		events = events.filter((e) => e.event_name.toLowerCase() === filter);
	}

	return events;
}

// --- Sort ---

const EVENTS_SORT_CONFIG: SortConfig<ContractEventRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		event_name: "asc",
	},
	fieldTypes: {
		block_timestamp: "number",
		// event_name omitted — defaults to "string" (intended)
	},
	tieBreakField: "block_timestamp",
};

export function sortContractEvents(
	items: ContractEventRow[],
	opts: SortOptions,
): ContractEventRow[] {
	return applySort(items, EVENTS_SORT_CONFIG, opts);
}

// --- Human-mode renderer ---

function formatParams(params: Record<string, string>): string {
	const entries = Object.entries(params);
	if (entries.length === 0) return "";
	return entries
		.map(([k, v]) => {
			const display = v.length > 20 ? truncateAddress(v, 6, 6) : v;
			return `${k}=${display}`;
		})
		.join(" ");
}

function renderContractEvents(rows: ContractEventRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No events found."));
		return;
	}
	const noun = rows.length === 1 ? "event" : "events";
	console.log(muted(`Found ${rows.length} ${noun}:\n`));

	const header = ["Time", "Event", "TX", "Params"];
	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.block_timestamp),
		r.event_name,
		truncateAddress(r.transaction_id, 4, 4),
		formatParams(r.params),
	]);

	const allRows = [header, ...cells];
	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

// --- Command registration ---

export function registerContractEventsCommand(contract: Command, parent: Command): void {
	contract
		.command("events")
		.description("List event logs emitted by a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.option("--event <name>", "filter by event name (case-insensitive)")
		.option("--confirmed", "only return confirmed events")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --event Transfer
  $ trongrid contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --event approval
  $ trongrid contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --after 2026-04-01
  $ trongrid contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, event_name
`,
		)
		.action(async (address: string, localOpts: { event?: string; confirmed?: boolean }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);
				const client = getClient(opts);
				const range = parseTimeRange(opts.before, opts.after);
				const limit = Number.parseInt(opts.limit, 10);
				const rows = await fetchContractEvents(client, address, {
					limit,
					eventFilter: localOpts.event,
					minBlockTimestamp: range.minTimestamp,
					maxBlockTimestamp: range.maxTimestamp,
					onlyConfirmed: localOpts.confirmed ?? opts.confirmed,
				});

				const sorted = sortContractEvents(rows, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});

				printListResult(sorted, renderContractEvents, {
					json: opts.json,
					fields: parseFields(opts),
					limit,
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
				});
			}
		});
}
