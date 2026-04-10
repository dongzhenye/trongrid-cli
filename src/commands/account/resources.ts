import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printError, printResult } from "../../output/format.js";
import { resolveAddress } from "../../utils/resolve-address.js";

interface ResourceData {
	address: string;
	energy_used: number;
	energy_limit: number;
	bandwidth_used: number;
	bandwidth_limit: number;
}

export async function fetchAccountResources(
	client: ApiClient,
	address: string,
): Promise<ResourceData> {
	const raw = await client.post<{
		EnergyUsed?: number;
		EnergyLimit?: number;
		freeNetUsed?: number;
		freeNetLimit?: number;
		NetUsed?: number;
		NetLimit?: number;
	}>("/wallet/getaccountresource", { address, visible: true });

	return {
		address,
		energy_used: raw.EnergyUsed ?? 0,
		energy_limit: raw.EnergyLimit ?? 0,
		bandwidth_used: (raw.freeNetUsed ?? 0) + (raw.NetUsed ?? 0),
		bandwidth_limit: (raw.freeNetLimit ?? 0) + (raw.NetLimit ?? 0),
	};
}

export function registerAccountResourcesCommand(account: Command, parent: Command): void {
	account
		.command("resources")
		.description("View energy, bandwidth, and staking state")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const data = await fetchAccountResources(client, resolved);

				printResult(
					data as unknown as Record<string, unknown>,
					[
						["Address", data.address],
						[
							"Energy",
							`${data.energy_used.toLocaleString()} / ${data.energy_limit.toLocaleString()}`,
						],
						[
							"Bandwidth",
							`${data.bandwidth_used.toLocaleString()} / ${data.bandwidth_limit.toLocaleString()}`,
						],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				printError(err instanceof Error ? err.message : String(err), {
					json: opts.json,
					verbose: opts.verbose,
					upstream: (err as { upstream?: unknown }).upstream,
				});
				process.exit(1);
			}
		});
}
