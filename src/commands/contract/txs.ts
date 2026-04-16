import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printListResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";
import { humanTxType } from "../../output/tx-type-map.js";
import { normalizeAbiEntries, parseAbi } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";
import { type AccountTxRow, fetchAccountTxs, renderTxs, sortTxs } from "../account/txs.js";

// --- Raw response shape (extended with data for method filtering) ---

interface RawTxWithData {
	txID?: string;
	blockNumber?: number;
	block_timestamp?: number;
	net_fee?: number;
	energy_fee?: number;
	raw_data?: {
		contract?: Array<{
			type?: string;
			parameter?: {
				value?: {
					owner_address?: string;
					to_address?: string;
					contract_address?: string;
					amount?: number;
					call_value?: number;
					data?: string;
				};
			};
		}>;
	};
	ret?: Array<{ contractRet?: string }>;
}

interface AccountTxsResponse {
	data?: RawTxWithData[];
}

interface RawContractResponse {
	abi?: { entrys?: unknown[] };
}

// --- Helpers ---

const SELECTOR_REGEX = /^0x[0-9a-fA-F]{8}$/;

/** Extract the 4-byte method selector from transaction data (first 8 hex chars). */
function extractSelector(data: string): string {
	// data field is hex without 0x prefix; take first 8 chars = 4 bytes
	return `0x${data.slice(0, 8).toLowerCase()}`;
}

/**
 * Derive the human-readable type_display from contract_type and call data.
 */
function deriveTypeDisplay(contractType: string, data?: string): string {
	if (contractType === "TriggerSmartContract") {
		if (data && data.length >= 8) {
			return `0x${data.slice(0, 8).toLowerCase()}`;
		}
		return "Contract Call";
	}
	return humanTxType(contractType);
}

/** Map a raw tx to AccountTxRow. */
function mapToRow(tx: RawTxWithData): AccountTxRow {
	const fee = (tx.net_fee ?? 0) + (tx.energy_fee ?? 0);
	const contractEntry = tx.raw_data?.contract?.[0];
	const contractType = contractEntry?.type ?? "Unknown";
	const paramValue = contractEntry?.parameter?.value;
	const data = paramValue?.data;
	const amount = paramValue?.call_value ?? paramValue?.amount ?? 0;

	return {
		tx_id: tx.txID ?? "",
		block_number: tx.blockNumber ?? 0,
		timestamp: tx.block_timestamp ?? 0,
		contract_type: contractType,
		type_display: deriveTypeDisplay(contractType, data),
		method: undefined,
		method_selector: data && data.length >= 8 ? extractSelector(data) : undefined,
		from: paramValue?.owner_address ?? "",
		to: paramValue?.to_address ?? paramValue?.contract_address ?? "",
		amount,
		amount_unit: "sun" as const,
		amount_trx: sunToTrx(amount),
		status: tx.ret?.[0]?.contractRet ?? "UNKNOWN",
		confirmed: true,
		fee,
		fee_unit: "sun" as const,
		decimals: 6 as const,
		fee_trx: sunToTrx(fee),
	};
}

/**
 * Resolve method filter to a set of 4-byte selectors.
 *
 * Two input forms:
 *   1. 4-byte selector (0x + 8 hex chars) — use directly
 *   2. Method name — fetch ABI, find matching methods case-insensitively,
 *      collect their selectors
 */
async function resolveSelectors(
	client: ApiClient,
	address: string,
	method: string,
): Promise<Set<string>> {
	if (SELECTOR_REGEX.test(method)) {
		return new Set([method.toLowerCase()]);
	}

	// Name-based: fetch ABI and find matching methods
	const raw = await client.post<RawContractResponse>("/wallet/getcontract", {
		value: address,
		visible: true,
	});

	if (!raw.abi?.entrys || !Array.isArray(raw.abi.entrys) || raw.abi.entrys.length === 0) {
		return new Set();
	}

	const normalized = normalizeAbiEntries(raw.abi.entrys);
	const summary = parseAbi(normalized);
	const nameLower = method.toLowerCase();

	const selectors = new Set<string>();
	for (const m of summary.methods) {
		if (m.name.toLowerCase() === nameLower) {
			selectors.add(m.selector.toLowerCase());
		}
	}
	return selectors;
}

// --- Core fetch ---

/**
 * Fetch transaction history for a contract address.
 *
 * Without `method`: delegates to `fetchAccountTxs` (same endpoint).
 * With `method`: fetches raw response, filters by method selector, maps to AccountTxRow.
 */
export async function fetchContractTxs(
	client: ApiClient,
	address: string,
	opts: { limit: number; method?: string },
): Promise<AccountTxRow[]> {
	validateAddress(address);

	// No method filter — delegate to the account txs function
	if (!opts.method) {
		return fetchAccountTxs(client, address, { limit: opts.limit });
	}

	// Resolve method to selector(s)
	const selectors = await resolveSelectors(client, address, opts.method);
	if (selectors.size === 0) {
		return [];
	}

	// Fetch raw txs (need the data field for filtering)
	const path = `/v1/accounts/${address}/transactions?limit=${opts.limit}`;
	const raw = await client.get<AccountTxsResponse>(path);
	const txs = raw.data ?? [];

	// Filter: only transactions whose data starts with a matching selector
	const filtered: AccountTxRow[] = [];
	for (const tx of txs) {
		const data = tx.raw_data?.contract?.[0]?.parameter?.value?.data;
		if (!data) continue; // skip txs without data (e.g. TRX transfers)
		const txSelector = extractSelector(data);
		if (selectors.has(txSelector)) {
			filtered.push(mapToRow(tx));
		}
	}

	return filtered;
}

// --- Command registration ---

export function registerContractTxsCommand(contract: Command, parent: Command): void {
	contract
		.command("txs")
		.description("List transaction history for a contract")
		.helpGroup("Read commands:")
		.argument("<address>", "Contract address (Base58)")
		.option("--method <selector|name>", "filter by method selector (0x...) or ABI name")
		.addHelpText(
			"after",
			`
Equivalent to: trongrid account txs <address> (without --method filter)

Examples:
  $ trongrid contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --method transfer
  $ trongrid contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --method 0xa9059cbb
  $ trongrid contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, fee, amount (all default desc)
`,
		)
		.action(async (address: string, localOpts: { method?: string }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);
				const client = getClient(opts);
				const rows = await fetchContractTxs(client, address, {
					limit: Number.parseInt(opts.limit, 10),
					method: localOpts.method,
				});
				const sorted = sortTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });

				printListResult(sorted, (items) => renderTxs(items, address), {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
				});
			}
		});
}
