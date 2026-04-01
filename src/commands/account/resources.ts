import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printError, printResult } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";

interface ResourceData {
	address: string;
	energyUsed: number;
	energyLimit: number;
	bandwidthUsed: number;
	bandwidthLimit: number;
	totalFrozenV2: number;
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
		energyUsed: raw.EnergyUsed ?? 0,
		energyLimit: raw.EnergyLimit ?? 0,
		bandwidthUsed: (raw.freeNetUsed ?? 0) + (raw.NetUsed ?? 0),
		bandwidthLimit: (raw.freeNetLimit ?? 0) + (raw.NetLimit ?? 0),
		totalFrozenV2: 0,
	};
}

export function registerAccountResourcesCommand(account: Command, parent: Command): void {
	account
		.command("resources")
		.description("View energy, bandwidth, and staking state")
		.argument("<address>", "TRON address")
		.action(async (address: string) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				validateAddress(address);
				const client = getClient(opts);
				const data = await fetchAccountResources(client, address);

				printResult(
					data as unknown as Record<string, unknown>,
					[
						["Address", data.address],
						[
							"Energy",
							`${data.energyUsed.toLocaleString()} / ${data.energyLimit.toLocaleString()}`,
						],
						[
							"Bandwidth",
							`${data.bandwidthUsed.toLocaleString()} / ${data.bandwidthLimit.toLocaleString()}`,
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
