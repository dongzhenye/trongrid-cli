import { styleText } from "node:util";

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
	return pairs
		.map(([key, value]) => `${styleText("dim", key.padEnd(maxKeyLen))}  ${value}`)
		.join("\n");
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
	options: { json?: boolean; verbose?: boolean; upstream?: unknown },
): void {
	if (options.json) {
		const err: Record<string, unknown> = { error: message };
		if (options.upstream) err.upstream = options.upstream;
		console.error(JSON.stringify(err, null, 2));
	} else {
		console.error(styleText("red", `Error: ${message}`));
		if (options.verbose && options.upstream) {
			console.error(styleText("dim", JSON.stringify(options.upstream, null, 2)));
		}
	}
}
