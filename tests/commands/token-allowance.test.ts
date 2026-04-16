import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchAllowance } from "../../src/commands/token/allowance.js";
import { UsageError } from "../../src/output/format.js";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";
import { base58ToHex } from "../../src/utils/address.js";
import { hexToBase58 } from "../../src/utils/address.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; // USDT
// Both OWNER and SPENDER are verified real TRON addresses (checksum passes base58ToHex)
const OWNER = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
const SPENDER = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8"; // USDC contract — valid TRON address

const MOCK_INFO_RESPONSE = {
	data: [
		{
			contract_address: CONTRACT,
			name: "Tether USD",
			symbol: "USDT",
			decimals: "6",
			type: "trc20",
			total_supply: "100000000000000",
		},
	],
};

/** Encode a uint256 as a 64-char hex string (no 0x prefix). */
function toHex256(n: bigint): string {
	return n.toString(16).padStart(64, "0");
}

describe("fetchAllowance — TRC-20", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("returns S2 shape with correct allowance_major for a non-zero allowance", async () => {
		// 1,000,000 USDT = 1_000_000 * 10^6 = 1_000_000_000_000 sun
		const rawAllowance = 1_000_000_000_000n;

		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify(MOCK_INFO_RESPONSE)));
			}
			if (url.includes("/wallet/triggerconstantcontract")) {
				const body = JSON.parse((init?.body ?? "{}") as string);
				expect(body.function_selector).toBe("allowance(address,address)");
				expect(body.contract_address).toBe(CONTRACT);
				expect(body.parameter).toHaveLength(128); // two 32-byte slots
				return Promise.resolve(
					new Response(
						JSON.stringify({ constant_result: [toHex256(rawAllowance)] }),
					),
				);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier(CONTRACT);
		const result = await fetchAllowance(client, id, OWNER, SPENDER);

		expect(result).toMatchObject({
			token: "USDT",
			token_address: CONTRACT,
			token_symbol: "USDT",
			token_name: "Tether USD",
			owner: OWNER,
			spender: SPENDER,
			allowance: "1000000000000",
			decimals: 6,
			allowance_major: "1000000.0",
		});
	});

	it("handles zero allowance correctly", async () => {
		globalThis.fetch = mock((url: string) => {
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify(MOCK_INFO_RESPONSE)));
			}
			if (url.includes("/wallet/triggerconstantcontract")) {
				return Promise.resolve(
					new Response(
						JSON.stringify({ constant_result: [toHex256(0n)] }),
					),
				);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier(CONTRACT);
		const result = await fetchAllowance(client, id, OWNER, SPENDER);

		expect(result.allowance).toBe("0");
		expect(result.allowance_major).toBe("0.0");
	});

	it("encodes owner and spender addresses as ABI parameters (128 hex chars total)", async () => {
		let capturedBody: Record<string, unknown> | undefined;

		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			if (url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify(MOCK_INFO_RESPONSE)));
			}
			if (url.includes("/wallet/triggerconstantcontract")) {
				capturedBody = JSON.parse((init?.body ?? "{}") as string);
				return Promise.resolve(
					new Response(JSON.stringify({ constant_result: [toHex256(1000n)] })),
				);
			}
			throw new Error(`Unexpected URL: ${url}`);
		});

		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier(CONTRACT);
		await fetchAllowance(client, id, OWNER, SPENDER);

		// parameter = 32-byte owner slot + 32-byte spender slot = 64 hex + 64 hex
		expect(capturedBody?.parameter).toHaveLength(128);
		// Both slots must be zero-padded to 64 chars
		const param = capturedBody?.parameter as string;
		const ownerSlot = param.slice(0, 64);
		const spenderSlot = param.slice(64, 128);
		// Each slot is a left-zero-padded 20-byte address (40 hex chars at the right)
		expect(ownerSlot).toMatch(/^0{24}[0-9a-f]{40}$/);
		expect(spenderSlot).toMatch(/^0{24}[0-9a-f]{40}$/);
	});
});

describe("fetchAllowance — error cases", () => {
	it("throws UsageError for TRX", async () => {
		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("TRX");
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(UsageError);
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(/TRX/);
	});

	it("throws UsageError for TRC-10", async () => {
		const client = createClient({ network: "mainnet" });
		const id = detectTokenIdentifier("1002000");
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(UsageError);
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(/TRC-10/);
	});

	it("throws UsageError for TRC-721", async () => {
		const client = createClient({ network: "mainnet" });
		const id = { type: "trc721" as const, address: CONTRACT };
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(UsageError);
		await expect(fetchAllowance(client, id, OWNER, SPENDER)).rejects.toThrow(/TRC721/);
	});
});

describe("base58ToHex — round-trip", () => {
	it("round-trips USDT contract address: Base58 → hex → Base58", () => {
		const hex = base58ToHex(CONTRACT);
		// hex should be 40 chars (20 bytes, no 0x41 prefix)
		expect(hex).toHaveLength(40);
		expect(hex).toMatch(/^[0-9a-f]{40}$/);
		// Round-trip: hexToBase58 expects the 41-prefixed form
		const roundTripped = hexToBase58(`41${hex}`);
		expect(roundTripped).toBe(CONTRACT);
	});

	it("produces different hex for different addresses", () => {
		const hexOwner = base58ToHex(OWNER);
		const hexContract = base58ToHex(CONTRACT);
		expect(hexOwner).not.toBe(hexContract);
		expect(hexOwner).toHaveLength(40);
		expect(hexContract).toHaveLength(40);
	});

	it("throws on an invalid address (bad checksum)", () => {
		// Corrupt the second-to-last character (keep it valid Base58, just wrong checksum)
		// CONTRACT ends in "Lj6t" — change "6" to "7" to corrupt the checksum
		const corrupted = CONTRACT.slice(0, -2) + "7" + CONTRACT.slice(-1);
		expect(() => base58ToHex(corrupted)).toThrow(/checksum/i);
	});

	it("throws on a string with invalid Base58 characters", () => {
		// '0', 'O', 'I', 'l' are not in the Base58 alphabet
		expect(() => base58ToHex("T0HuVq1oKVruCGLvqVexFs55zKgPzbpEHE")).toThrow(/Invalid Base58/i);
	});
});
