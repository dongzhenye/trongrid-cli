import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenView } from "../../src/commands/token/view.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("fetchTokenView — TRC-20", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches name / symbol / decimals / totalSupply via triggerconstantcontract", async () => {
		// Each triggerconstantcontract call returns an ABI-encoded hex string.
		// We simulate:
		//   name()     → "Tether USD"
		//   symbol()   → "USDT"
		//   decimals() → 6
		//   totalSupply() → 82,123,456,789,000 (0x4AB5C85A...)
		const responses: Record<string, string> = {
			"name()": encodeString("Tether USD"),
			"symbol()": encodeString("USDT"),
			"decimals()": "0000000000000000000000000000000000000000000000000000000000000006",
			"totalSupply()": toHex256(82_123_456_789_000n),
		};

		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			const body = JSON.parse((init?.body ?? "{}") as string);
			const fn = body.function_selector as string;
			const hex = responses[fn];
			return Promise.resolve(new Response(JSON.stringify({ constant_result: [hex] })));
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenView(client, { kind: "trc20", address: USDT });

		expect(result).toMatchObject({
			type: "TRC20",
			contract_address: USDT,
			name: "Tether USD",
			symbol: "USDT",
			decimals: 6,
			total_supply: "82123456789000",
			total_supply_major: "82123456.789",
		});
	});
});

describe("fetchTokenView — TRC-10", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches metadata via /wallet/getassetissuebyid with visible:true", async () => {
		let capturedUrl: string | undefined;
		let capturedBody: string | undefined;
		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			capturedUrl = url;
			capturedBody = init?.body as string | undefined;
			return Promise.resolve(
				new Response(
					JSON.stringify({
						id: "1002000",
						name: "BitTorrent_Old",
						abbr: "BTTOLD",
						precision: 6,
						total_supply: "990000000000000",
						owner_address: "TOwnerAddr...",
					}),
				),
			);
		});

		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenView(client, { kind: "trc10", assetId: "1002000" });

		expect(capturedUrl).toContain("/wallet/getassetissuebyid");
		// visible:true is required so name/abbr come back as UTF-8 strings,
		// not hex-encoded byte sequences. Without it, "BitTorrent" would arrive
		// as "426974546f7272656e74".
		expect(JSON.parse(capturedBody ?? "{}")).toMatchObject({
			value: "1002000",
			visible: true,
		});
		expect(result).toMatchObject({
			type: "TRC10",
			contract_address: "1002000",
			name: "BitTorrent_Old",
			symbol: "BTTOLD",
			decimals: 6,
			total_supply: "990000000000000",
			total_supply_major: "990000000.0",
		});
	});

	it("throws with actionable error when asset is not found", async () => {
		globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));
		const client = createClient({ network: "mainnet" });
		await expect(fetchTokenView(client, { kind: "trc10", assetId: "9999999" })).rejects.toThrow(
			/token not found/i,
		);
	});

	it("defaults precision to 0 when upstream omits it (legacy TRC-10)", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						id: "1000001",
						name: "Legacy",
						abbr: "LGCY",
						total_supply: "1000",
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenView(client, { kind: "trc10", assetId: "1000001" });
		expect(result.decimals).toBe(0);
		expect(result.total_supply_major).toBe("1000");
	});
});

// Helpers: ABI-encode a string (returns hex for {offset, length, data}).
function encodeString(s: string): string {
	const hexBytes = Array.from(new TextEncoder().encode(s))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	const padded = hexBytes.padEnd(Math.ceil(hexBytes.length / 64) * 64, "0");
	const offset = "0".repeat(62) + "20";
	const length = s.length.toString(16).padStart(64, "0");
	return offset + length + padded;
}

function toHex256(n: bigint): string {
	return n.toString(16).padStart(64, "0");
}
