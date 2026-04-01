import { readConfig, writeConfig, CONFIG_PATH } from "../utils/config.js";

export function resolveApiKey(configPath: string = CONFIG_PATH): string | undefined {
  const envKey = process.env.TRONGRID_API_KEY;
  if (envKey) return envKey;

  const config = readConfig(configPath);
  return config.apiKey;
}

export function saveApiKey(
  key: string,
  configPath: string = CONFIG_PATH,
): void {
  writeConfig(configPath, { apiKey: key });
}

export function removeApiKey(configPath: string = CONFIG_PATH): void {
  writeConfig(configPath, { apiKey: undefined });
}
