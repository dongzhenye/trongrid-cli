import { UsageError } from "../output/format.js";

export type SortDirection = "asc" | "desc";
export type FieldType = "string" | "number" | "bigint";

export interface SortConfig<T> {
	/** Field name used when no --sort-by override is given. */
	defaultField: keyof T & string;
	/** Map of field → inherent default direction. */
	fieldDirections: Readonly<Record<string, SortDirection>>;
	/**
	 * Per-field comparison type. Missing entries default to "string"
	 * (lexicographic compare). Use "number" for safe-integer fields
	 * (block_number, timestamp, count). Use "bigint" for arbitrary-
	 * precision fields stored as integer strings (token amounts that
	 * may exceed 2^53). For decimal strings (e.g. "1.5"), bigint parse
	 * fails and the comparator falls back to string compare.
	 */
	fieldTypes?: Readonly<Partial<Record<keyof T & string, FieldType>>>;
	/**
	 * Optional secondary sort field applied when the primary comparator
	 * returns 0. Uses its own inherent direction from `fieldDirections`.
	 * Ignored if it equals the active primary field (would be a no-op).
	 */
	tieBreakField?: keyof T & string;
}

export interface SortOptions {
	/** From global flag. Overrides the command's default field. */
	sortBy?: string;
	/** From global flag. Flips the current direction. */
	reverse?: boolean;
}

/**
 * Client-side sort for fetched list results.
 *
 * Per Q3 resolution in docs/designs/mcp-skills-review.md: each list command
 * declares its default field + per-field inherent directions. --sort-by
 * switches field (using the new field's inherent direction). --reverse
 * flips whatever direction would otherwise apply.
 *
 * Does not mutate `items`. Throws if --sort-by names a field that has no
 * declared direction (prevents silent typo bugs).
 */
export function applySort<T>(items: T[], config: SortConfig<T>, opts: SortOptions): T[] {
	if (items.length === 0) return items;

	const field = (opts.sortBy ?? config.defaultField) as keyof T & string;
	const fieldDir = config.fieldDirections[field];
	if (!fieldDir) {
		const known = Object.keys(config.fieldDirections).join(", ");
		throw new UsageError(
			`Unknown sort field: "${field}". Valid fields for this command: ${known}.`,
		);
	}
	const direction: SortDirection = opts.reverse ? (fieldDir === "asc" ? "desc" : "asc") : fieldDir;
	const fieldType: FieldType = config.fieldTypes?.[field] ?? "string";

	const sorted = [...items].sort((a, b) => {
		const primaryCmp = compareField(a, b, field, direction, fieldType);
		if (primaryCmp !== 0) return primaryCmp;

		const tbField = config.tieBreakField;
		if (!tbField || tbField === field) return 0;
		const tbDir = config.fieldDirections[tbField];
		if (!tbDir) return 0;
		const tbType: FieldType = config.fieldTypes?.[tbField] ?? "string";
		return compareField(a, b, tbField, tbDir, tbType);
	});
	return sorted;
}

function compareField<T>(
	a: T,
	b: T,
	field: keyof T & string,
	direction: SortDirection,
	fieldType: FieldType,
): number {
	const av = a[field];
	const bv = b[field];
	if (av === bv) return 0;
	if (av === undefined || av === null) return 1;
	if (bv === undefined || bv === null) return -1;

	let cmp: number;
	if (fieldType === "number") {
		const an = Number(av);
		const bn = Number(bv);
		cmp = an < bn ? -1 : an > bn ? 1 : 0;
	} else if (fieldType === "bigint") {
		try {
			const ab = BigInt(av as string);
			const bb = BigInt(bv as string);
			cmp = ab < bb ? -1 : ab > bb ? 1 : 0;
		} catch {
			// Value isn't a valid integer string (e.g. has a decimal point or
			// non-digit chars). Fall back to string compare so behavior is
			// well-defined rather than throwing inside .sort().
			cmp = av < bv ? -1 : 1;
		}
	} else {
		cmp = av < bv ? -1 : 1;
	}
	return direction === "asc" ? cmp : -cmp;
}
