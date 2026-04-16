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
 *
 * Color suppression: `shouldStrip()` runs at every call. Strips when:
 *   - `NO_COLOR` env var is set (per the no-color.org standard, also wired
 *     by `--no-color` via `applyNoColorFromOptions` in the preAction hook),
 *   - stdout is not a TTY (output is being piped or redirected).
 *
 * Why an explicit guard rather than trusting `node:util` `styleText`:
 * Bun 1.3.x's polyfill of `styleText` does NOT honor `NO_COLOR` or
 * detect non-TTY stdout — it always emits ANSI. Node 22+ does both
 * correctly. The guard keeps behavior portable across both runtimes
 * so dev (`bun run`) matches prod (`node` via npm install).
 */

function shouldStrip(): boolean {
	if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return true;
	// `isTTY` is `true` only when stdout is an interactive terminal; it is
	// `undefined` (not `false`) when piped or redirected. So strip whenever
	// it is not strictly `true`.
	if (process.stdout.isTTY !== true) return true;
	return false;
}

/** Landmarks: headers, group titles, section labels. */
export function accent(text: string): string {
	return shouldStrip() ? text : styleText("cyan", text);
}

/** Scan targets: command names, flag names. */
export function command(text: string): string {
	return shouldStrip() ? text : styleText("bold", text);
}

/** Success states: completed tasks, authenticated, confirmed. */
export function pass(text: string): string {
	return shouldStrip() ? text : styleText("green", text);
}

/** Transient states: warnings, pending, "not yet" conditions. */
export function warn(text: string): string {
	return shouldStrip() ? text : styleText("yellow", text);
}

/** Error states: failures, rejections, invalid input. */
export function fail(text: string): string {
	return shouldStrip() ? text : styleText("red", text);
}

/** De-emphasis: metadata, defaults, hints, previews, unset values. */
export function muted(text: string): string {
	return shouldStrip() ? text : styleText("dim", text);
}

/** Unique identifiers: task IDs, contract addresses, transaction hashes. */
export function id(text: string): string {
	return shouldStrip() ? text : styleText("magenta", text);
}
