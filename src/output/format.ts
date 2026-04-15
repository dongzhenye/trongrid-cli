import { TrongridError } from "../api/client.js";
import { fail, muted } from "./colors.js";

/**
 * Marker error for malformed user input — bad flag value, unknown
 * sort field, etc. Mapped to exit code 2 by `reportErrorAndExit` per
 * the deterministic exit code scheme in cli-best-practices.md §4.
 *
 * Distinct from a runtime error (exit 1) so agent callers can decide
 * not to retry: usage errors will never succeed on retry without a
 * change to the invocation itself. See AGENTS.md §2 for the contract.
 */
export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UsageError";
	}
}

/**
 * Format a Unix-millisecond timestamp for human-mode output.
 *
 * Returns `YYYY-MM-DD HH:MM:SS UTC` — ISO 8601 derived, but with the
 * `T` separator replaced by a space, milliseconds dropped, and the `Z`
 * suffix written explicitly as `UTC` so non-technical readers see the
 * timezone without having to recognize Zulu-time notation.
 *
 * Always UTC: blockchain timestamps are global and consumers cross-
 * reference TronScan / Etherscan, both of which default to UTC. Local
 * time would produce different output across machines for the same
 * query — bad for diff / cache / agent reproducibility.
 *
 * `--json` mode preserves the raw integer (the machine contract); this
 * helper is exclusively for human rendering.
 */
export function formatTimestamp(ms: number): string {
	// toISOString → "2022-08-11T17:00:30.000Z" → drop ms+Z, swap T→space, append UTC.
	return `${new Date(ms).toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function sunToTrx(sun: number): string {
	const sign = sun < 0 ? "-" : "";
	const abs = Math.abs(sun);
	const whole = Math.trunc(abs / 1_000_000);
	const frac = abs % 1_000_000;
	if (frac === 0) return `${sign}${whole}`;
	const fracStr = String(frac).padStart(6, "0").replace(/0+$/, "");
	return `${sign}${whole}.${fracStr}`;
}

export function formatKeyValue(pairs: [string, string][]): string {
	const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
	return pairs.map(([key, value]) => `${muted(key.padEnd(maxKeyLen))}  ${value}`).join("\n");
}

export function formatJson<T extends object>(data: T, fields?: string[]): string {
	if (fields && fields.length > 0) {
		// Dynamic key lookup requires a Record view. Typed callers keep their
		// precise types at the API boundary; the cast is contained here.
		const source = data as Record<string, unknown>;
		const filtered: Record<string, unknown> = {};
		for (const field of fields) {
			if (field in source) {
				filtered[field] = source[field];
			}
		}
		return JSON.stringify(filtered, null, 2);
	}
	return JSON.stringify(data, null, 2);
}

export function printResult<T extends object>(
	data: T,
	humanPairs: [string, string][],
	options: { json?: boolean; fields?: string[] },
): void {
	if (options.json) {
		console.log(formatJson(data, options.fields));
	} else {
		console.log(formatKeyValue(humanPairs));
	}
}

export function formatJsonList<T extends object>(items: T[], fields?: string[]): string {
	if (fields && fields.length > 0) {
		const filtered = items.map((item) => {
			const source = item as Record<string, unknown>;
			const out: Record<string, unknown> = {};
			for (const field of fields) {
				if (field in source) out[field] = source[field];
			}
			return out;
		});
		return JSON.stringify(filtered, null, 2);
	}
	return JSON.stringify(items, null, 2);
}

/**
 * List counterpart of {@link printResult}. Handles JSON mode generically
 * (array serialization + per-item field filtering) and delegates human mode
 * to a caller-supplied renderer, which has full control over empty-state
 * messaging, per-row formatting, and any summary line. Pulled out of
 * `account tokens` so future list commands can share the JSON branch.
 */
export function printListResult<T extends object>(
	items: T[],
	renderHuman: (items: T[]) => void,
	options: { json?: boolean; fields?: string[] },
): void {
	if (options.json) {
		console.log(formatJsonList(items, options.fields));
	} else {
		renderHuman(items);
	}
}

export function printError(
	message: string,
	options: {
		json?: boolean;
		verbose?: boolean;
		upstream?: unknown;
		hint?: string;
	},
): void {
	if (options.json) {
		const err: Record<string, unknown> = { error: message };
		if (options.hint) err.hint = options.hint;
		if (options.upstream) err.upstream = options.upstream;
		console.error(JSON.stringify(err, null, 2));
	} else {
		console.error(fail(`Error: ${message}`));
		if (options.hint) {
			console.error(muted(`Hint: ${options.hint}`));
		}
		if (options.verbose && options.upstream) {
			console.error(muted(JSON.stringify(options.upstream, null, 2)));
		}
	}
}

/**
 * Default hint for common {@link TrongridError} shapes. Caller-supplied hints
 * always win; this fallback fires only when the caller did not pass an
 * explicit hint and the error is a network / auth / rate-limit case.
 */
function defaultHintFor(err: unknown): string | undefined {
	if (!(err instanceof TrongridError)) return undefined;
	if (err.status === 0) {
		return "Check your internet connection or try a different --network. Run with --verbose for details.";
	}
	if (err.status === 401 || err.status === 403) {
		return 'Run "trongrid auth login" to set a valid API key, or pass --api-key <key> for one-time use.';
	}
	if (err.status === 429) {
		return 'Rate limited. Run "trongrid auth login" for 5x higher limits.';
	}
	return undefined;
}

/**
 * Print an error and exit with a deterministic code, per scheme in
 * `docs/design/cli-best-practices.md` §4.
 *
 *   - {@link UsageError} → 2 (usage error — bad flag value, unknown field)
 *   - {@link TrongridError} → `err.exitCode` (3 for network / auth, 1 otherwise)
 *   - Any other error → 1 (general)
 *
 * The caller passes a contextual `hint` so the rendered output includes an
 * actionable next step. If no hint is passed and the error is a common
 * network / auth / rate-limit case, a reasonable default is used.
 *
 * This helper replaces the old `printError(...); process.exit(1)`
 * boilerplate at every command action's catch block.
 */
export function reportErrorAndExit(
	err: unknown,
	options: { json?: boolean; verbose?: boolean; hint?: string },
): never {
	const message = err instanceof Error ? err.message : String(err);
	const upstream =
		err instanceof TrongridError ? err.upstream : (err as { upstream?: unknown }).upstream;
	const hint = options.hint ?? defaultHintFor(err);
	printError(message, {
		json: options.json,
		verbose: options.verbose,
		upstream,
		hint,
	});
	const exitCode = resolveExitCode(err);
	process.exit(exitCode);
}

function resolveExitCode(err: unknown): number {
	if (err instanceof UsageError) return 2;
	if (err instanceof TrongridError) return err.exitCode;
	return 1;
}
