import type { Command } from "commander";
import { muted } from "../../output/colors.js";
import { validateAddress } from "../../utils/address.js";
import { CONFIG_KEYS, getConfigValue, readConfig, setConfigValue } from "../../utils/config.js";

export function validateConfigKey(key: string): void {
	if (!(CONFIG_KEYS as Set<string>).has(key)) {
		const known = Array.from(CONFIG_KEYS).join(", ");
		throw new Error(`unknown config key "${key}". Known keys: ${known}.`);
	}
}

export function validateConfigValue(key: string, value: string): void {
	if (key === "default_address") {
		try {
			validateAddress(value);
		} catch (_err) {
			throw new Error(
				`Invalid TRON address for default_address: "${value}". Expected Base58 (T...) or Hex (41...).`,
			);
		}
	}
}

export function registerConfigCommands(parent: Command): void {
	const config = parent.command("config").description("Configuration");

	config
		.command("set")
		.description("Set a config value")
		.argument("<key>", "Config key (e.g., network, default_address)")
		.argument("<value>", "Config value")
		.action((key: string, value: string) => {
			try {
				validateConfigKey(key);
				validateConfigValue(key, value);
			} catch (err) {
				console.error(err instanceof Error ? err.message : String(err));
				process.exit(1);
			}
			setConfigValue(undefined, key, value);
			console.log(`${key} = ${value}`);
		});

	config
		.command("get")
		.description("Get a config value")
		.argument("<key>", "Config key")
		.action((key: string) => {
			const value = getConfigValue(undefined, key);
			if (value !== undefined) {
				console.log(value);
			} else {
				console.log(muted("(not set)"));
			}
		});

	config
		.command("list")
		.description("Show all config values")
		.action(() => {
			const all = readConfig();
			for (const [key, value] of Object.entries(all)) {
				if (value !== undefined) {
					console.log(`${muted(key.padEnd(16))}  ${value}`);
				}
			}
		});
}
