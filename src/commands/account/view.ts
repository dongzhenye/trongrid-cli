import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { formatTimestamp, printResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";

interface AccountViewData {
	address: string;
	balance: number;
	balance_unit: "sun";
	decimals: 6;
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
		decimals: 6,
		balance_trx: sunToTrx(balance),
		is_contract: raw.type === "Contract",
		create_time: raw.create_time ?? 0,
	};
}

export function registerAccountCommands(parent: Command): Command {
	const account = parent
		.command("account")
		.description("Address queries")
		.helpGroup("Read commands:");

	account
		.command("view")
		.description("View account balance, type, and activation status (typical first step)")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account view TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
  $ trongrid account view                   # uses default_address from config
  $ trongrid account view TR... --json      # machine-readable output (class S1 shape)
  $ trongrid account view TR... --fields balance_trx,is_contract
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const data = await fetchAccountView(client, resolved);

				printResult(
					data,
					[
						["Address", data.address],
						["Balance", `${data.balance_trx} TRX`],
						["Type", data.is_contract ? "Contract" : "EOA"],
						["Created", data.create_time ? formatTimestamp(data.create_time) : "Unknown"],
					],
					{ json: opts.json, fields: parseFields(opts) },
				);
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: addressErrorHint(err),
				});
			}
		});

	return account;
}
