import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface TrongridConfig {
	network: string;
	apiKey?: string;
	default_address?: string;
}

const DEFAULT_CONFIG: TrongridConfig = {
	network: "mainnet",
};

export const CONFIG_KEYS = new Set<keyof TrongridConfig>([
	"network",
	"apiKey",
	"default_address",
]);

export const CONFIG_DIR = join(homedir(), ".config", "trongrid");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function readConfig(path: string = CONFIG_PATH): TrongridConfig {
	try {
		const raw = readFileSync(path, "utf-8");
		return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
	} catch {
		return { ...DEFAULT_CONFIG };
	}
}

export function writeConfig(path: string = CONFIG_PATH, config: Partial<TrongridConfig>): void {
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });
	const existing = readConfig(path);
	const merged = { ...existing, ...config };
	writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
}

export function getConfigValue(path: string = CONFIG_PATH, key: string): string | undefined {
	const config = readConfig(path);
	return config[key as keyof TrongridConfig] as string | undefined;
}

export function setConfigValue(path: string = CONFIG_PATH, key: string, value: string): void {
	writeConfig(path, { [key]: value });
}
