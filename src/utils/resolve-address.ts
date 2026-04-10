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
