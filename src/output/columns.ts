/**
 * Atomic column-alignment primitives for human-mode list renders.
 *
 * Layer 1 of the three-layer output architecture (atomic → list-essence
 * → command). Deliberately semantic-agnostic: no "counterparty" or
 * "direction" notions — those belong to Layer-2 renderers in the
 * sibling files (e.g. src/output/transfers.ts).
 *
 * Alignment rules (from memory feedback_human_render_alignment):
 *   - Number: right-aligned to max width in batch (decimal points stack)
 *   - Unit: left-aligned, 1-space gap from number (adjacent)
 *   - Address: both-ends truncated form (4+4 default)
 *   - Inter-column separator: 2 spaces (distinguishes from in-column 1-space)
 *
 * ANSI awareness: all width computation uses {@link visibleLength} so
 * that color codes (e.g. from `muted()`) don't inflate column widths.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape detection requires control chars
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Visible (printed) length of a string, stripping ANSI escape sequences.
 * Use this instead of `str.length` when computing column alignment.
 */
export function visibleLength(str: string): number {
	return str.replace(ANSI_RE, "").length;
}

/**
 * Insert US-convention thousands separators into a decimal string.
 * Only affects the integer part; fractional digits are untouched.
 *
 * "16809182.347903" → "16,809,182.347903"
 * "42" → "42" (no change under 4 digits)
 *
 * Human-mode only — JSON fields keep raw strings (machine contract).
 */
export function addThousandsSep(numStr: string): string {
	const negative = numStr.startsWith("-");
	const abs = negative ? numStr.slice(1) : numStr;
	const dotIdx = abs.indexOf(".");
	const intPart = dotIdx >= 0 ? abs.slice(0, dotIdx) : abs;
	const fracPart = dotIdx >= 0 ? abs.slice(dotIdx) : "";
	const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	const result = withCommas + fracPart;
	return negative ? `-${result}` : result;
}

/**
 * Right-align a numeric string to a fixed width with space padding.
 * Overlong values are returned unchanged — caller is responsible for
 * ensuring the requested width fits the widest value (typically via
 * computeColumnWidths).
 */
export function alignNumber(value: string, width: number): string {
	const vLen = visibleLength(value);
	if (vLen >= width) return value;
	return " ".repeat(width - vLen) + value;
}

/**
 * Align text to a fixed width. Default left-align suits categorical
 * columns (direction labels, resource types). Right-align is for any
 * numeric context that is not a magnitude (counts, indices).
 */
export function alignText(value: string, width: number, side: "left" | "right" = "left"): string {
	const vLen = visibleLength(value);
	if (vLen >= width) return value;
	const pad = " ".repeat(width - vLen);
	return side === "right" ? pad + value : value + pad;
}

/**
 * Both-ends truncated form: head chars, `...`, tail chars.
 * Default 6+6 for addresses — minimum safe display to prevent
 * spoofing attacks where an attacker creates addresses with matching
 * first/last chars. TX hashes are not spoofable and can use shorter
 * truncation (callers pass explicit 4+4 for tx_id).
 * Strings shorter than head+tail+3 are returned unchanged.
 */
export function truncateAddress(addr: string, head = 6, tail = 6): string {
	if (addr.length <= head + tail + 3) return addr;
	return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

/**
 * Given a rectangular 2D array of cells, compute the max width of each
 * column. Cells are counted by their rendered length; callers should
 * pre-format (apply colors, truncation, etc.) and pass the final strings.
 */
export function computeColumnWidths(rows: string[][]): number[] {
	if (rows.length === 0) return [];
	const ncols = rows[0]?.length ?? 0;
	const widths = new Array<number>(ncols).fill(0);
	for (const row of rows) {
		for (let i = 0; i < ncols; i++) {
			const cell = row[i] ?? "";
			const current = widths[i] ?? 0;
			const vLen = visibleLength(cell);
			if (vLen > current) widths[i] = vLen;
		}
	}
	return widths;
}

/**
 * Pad each cell to the corresponding column width, then join with the
 * inter-column separator. Returns one formatted line per input row.
 *
 * Default separator is 2 spaces per memory feedback_human_render_alignment
 * (distinguishes inter-column gap from in-column 1-space).
 */
export function renderColumns(
	rows: string[][],
	widths: number[],
	separator: string = "  ",
): string[] {
	return rows.map((row) =>
		row.map((cell, i) => alignText(cell, widths[i] ?? cell.length)).join(separator),
	);
}
