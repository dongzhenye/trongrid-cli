import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchBatchTrc20Info } from "../../src/api/token-info.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDC = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

describe("fetchBatchTrc20Info", () => {
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    it("returns a single entry with correct fields (decimals parsed to number)", async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [
                            {
                                contract_address: USDT,
                                name: "Tether USD",
                                symbol: "USDT",
                                decimals: "6",
                                type: "trc20",
                                total_supply: "62771650000000000",
                            },
                        ],
                    }),
                ),
            ),
        );

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, [USDT]);

        expect(result.size).toBe(1);
        const info = result.get(USDT);
        expect(info).toBeDefined();
        expect(info?.contract_address).toBe(USDT);
        expect(info?.name).toBe("Tether USD");
        expect(info?.symbol).toBe("USDT");
        expect(info?.decimals).toBe(6);
        expect(typeof info?.decimals).toBe("number");
        expect(info?.type).toBe("trc20");
        expect(info?.total_supply).toBe("62771650000000000");
    });

    it("returns all entries for multiple addresses", async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [
                            {
                                contract_address: USDT,
                                name: "Tether USD",
                                symbol: "USDT",
                                decimals: "6",
                                type: "trc20",
                                total_supply: "62771650000000000",
                            },
                            {
                                contract_address: USDC,
                                name: "USD Coin",
                                symbol: "USDC",
                                decimals: "6",
                                type: "trc20",
                                total_supply: "1000000000000",
                            },
                        ],
                    }),
                ),
            ),
        );

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, [USDT, USDC]);

        expect(result.size).toBe(2);
        expect(result.has(USDT)).toBe(true);
        expect(result.has(USDC)).toBe(true);
        expect(result.get(USDC)?.symbol).toBe("USDC");
    });

    it("returns empty Map for empty input without calling fetch", async () => {
        const mockFetch = mock(() => Promise.resolve(new Response("{}")));
        globalThis.fetch = mockFetch;

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, []);

        expect(result.size).toBe(0);
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns empty Map when API returns empty data array", async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(new Response(JSON.stringify({ data: [] }))),
        );

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, [USDT]);

        expect(result.size).toBe(0);
    });

    it("builds URL with contract_list query parameter", async () => {
        const mockFetch = mock(() =>
            Promise.resolve(
                new Response(JSON.stringify({ data: [] })),
            ),
        );
        globalThis.fetch = mockFetch;

        const client = createClient({ network: "mainnet" });
        await fetchBatchTrc20Info(client, [USDT, USDC]);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain(`contract_list=${USDT},${USDC}`);
    });

    it("chunks addresses into groups of 20 and fans out with Promise.all", async () => {
        // Generate 25 unique fake addresses
        const addresses = Array.from({ length: 25 }, (_, i) =>
            `T${"A".repeat(33 - String(i).length)}${i}`,
        );

        let callCount = 0;
        globalThis.fetch = mock(() => {
            callCount++;
            return Promise.resolve(new Response(JSON.stringify({ data: [] })));
        });

        const client = createClient({ network: "mainnet" });
        await fetchBatchTrc20Info(client, addresses);

        // 25 addresses → 2 chunks (20 + 5)
        expect(callCount).toBe(2);
    });

    it("applies defaults for missing optional fields", async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [
                            {
                                contract_address: USDT,
                                // All other fields omitted
                            },
                        ],
                    }),
                ),
            ),
        );

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, [USDT]);

        const info = result.get(USDT);
        expect(info?.name).toBe("");
        expect(info?.symbol).toBe("");
        expect(info?.decimals).toBe(0);
        expect(info?.type).toBe("trc20");
        expect(info?.total_supply).toBe("0");
    });

    it("skips entries without contract_address", async () => {
        globalThis.fetch = mock(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        data: [
                            { name: "NoAddress", symbol: "NA" },
                            { contract_address: USDT, symbol: "USDT", decimals: "6" },
                        ],
                    }),
                ),
            ),
        );

        const client = createClient({ network: "mainnet" });
        const result = await fetchBatchTrc20Info(client, [USDT]);

        expect(result.size).toBe(1);
        expect(result.has(USDT)).toBe(true);
    });
});
