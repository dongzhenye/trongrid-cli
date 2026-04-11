/**
 * Apply the global `--no-color` flag by setting `NO_COLOR` in the environment.
 * `node:util`'s `styleText` reads `NO_COLOR` at call time and suppresses ANSI
 * codes when set, so this must fire before any command action renders output.
 *
 * Commander.js auto-inverts `--no-color` into `opts.color === false`; passing
 * no flag leaves `opts.color` as `true` (default) and we do not touch the env.
 */
export function applyNoColorFromOptions(opts: { color?: boolean }): void {
	if (opts.color === false) {
		process.env.NO_COLOR = "1";
	}
}
