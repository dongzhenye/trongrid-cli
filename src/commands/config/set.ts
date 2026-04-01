import { Command } from "commander";
import {
  setConfigValue,
  getConfigValue,
  readConfig,
} from "../../utils/config.js";
import { styleText } from "node:util";

export function registerConfigCommands(parent: Command): void {
  const config = parent.command("config").description("Configuration");

  config
    .command("set")
    .description("Set a config value")
    .argument("<key>", "Config key (e.g., network)")
    .argument("<value>", "Config value")
    .action((key: string, value: string) => {
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
        console.log(styleText("dim", "(not set)"));
      }
    });

  config
    .command("list")
    .description("Show all config values")
    .action(() => {
      const all = readConfig();
      for (const [key, value] of Object.entries(all)) {
        if (value !== undefined) {
          console.log(`${styleText("dim", key.padEnd(12))}  ${value}`);
        }
      }
    });
}
