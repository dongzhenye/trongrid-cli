import { styleText } from "node:util";

export function sunToTrx(sun: number): string {
	const trx = sun / 1_000_000;
	return trx % 1 === 0 ? trx.toFixed(0) : String(trx);
}

export function formatKeyValue(pairs: [string, string][]): string {
	const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
	return pairs
		.map(([key, value]) => `${styleText("dim", key.padEnd(maxKeyLen))}  ${value}`)
		.join("\n");
}

export function formatJson(data: Record<string, unknown>, fields?: string[]): string {
	if (fields && fields.length > 0) {
		const filtered: Record<string, unknown> = {};
		for (const field of fields) {
			if (field in data) {
				filtered[field] = data[field];
			}
		}
		return JSON.stringify(filtered, null, 2);
	}
	return JSON.stringify(data, null, 2);
}

export function printResult(
	data: Record<string, unknown>,
	humanPairs: [string, string][],
	options: { json?: boolean; fields?: string[] },
): void {
	if (options.json) {
		console.log(formatJson(data, options.fields));
	} else {
		console.log(formatKeyValue(humanPairs));
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
