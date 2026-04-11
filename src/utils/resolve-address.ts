import { validateAddress } from "./address.js";
import { CONFIG_PATH, getConfigValue } from "./config.js";

/**
 * Resolve an address argument to a concrete, validated TRON address.
 *
 * Priority:
 *   1. If `provided` is non-empty, validate and return it.
 *   2. Otherwise, fall back to `default_address` from config.
 *   3. If neither exists, throw an actionable error naming the fix.
 */
export function resolveAddress(
	provided: string | undefined,
	configPath: string = CONFIG_PATH,
): string {
	if (provided) {
		validateAddress(provided);
		return provided;
	}
	const fallback = getConfigValue(configPath, "default_address");
	if (!fallback) {
		throw new Error(
			"No address provided and no default is configured.\n" +
				"  Pass an address as an argument, or run:\n" +
				"    trongrid config set default_address <addr>",
		);
	}
	validateAddress(fallback);
	return fallback;
}

/**
 * Map an address-related error to an actionable hint string for use in
 * `reportErrorAndExit`. Returns `undefined` when the error is not
 * address-related, so the caller can fall back to other hint sources.
 *
 * Recognized error patterns:
 *   - "Invalid TRON address" (from validateAddress)
 *   - "No address provided" (from resolveAddress with no default)
 */
export function addressErrorHint(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("invalid tron address")) {
		return "Base58 addresses start with T (34 chars); hex addresses start with 41 (42 chars).";
	}
	if (msg.includes("no address provided")) {
		return 'Pass an address as an argument, or run "trongrid config set default_address <addr>".';
	}
	return undefined;
}
