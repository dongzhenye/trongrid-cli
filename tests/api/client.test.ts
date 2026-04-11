import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient, TrongridError } from "../../src/api/client.js";

describe("ApiClient", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends GET request to correct mainnet URL", async () => {
		const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ blockID: "abc" }))));
		globalThis.fetch = mockFetch;

		const client = createClient({ network: "mainnet" });
		await client.get("/wallet/getnowblock");

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.trongrid.io/wallet/getnowblock");
		expect(init.method).toBe("GET");
	});

	it("sends POST request with JSON body", async () => {
		const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({ balance: 100 }))));
		globalThis.fetch = mockFetch;

		const client = createClient({ network: "mainnet" });
		await client.post("/wallet/getaccount", {
			address: "TXxx",
			visible: true,
		});

		expect(mockFetch).toHaveBeenCalledTimes(1);
		const [url, init] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.trongrid.io/wallet/getaccount");
		expect(init.method).toBe("POST");
		expect(init.body).toBe(JSON.stringify({ address: "TXxx", visible: true }));
	});

	it("injects TRON-PRO-API-KEY header when apiKey is provided", async () => {
		const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));
		globalThis.fetch = mockFetch;

		const client = createClient({ network: "mainnet", apiKey: "my-secret-key" });
		await client.get("/wallet/getnowblock");

		const [, init] = mockFetch.mock.calls[0];
		expect(init.headers["TRON-PRO-API-KEY"]).toBe("my-secret-key");
	});

	it("uses shasta network URL when network is shasta", async () => {
		const mockFetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));
		globalThis.fetch = mockFetch;

		const client = createClient({ network: "shasta" });
		await client.get("/wallet/getnowblock");

		const [url] = mockFetch.mock.calls[0];
		expect(url).toBe("https://api.shasta.trongrid.io/wallet/getnowblock");
	});

	it("throws TrongridError on HTTP error response", async () => {
		const mockFetch = mock(() =>
			Promise.resolve(
				new Response(JSON.stringify({ error: "not found" }), {
					status: 404,
					statusText: "Not Found",
				}),
			),
		);
		globalThis.fetch = mockFetch;

		const client = createClient({ network: "mainnet" });

		try {
			await client.get("/wallet/nonexistent");
			// should not reach here
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(TrongridError);
			const tgErr = err as TrongridError;
			expect(tgErr.status).toBe(404);
			expect(tgErr.message).toContain("404");
			expect(tgErr.upstream).toEqual({ error: "not found" });
		}
	});

	it("wraps network-level fetch failures in TrongridError with status 0", async () => {
		const networkError = new TypeError("fetch failed");
		globalThis.fetch = mock(() => Promise.reject(networkError));

		const client = createClient({ network: "mainnet" });

		try {
			await client.get("/wallet/getnowblock");
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(TrongridError);
			const tgErr = err as TrongridError;
			expect(tgErr.status).toBe(0);
			expect(tgErr.message).toContain("Cannot reach TronGrid API");
			expect(tgErr.message).toContain("api.trongrid.io");
			expect(tgErr.message).toContain("--verbose");
			expect(tgErr.upstream).toBe(networkError);
		}
	});

	it("wraps network-level failures on POST requests too", async () => {
		const networkError = new TypeError("fetch failed");
		globalThis.fetch = mock(() => Promise.reject(networkError));

		const client = createClient({ network: "shasta" });

		try {
			await client.post("/wallet/getaccount", { address: "TXxx" });
			expect(true).toBe(false);
		} catch (err) {
			expect(err).toBeInstanceOf(TrongridError);
			const tgErr = err as TrongridError;
			expect(tgErr.status).toBe(0);
			expect(tgErr.message).toContain("api.shasta.trongrid.io");
			expect(tgErr.upstream).toBe(networkError);
		}
	});
});
