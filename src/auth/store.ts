import { CONFIG_PATH, readConfig, writeConfig } from "../utils/config.js";

/**
 * Resolve the TronGrid API key to use for an outgoing request.
 *
 * Priority (highest first):
 *   1. `inlineKey` — a key passed explicitly per-command via the `--api-key`
 *      flag. Intended for agent orchestration where credentials are injected
 *      stateless per-invocation. Do NOT use from an interactive shell —
 *      values appear in shell history and `ps aux` output.
 *   2. `TRONGRID_API_KEY` environment variable — the recommended shell
 *      override; does not touch disk, scoped to the process.
 *   3. Stored config file (`~/.config/trongrid/config.json`) — set once via
 *      `trongrid auth login`.
 *   4. `undefined` — no auth; the API client runs at the 3 QPS free tier.
 */
export function resolveApiKey(
	options: { inlineKey?: string; configPath?: string } = {},
): string | undefined {
	if (options.inlineKey) return options.inlineKey;

	const envKey = process.env.TRONGRID_API_KEY;
	if (envKey) return envKey;

	const config = readConfig(options.configPath ?? CONFIG_PATH);
	return config.apiKey;
}

export function saveApiKey(key: string, configPath: string = CONFIG_PATH): void {
	writeConfig(configPath, { apiKey: key });
}

export function removeApiKey(configPath: string = CONFIG_PATH): void {
	writeConfig(configPath, { apiKey: undefined });
}
