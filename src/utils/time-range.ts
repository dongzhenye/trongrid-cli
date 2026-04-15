import { UsageError } from "../output/format.js";

/**
 * Parse `--before` / `--after` CLI flags into a timestamp range in
 * unix milliseconds (TronGrid's `min_timestamp` / `max_timestamp`
 * query parameters use milliseconds).
 *
 * Accepted input forms:
 *   - Unix seconds: 1–12 digit decimal string (e.g. "1744694400")
 *   - ISO-8601 datetime: "2026-04-15T00:00:00Z" etc.
 *   - ISO-8601 date: "2026-04-15" (treated as UTC midnight)
 *
 * Deliberate rejections (with hints):
 *   - 13-digit unix values (would be milliseconds, ambiguous with seconds)
 *   - Unparseable strings
 *   - Inverted ranges (before < after)
 */
export function parseTimeRange(
	before: string | undefined,
	after: string | undefined,
): { minTimestamp?: number; maxTimestamp?: number } {
	const result: { minTimestamp?: number; maxTimestamp?: number } = {};
	if (before !== undefined) {
		result.maxTimestamp = parseOne(before, "--before");
	}
	if (after !== undefined) {
		result.minTimestamp = parseOne(after, "--after");
	}
	if (
		result.minTimestamp !== undefined &&
		result.maxTimestamp !== undefined &&
		result.minTimestamp >= result.maxTimestamp
	) {
		throw new UsageError(
			`Inverted time range: --after (${after}) must be earlier than --before (${before}).`,
		);
	}
	return result;
}

function parseOne(input: string, flagName: string): number {
	// Unix seconds: 1-12 decimal digits. 13+ digits would be milliseconds
	// or nonsense; reject both to avoid silent magnitude errors.
	if (/^\d{1,12}$/.test(input)) {
		return Number.parseInt(input, 10) * 1000;
	}
	if (/^\d{13,}$/.test(input)) {
		throw new UsageError(
			`${flagName} value "${input}" looks like unix milliseconds. Pass seconds (10 digits) or an ISO-8601 date like "2026-04-15" instead.`,
		);
	}
	// ISO-8601 (Date constructor handles both "2026-04-15" and full datetime)
	const ms = Date.parse(input);
	if (Number.isNaN(ms)) {
		throw new UsageError(
			`${flagName} value "${input}" is not a valid timestamp. Use unix seconds or ISO-8601 (e.g. "2026-04-15" or "2026-04-15T12:00:00Z").`,
		);
	}
	return ms;
}
