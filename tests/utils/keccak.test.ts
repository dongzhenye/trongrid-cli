import { describe, it, expect } from "bun:test";
import { keccak256, functionSelector } from "../../src/utils/keccak.js";

/** Helper: hex string → Uint8Array */
function hexToBytes(hex: string): Uint8Array {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = Number.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
	}
	return bytes;
}

/** Helper: Uint8Array → lowercase hex string */
function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

describe("keccak256", () => {
	it("hashes empty input correctly", () => {
		const result = keccak256(new Uint8Array(0));
		expect(bytesToHex(result)).toBe(
			"c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
		);
	});

	it('hashes "abc" correctly', () => {
		const input = new TextEncoder().encode("abc");
		const result = keccak256(input);
		expect(bytesToHex(result)).toBe(
			"4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
		);
	});

	it("returns 32 bytes", () => {
		const result = keccak256(new Uint8Array(0));
		expect(result.length).toBe(32);
	});

	it("returns a Uint8Array", () => {
		const result = keccak256(new Uint8Array(0));
		expect(result).toBeInstanceOf(Uint8Array);
	});

	it("handles input longer than one block (136 bytes)", () => {
		// 200 bytes of 0x61 ('a')
		const input = new Uint8Array(200).fill(0x61);
		const result = keccak256(input);
		// Just verify it produces 32 bytes without throwing
		expect(result.length).toBe(32);
	});

	it("handles input exactly one block (136 bytes)", () => {
		const input = new Uint8Array(136).fill(0x42);
		const result = keccak256(input);
		expect(result.length).toBe(32);
	});
});

describe("functionSelector", () => {
	it("computes transfer(address,uint256) selector", () => {
		expect(functionSelector("transfer(address,uint256)")).toBe("0xa9059cbb");
	});

	it("computes balanceOf(address) selector", () => {
		expect(functionSelector("balanceOf(address)")).toBe("0x70a08231");
	});

	it("computes approve(address,uint256) selector", () => {
		expect(functionSelector("approve(address,uint256)")).toBe("0x095ea7b3");
	});

	it("computes allowance(address,address) selector", () => {
		expect(functionSelector("allowance(address,address)")).toBe("0xdd62ed3e");
	});

	it("computes totalSupply() selector", () => {
		expect(functionSelector("totalSupply()")).toBe("0x18160ddd");
	});

	it("returns 0x-prefixed 8-char hex string", () => {
		const result = functionSelector("transfer(address,uint256)");
		expect(result).toMatch(/^0x[0-9a-f]{8}$/);
	});
});
