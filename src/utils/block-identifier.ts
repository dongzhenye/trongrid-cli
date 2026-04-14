export type BlockIdentifier = { kind: "number"; value: number } | { kind: "hash"; value: string };

const HEX64 = /^[0-9a-fA-F]{64}$/;
const NUMERIC = /^\d+$/;

/**
 * Parse a CLI block identifier into one of two dispatch forms.
 *
 * Accepts:
 *   - Pure numeric string (e.g. "70000000") → block number
 *   - 64-hex-char string, optionally 0x-prefixed, any case → block hash
 *
 * Returns a discriminated union; callers branch on `kind`.
 */
export function detectBlockIdentifier(input: string): BlockIdentifier {
	if (!input) {
		throw new Error("Block identifier required: pass a number or hash.");
	}
	// Check hex (64-char, optionally 0x-prefixed) BEFORE numeric so that a
	// 64-digit all-decimal string (e.g. "000...000") is classified as a hash,
	// not a block number. Block numbers in practice are at most 10 digits.
	const stripped = input.startsWith("0x") || input.startsWith("0X") ? input.slice(2) : input;
	if (HEX64.test(stripped)) {
		return { kind: "hash", value: stripped.toLowerCase() };
	}
	// Inputs of 16+ chars that aren't valid 64-char hashes look like malformed
	// hashes (e.g. 63 hex chars), not block numbers. Reject them explicitly so
	// the user gets a useful error rather than a silently wrong block lookup.
	if (stripped.length >= 16) {
		throw new Error(
			`Invalid block identifier: "${input}". Expected a block number (digits) or block hash (64 hex chars, optional 0x prefix).`,
		);
	}
	if (NUMERIC.test(input)) {
		return { kind: "number", value: Number.parseInt(input, 10) };
	}
	throw new Error(
		`Invalid block identifier: "${input}". Expected a block number (digits) or block hash (64 hex chars, optional 0x prefix).`,
	);
}
