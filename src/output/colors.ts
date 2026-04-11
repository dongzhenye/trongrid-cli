import { styleText } from "node:util";

/**
 * Semantic color tokens for terminal output, based on the seven-token palette
 * recommended by the Google Cloud Tech CLI design article (March 2026) and
 * codified in docs/design/cli-best-practices.md §6.
 *
 * Policy:
 *   - Use these tokens instead of raw `styleText(...)` calls so the palette
 *     stays consistent and light/dark theme audits can happen in one place.
 *   - Reserve color for STATE (pass / warn / fail), not for description.
 *   - Use `muted` for metadata, defaults, hints, and previews.
 *   - Use `accent` for section labels and headers.
 *   - Prefer whitespace over color for hierarchy when both would work.
 *   - `styleText` automatically strips ANSI when stdout is not a TTY, when
 *     `NO_COLOR` is set, or when `--no-color` was passed (wired in preAction
 *     via `applyNoColorFromOptions`), so these tokens degrade gracefully.
 */

/** Landmarks: headers, group titles, section labels. */
export function accent(text: string): string {
	return styleText("cyan", text);
}

/** Scan targets: command names, flag names. */
export function command(text: string): string {
	return styleText("bold", text);
}

/** Success states: completed tasks, authenticated, confirmed. */
export function pass(text: string): string {
	return styleText("green", text);
}

/** Transient states: warnings, pending, "not yet" conditions. */
export function warn(text: string): string {
	return styleText("yellow", text);
}

/** Error states: failures, rejections, invalid input. */
export function fail(text: string): string {
	return styleText("red", text);
}

/** De-emphasis: metadata, defaults, hints, previews, unset values. */
export function muted(text: string): string {
	return styleText("dim", text);
}

/** Unique identifiers: task IDs, contract addresses, transaction hashes. */
export function id(text: string): string {
	return styleText("magenta", text);
}
