import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";

describe("tx view", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      const body = init?.body ? JSON.parse(init.body as string) : {};

      if (urlStr.includes("gettransactionbyid")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              txID: "abc123",
              raw_data: {
                contract: [{ type: "TransferContract" }],
                timestamp: 1711929600000,
              },
            }),
        } as Response);
      }
      // gettransactioninfobyid
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "abc123",
            blockNumber: 70000000,
            receipt: { result: "SUCCESS", energy_usage_total: 0 },
            fee: 1_100_000,
          }),
      } as Response);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and merges transaction + info data", async () => {
    const { fetchTxView } = await import("../../src/commands/tx/view.js");
    const client = createClient({ network: "mainnet" });
    const result = await fetchTxView(client, "abc123");

    expect(result.tx_id).toBe("abc123");
    expect(result.block_number).toBe(70000000);
    expect(result.status).toBe("SUCCESS");
    expect(result.fee).toBe(1_100_000);
  });

  it("throws on non-existent transaction", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response),
    );

    const { fetchTxView } = await import("../../src/commands/tx/view.js");
    const client = createClient({ network: "mainnet" });

    expect(fetchTxView(client, "nonexistent")).rejects.toThrow("Transaction not found");
  });
});
