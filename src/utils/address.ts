import { createHash } from "node:crypto";
import { UsageError } from "../output/format.js";

const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Lookup table: Base58 char → value (0–57). Invalid chars map to -1. */
const BASE58_DECODE: Int8Array = (() => {
	const table = new Int8Array(256).fill(-1);
	for (let i = 0; i < BASE58_ALPHABET.length; i++) {
		table[BASE58_ALPHABET.charCodeAt(i)] = i;
	}
	return table;
})();

function base58Encode(bytes: Uint8Array): string {
	// Count leading zero bytes → leading '1's in Base58
	let leadingZeros = 0;
	for (const byte of bytes) {
		if (byte === 0) leadingZeros++;
		else break;
	}

	// Convert bytes to a big integer via a simple digit array
	const digits = [0];
	for (const byte of bytes) {
		let carry = byte;
		for (let i = 0; i < digits.length; i++) {
			carry += digits[i] << 8;
			digits[i] = carry % 58;
			carry = Math.floor(carry / 58);
		}
		while (carry > 0) {
			digits.push(carry % 58);
			carry = Math.floor(carry / 58);
		}
	}

	// Build result string: leading 1s + reversed digits
	return (
		"1".repeat(leadingZeros) +
		digits
			.reverse()
			.map((d) => BASE58_ALPHABET[d])
			.join("")
	);
}

/**
 * Convert an EVM hex address to a TRON Base58Check address.
 *
 * Accepts three forms:
 *   - 40-char hex (no prefix): EVM address body, e.g. "a614f803..."
 *   - 40-char hex with 0x prefix:                    "0xa614f803..."
 *   - 42-char hex with TRON 41 prefix:               "41a614f803..."
 */
export function hexToBase58(hex: string): string {
	// Strip 0x / 0X prefix
	let normalized = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;

	if (normalized.length === 40) {
		// Plain EVM address — prepend TRON prefix byte
		normalized = `41${normalized}`;
	} else if (normalized.length === 42 && normalized.startsWith("41")) {
		// Already has TRON prefix — use as-is
	} else {
		throw new Error(
			`Invalid hex address length: expected 40 or 42 chars (with 41 prefix), got ${normalized.length} in "${hex}"`,
		);
	}

	// Hex → bytes (21 bytes: 1 prefix + 20 address)
	const addrBytes = new Uint8Array(21);
	for (let i = 0; i < 21; i++) {
		addrBytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
	}

	// Double SHA256 checksum (first 4 bytes)
	const hash1 = createHash("sha256").update(addrBytes).digest();
	const hash2 = createHash("sha256").update(hash1).digest();
	const checksum = hash2.slice(0, 4);

	// Concatenate address bytes + checksum
	const payload = new Uint8Array(25);
	payload.set(addrBytes);
	payload.set(checksum, 21);

	return base58Encode(payload);
}

/**
 * Convert a TRON Base58Check address to the 20-byte address hex string
 * (without any prefix — suitable for ABI parameter encoding).
 *
 * Algorithm:
 *   1. Base58 decode the 25-byte payload (21-byte address + 4-byte checksum).
 *   2. Verify the checksum (double SHA256 of prefix+address, first 4 bytes).
 *   3. Return bytes [1..20] as a lowercase 40-char hex string (no "41" prefix).
 *
 * Throws a plain Error on malformed input (not UsageError) — callers that
 * need a UsageError should wrap this in validateAddress first.
 */
export function base58ToHex(address: string): string {
	// Base58 decode: variable-length big-integer conversion
	const bytes = [0];
	for (const char of address) {
		const digit = BASE58_DECODE[char.charCodeAt(0)];
		if (digit < 0) {
			throw new Error(`Invalid Base58 character in address: "${char}"`);
		}
		let carry = digit;
		for (let i = 0; i < bytes.length; i++) {
			carry += bytes[i] * 58;
			bytes[i] = carry & 0xff;
			carry >>= 8;
		}
		while (carry > 0) {
			bytes.push(carry & 0xff);
			carry >>= 8;
		}
	}

	// Reverse (big-endian), then prepend leading zeros for leading '1' chars
	// findIndex returns -1 if all chars are '1' (edge case: all-1 address → leadingOnes = address.length)
	const firstNonOne = [...address].findIndex((c) => c !== "1");
	const leadingOnes = firstNonOne === -1 ? address.length : firstNonOne;
	const reversed = bytes.reverse();
	const result = new Uint8Array(leadingOnes + reversed.length);
	for (let i = 0; i < reversed.length; i++) {
		result[leadingOnes + i] = reversed[i];
	}

	// TRON Base58Check payload is always 25 bytes:
	//   byte 0:    0x41 (TRON network prefix)
	//   bytes 1–20: 20-byte address
	//   bytes 21–24: checksum (first 4 bytes of SHA256(SHA256(bytes 0–20)))
	if (result.length !== 25) {
		throw new Error(
			`Invalid TRON address length after decode: got ${result.length} bytes, expected 25`,
		);
	}

	const addrBytes = result.slice(0, 21);
	const checksum = result.slice(21, 25);
	const hash1 = createHash("sha256").update(addrBytes).digest();
	const hash2 = createHash("sha256").update(hash1).digest();
	for (let i = 0; i < 4; i++) {
		if (checksum[i] !== hash2[i]) {
			throw new Error(`Invalid Base58Check checksum for address "${address}"`);
		}
	}

	// Return the 20 address bytes (skip the 0x41 prefix byte) as hex
	return Array.from(result.slice(1, 21))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export function isValidAddress(address: string): boolean {
	if (!address) return false;
	return BASE58_REGEX.test(address) || HEX_REGEX.test(address);
}

export function validateAddress(address: string): string {
	if (!isValidAddress(address)) {
		throw new UsageError(
			`Invalid TRON address format: "${address}". Expected Base58 (T...) or Hex (41...).`,
		);
	}
	return address;
}
