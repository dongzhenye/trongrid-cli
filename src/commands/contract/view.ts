import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { type HumanPair, printResult, reportErrorAndExit } from "../../output/format.js";
import { type AbiSummary, normalizeAbiEntries, parseAbi } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";

// --- Public types ---

export interface ContractViewResult {
	address: string;
	name: string;
	deployer: string;
	status: "active" | "destroyed";
	deploy_tx: string;
	caller_energy_ratio: number;
	deployer_energy_cap: number;
	abi_summary: {
		method_count: number;
		event_count: number;
		methods: string[];
		events: string[];
	};
	bytecode_length: number;
}

// --- Raw response shape from TronGrid ---

interface RawContractResponse {
	bytecode?: string;
	name?: string;
	origin_address?: string;
	contract_address?: string;
	abi?: { entrys?: unknown[] };
	trx_hash?: string;
	consume_user_resource_percent?: number;
	origin_energy_limit?: number;
}

// --- Core fetch ---

export async function fetchContractView(
	client: ApiClient,
	address: string,
): Promise<ContractViewResult> {
	validateAddress(address);

	const raw = await client.post<RawContractResponse>("/wallet/getcontract", {
		value: address,
		visible: true,
	});

	const bytecode = raw.bytecode ?? "";
	const status: "active" | "destroyed" = bytecode ? "active" : "destroyed";

	// Parse ABI: normalize TronGrid's capitalized types, then parse
	let abiSummary: AbiSummary;
	if (raw.abi?.entrys && Array.isArray(raw.abi.entrys) && raw.abi.entrys.length > 0) {
		const normalized = normalizeAbiEntries(raw.abi.entrys);
		abiSummary = parseAbi(normalized);
	} else {
		abiSummary = { method_count: 0, event_count: 0, methods: [], events: [] };
	}

	return {
		address: raw.contract_address ?? address,
		name: raw.name ?? "",
		deployer: raw.origin_address ?? "",
		status,
		deploy_tx: raw.trx_hash ?? "",
		caller_energy_ratio: raw.consume_user_resource_percent ?? 0,
		deployer_energy_cap: raw.origin_energy_limit ?? 0,
		abi_summary: {
			method_count: abiSummary.method_count,
			event_count: abiSummary.event_count,
			methods: abiSummary.methods.map((m) => m.signature),
			events: abiSummary.events.map((e) => e.signature),
		},
		bytecode_length: bytecode.length / 2,
	};
}

// --- Human-mode display pairs ---

export function buildContractViewPairs(data: ContractViewResult): HumanPair[] {
	return [
		["address", "Contract", data.address],
		["name", "Name", data.name || muted("(unnamed)")],
		["deployer", "Deployer", data.deployer || muted("(unknown)")],
		["status", "Status", data.status === "active" ? "Active" : "Destroyed"],
		["deploy_tx", "Deploy TX", data.deploy_tx || muted("(unknown)")],
		["caller_energy_ratio", "Caller pays", `${data.caller_energy_ratio}%`],
		["deployer_energy_cap", "Deployer cap", String(data.deployer_energy_cap)],
		[
			"abi_summary",
			"ABI Summary",
			`${data.abi_summary.method_count} methods, ${data.abi_summary.event_count} events`,
		],
		["bytecode_length", "Bytecode", `${data.bytecode_length.toLocaleString()} bytes`],
	];
}

// --- Command registration ---

export function registerContractCommands(parent: Command): Command {
	const contract = parent
		.command("contract")
		.description("Smart contract queries")
		.helpGroup("Read commands:");
	return contract;
}

export function registerContractViewCommand(contract: Command, parent: Command): void {
	contract
		.command("view")
		.description("View smart contract metadata, ABI summary, and status")
		.helpGroup("Read commands:")
		.argument("<address>", "Smart contract address (Base58 T... or Hex 41...)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json
  $ trongrid contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --fields name,status
`,
		)
		.action(async (address: string) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);
				const client = getClient(opts);
				const data = await fetchContractView(client, address);

				printResult(data, buildContractViewPairs(data), {
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
