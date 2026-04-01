import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";

interface TxViewData {
  txId: string;
  blockNumber: number;
  timestamp: number;
  status: string;
  contractType: string;
  feeSun: number;
  feeTrx: string;
  energyUsed: number;
}

export async function fetchTxView(client: ApiClient, hash: string): Promise<TxViewData> {
  const [tx, info] = await Promise.all([
    client.post<{
      txID: string;
      raw_data: {
        contract: Array<{ type: string }>;
        timestamp: number;
      };
    }>("/wallet/gettransactionbyid", { value: hash }),
    client.post<{
      id: string;
      blockNumber: number;
      receipt: { result?: string; energy_usage_total?: number };
      fee?: number;
    }>("/wallet/gettransactioninfobyid", { value: hash }),
  ]);

  const fee = info.fee ?? 0;

  return {
    txId: tx.txID,
    blockNumber: info.blockNumber,
    timestamp: tx.raw_data.timestamp,
    status: info.receipt.result ?? "UNKNOWN",
    contractType: tx.raw_data.contract[0]?.type ?? "Unknown",
    feeSun: fee,
    feeTrx: sunToTrx(fee),
    energyUsed: info.receipt.energy_usage_total ?? 0,
  };
}

export function registerTxCommands(parent: Command): void {
  const tx = parent.command("tx").description("Transaction queries");

  tx.command("view")
    .description("View transaction details by hash")
    .argument("<hash>", "Transaction hash")
    .action(async (hash: string) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        const client = getClient(opts);
        const data = await fetchTxView(client, hash);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["TX Hash", data.txId],
            ["Block", String(data.blockNumber)],
            ["Time", new Date(data.timestamp).toISOString()],
            ["Status", data.status],
            ["Type", data.contractType],
            ["Fee", `${data.feeTrx} TRX`],
            ["Energy Used", String(data.energyUsed)],
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
