import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";

interface AccountViewData {
  address: string;
  balanceSun: number;
  balanceTrx: string;
  isContract: boolean;
  createTime: number;
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
    balanceSun: balance,
    balanceTrx: sunToTrx(balance),
    isContract: raw.type === "Contract",
    createTime: raw.create_time ?? 0,
  };
}

export function registerAccountCommands(parent: Command): Command {
  const account = parent.command("account").description("Address queries");

  account
    .command("view")
    .description("View account balance, type, and activation status")
    .argument("<address>", "TRON address (Base58 or Hex)")
    .action(async (address: string) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const data = await fetchAccountView(client, address);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["Address", data.address],
            ["Balance", `${data.balanceTrx} TRX`],
            ["Type", data.isContract ? "Contract" : "EOA"],
            ["Created", data.createTime ? new Date(data.createTime).toISOString() : "Unknown"],
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
