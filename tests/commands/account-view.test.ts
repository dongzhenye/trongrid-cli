import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
} from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAccountView } from "../../src/commands/account/view.js";

describe("account view", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
            balance: 50_000_000,
            create_time: 1600000000000,
            account_resource: {},
          }),
        ),
      ),
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches and formats account data", async () => {
    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

    expect(result.address).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
    expect(result.balance).toBe(50_000_000);
    expect(result.balance_trx).toBe("50");
    expect(result.is_contract).toBe(false);
    expect(result.create_time).toBe(1600000000000);
  });

  it("handles account with zero balance", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
            create_time: 1600000000000,
            account_resource: {},
          }),
        ),
      ),
    );

    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

    expect(result.balance).toBe(0);
    expect(result.balance_trx).toBe("0");
  });

  it("identifies contract accounts", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
            balance: 0,
            type: "Contract",
            create_time: 1600000000000,
          }),
        ),
      ),
    );

    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

    expect(result.is_contract).toBe(true);
  });
});
