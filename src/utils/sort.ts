export type SortDirection = "asc" | "desc";

export interface SortConfig<T> {
	/** Field name used when no --sort-by override is given. */
	defaultField: keyof T & string;
	/** Map of field → inherent default direction. */
	fieldDirections: Readonly<Record<string, SortDirection>>;
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
 * Per Q3 resolution in docs/design/mcp-skills-review.md: each list command
 * declares its default field + per-field inherent directions. --sort-by
 * switches field (using the new field's inherent direction). --reverse
 * flips whatever direction would otherwise apply.
 *
 * Does not mutate `items`. Throws if --sort-by names a field that has no
 * declared direction (prevents silent typo bugs).
 */
export function applySort<T>(
	items: T[],
	config: SortConfig<T>,
	opts: SortOptions,
): T[] {
	if (items.length === 0) return items;

	const field = (opts.sortBy ?? config.defaultField) as keyof T & string;
	const fieldDir = config.fieldDirections[field];
	if (!fieldDir) {
		const known = Object.keys(config.fieldDirections).join(", ");
		throw new Error(
			`Unknown sort field: "${field}". Valid fields for this command: ${known}.`,
		);
	}
	const direction: SortDirection = opts.reverse
		? fieldDir === "asc"
			? "desc"
			: "asc"
		: fieldDir;

	const sorted = [...items].sort((a, b) => {
		const av = a[field];
		const bv = b[field];
		if (av === bv) return 0;
		if (av === undefined || av === null) return 1;
		if (bv === undefined || bv === null) return -1;
		const cmp = av < bv ? -1 : 1;
		return direction === "asc" ? cmp : -cmp;
	});
	return sorted;
}
