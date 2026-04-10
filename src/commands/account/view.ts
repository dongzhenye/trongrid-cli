import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printError, printResult, sunToTrx } from "../../output/format.js";
import { resolveAddress } from "../../utils/resolve-address.js";

interface AccountViewData {
	address: string;
	balance: number;
	balance_unit: "sun";
	balance_trx: string;
	is_contract: boolean;
	create_time: number;
}

export async function fetchAccountView(
	client: ApiClient,
	address: string,
): Promise<AccountViewData> {
	const raw = await client.post<{
		address: string;
		balance?: number;
		create_time?: number;
		type?: string;
		account_resource?: Record<string, unknown>;
	}>("/wallet/getaccount", { address, visible: true });

	const balance = raw.balance ?? 0;

	return {
		address: raw.address ?? address,
		balance: balance,
		balance_unit: "sun",
		balance_trx: sunToTrx(balance),
		is_contract: raw.type === "Contract",
		create_time: raw.create_time ?? 0,
	};
}

export function registerAccountCommands(parent: Command): Command {
	const account = parent.command("account").description("Address queries");

	account
		.command("view")
		.description("View account balance, type, and activation status")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const data = await fetchAccountView(client, resolved);

				printResult(
					data as unknown as Record<string, unknown>,
					[
						["Address", data.address],
						["Balance", `${data.balance_trx} TRX`],
						["Type", data.is_contract ? "Contract" : "EOA"],
						["Created", data.create_time ? new Date(data.create_time).toISOString() : "Unknown"],
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

	return account;
}
