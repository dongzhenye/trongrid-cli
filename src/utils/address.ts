import { createHash } from "node:crypto";
import { UsageError } from "../output/format.js";

const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
