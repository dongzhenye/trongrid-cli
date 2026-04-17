/**
 * Single source of truth for the CLI version.
 *
 * Used by:
 * - `src/index.ts` — wires `--version` flag via commander
 * - `src/api/client.ts` — sends as `User-Agent: trongrid-cli/<version>` header
 *
 * Must stay in sync with `package.json` `version` field (manual sync at release time).
 * Bump procedure: edit this file + package.json together; never one without the other.
 */
export const VERSION = "0.1.1";
