import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { computeColumnWidths, renderColumns } from "../../output/columns.js";
import { printListResult, reportErrorAndExit, UsageError } from "../../output/format.js";
import { type AbiMethod, normalizeAbiEntries, parseAbi } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";

// --- Raw response shape (same as contract view) ---

interface RawContractResponse {
	abi?: { entrys?: unknown[] };
}

// --- Core fetch ---

/**
 * Fetch ABI methods for a contract address.
 *
 * Uses the same endpoint as `contract view` (`POST /wallet/getcontract`),
 * but only parses the ABI to extract function entries.
 *
 * @param typeFilter - Optional "read" or "write" filter.
 *   read = view + pure, write = nonpayable + payable.
 */
export async function fetchContractMethods(
	client: ApiClient,
	address: string,
	typeFilter?: "read" | "write",
): Promise<AbiMethod[]> {
	validateAddress(address);

	const raw = await client.post<RawContractResponse>("/wallet/getcontract", {
		value: address,
		visible: true,
	});

	if (!raw.abi?.entrys || !Array.isArray(raw.abi.entrys) || raw.abi.entrys.length === 0) {
		return [];
	}

	const normalized = normalizeAbiEntries(raw.abi.entrys);
	const summary = parseAbi(normalized);
	let methods = summary.methods;

	if (typeFilter) {
		methods = methods.filter((m) => m.type === typeFilter);
	}

	return methods;
}

// --- Human-mode renderer (local, not exported) ---

function renderMethods(items: AbiMethod[]): void {
	if (items.length === 0) {
		console.log(muted("No methods found."));
		return;
	}

	const noun = items.length === 1 ? "method" : "methods";
	console.log(`${items.length} ${noun}:\n`);

	const header = ["Selector", "Type", "Mutability", "Signature"];
	const cells: string[][] = items.map((m) => [m.selector, m.type, m.mutability, m.signature]);

	const allRows = [header, ...cells];
	const widths = computeColumnWidths(allRows);
	const lines = renderColumns(allRows, widths);

	// First line is header — render muted
	console.log(`  ${muted(lines[0] ?? "")}`);
	for (let i = 1; i < lines.length; i++) {
		console.log(`  ${lines[i]}`);
	}
}

// --- Command registration ---

export function registerContractMethodsCommand(contract: Command, parent: Command): void {
	contract
		.command("methods")
		.description("List ABI methods for a contract with selector, type, and signature")
		.helpGroup("Read commands:")
		.argument("<address>", "Smart contract address (Base58 T... or Hex 41...)")
		.option("--type <type>", "filter by method type (read|write)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --type read
  $ trongrid contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --type write
  $ trongrid contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json
`,
		)
		.action(async (address: string, localOpts: { type?: string }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);

				// Validate --type flag
				let typeFilter: "read" | "write" | undefined;
				if (localOpts.type !== undefined) {
					if (localOpts.type !== "read" && localOpts.type !== "write") {
						throw new UsageError(
							`Invalid --type value "${localOpts.type}". Expected "read" or "write".`,
						);
					}
					typeFilter = localOpts.type;
				}

				const client = getClient(opts);
				const methods = await fetchContractMethods(client, address, typeFilter);

				printListResult(methods, renderMethods, {
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
