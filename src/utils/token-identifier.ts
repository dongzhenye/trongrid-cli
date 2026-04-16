import { UsageError } from "../output/format.js";
import { resolveSymbolToAddress } from "./tokens.js";

export type TokenIdentifier =
	| { kind: "trc10"; assetId: string }
	| { kind: "trc20"; address: string };

export type TokenTypeOverride = "trc10" | "trc20" | "trc721" | "trc1155";

const TRC10_NUMERIC = /^\d{1,7}$/;
const BASE58_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_ADDR_0X = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

/**
 * Parse a CLI token identifier into a dispatch form.
 *
 * Accepts:
 *   - 1–7 digit numeric → TRC-10 asset ID
 *   - 34-char Base58 starting with T → TRC-20 contract address
 *   - Symbol string → resolved via STATIC_SYMBOL_TO_ADDRESS (verified tokens only)
 *
 * Rejects:
 *   - 0x-prefixed 40-hex — deferred support (needs Base58check conversion)
 *   - Unknown symbols (never fall back to raw input — phishing guard)
 *   - TRC-721 / TRC-1155 — not yet implemented
 *
 * `typeOverride` forces the interpretation for ambiguous inputs (e.g. a
 * short-numeric symbol that collides with a TRC-10 ID).
 */
export function detectTokenIdentifier(
	input: string,
	typeOverride?: TokenTypeOverride,
): TokenIdentifier {
	if (!input) {
		throw new UsageError(
			"Token identifier required: pass an asset ID, contract address, or symbol.",
		);
	}

	if (typeOverride === "trc721" || typeOverride === "trc1155") {
		throw new UsageError(
			`${typeOverride.toUpperCase()} is not yet implemented. Wave 1 supports TRC-10 and TRC-20 only.`,
		);
	}

	if (HEX_ADDR_0X.test(input)) {
		throw new UsageError(
			`0x-prefixed hex addresses are not yet supported in Wave 1. Pass the Base58 address (T...) instead.`,
		);
	}

	if (typeOverride === "trc10") {
		if (!TRC10_NUMERIC.test(input)) {
			throw new UsageError(`Invalid TRC-10 asset ID: "${input}". Expected 1–7 digits.`);
		}
		return { kind: "trc10", assetId: input };
	}

	if (typeOverride === "trc20") {
		if (!BASE58_ADDR.test(input)) {
			throw new UsageError(
				`Invalid TRC-20 address: "${input}". Expected 34-char Base58 starting with T.`,
			);
		}
		return { kind: "trc20", address: input };
	}

	if (TRC10_NUMERIC.test(input)) {
		return { kind: "trc10", assetId: input };
	}
	if (BASE58_ADDR.test(input)) {
		return { kind: "trc20", address: input };
	}
	if (SYMBOL.test(input)) {
		const addr = resolveSymbolToAddress(input);
		if (!addr) {
			throw new UsageError(
				`Unknown token symbol: "${input}". Pass the contract address directly, or see docs/design/commands.md for the list of verified symbols.`,
			);
		}
		return { kind: "trc20", address: addr };
	}

	throw new UsageError(
		`Invalid token identifier: "${input}". Expected a TRC-10 asset ID (1–7 digits), a TRC-20 Base58 address (T...), or a known token symbol.`,
	);
}
