import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchLatestBlock } from "../../src/commands/block/latest.js";

describe("block latest", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            blockID: "000000000123abcdef",
            block_header: {
              raw_data: {
                number: 70000000,
                timestamp: 1711929600000,
                witness_address: "41abc123",
                txTrieRoot: "0000",
              },
            },
            transactions: [{}, {}, {}],
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and returns latest block data", async () => {
    const client = createClient({ network: "mainnet" });
    const result = await fetchLatestBlock(client);

    expect(result.blockId).toBe("000000000123abcdef");
    expect(result.number).toBe(70000000);
    expect(result.timestamp).toBe(1711929600000);
    expect(result.witnessAddress).toBe("41abc123");
    expect(result.txCount).toBe(3);
  });

  it("handles blocks with no transactions", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            blockID: "00000000deadbeef",
            block_header: {
              raw_data: {
                number: 70000001,
                timestamp: 1711929603000,
                witness_address: "41def456",
              },
            },
          }),
        ),
      ),
    );

    const client = createClient({ network: "mainnet" });
    const result = await fetchLatestBlock(client);

    expect(result.txCount).toBe(0);
  });
});
