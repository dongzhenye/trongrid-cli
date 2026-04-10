import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readConfig, writeConfig, getConfigValue, setConfigValue, CONFIG_KEYS } from "../../src/utils/config.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, ".tmp-config-test");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns default config when file does not exist", () => {
    const config = readConfig(join(TEST_DIR, "config.json"));
    expect(config.network).toBe("mainnet");
  });

  it("writes and reads config", () => {
    const path = join(TEST_DIR, "config.json");
    writeConfig(path, { network: "shasta" });
    const config = readConfig(path);
    expect(config.network).toBe("shasta");
  });

  it("sets individual config value", () => {
    const path = join(TEST_DIR, "config.json");
    setConfigValue(path, "network", "nile");
    expect(getConfigValue(path, "network")).toBe("nile");
  });

  it("preserves existing values when setting a new one", () => {
    const path = join(TEST_DIR, "config.json");
    writeConfig(path, { network: "shasta" });
    setConfigValue(path, "network", "nile");
    const config = readConfig(path);
    expect(config.network).toBe("nile");
  });

  it("persists default_address", () => {
    const path = join(TEST_DIR, "config.json");
    setConfigValue(path, "default_address", "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
    expect(getConfigValue(path, "default_address")).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
  });

  it("exposes CONFIG_KEYS as a set of known keys", () => {
    expect(CONFIG_KEYS.has("network")).toBe(true);
    expect(CONFIG_KEYS.has("default_address")).toBe(true);
    expect(CONFIG_KEYS.has("apiKey")).toBe(true);
    expect(CONFIG_KEYS.has("unknown_key")).toBe(false);
  });
});
