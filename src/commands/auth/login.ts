import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import type { Command } from "commander";
import { removeApiKey, resolveApiKey, saveApiKey } from "../../auth/store.js";

export function registerAuthCommands(parent: Command): void {
	const auth = parent.command("auth").description("Authentication");

	auth
		.command("login")
		.description("Authenticate with TronGrid API key")
		.action(async () => {
			const rl = createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			try {
				console.log(styleText("dim", "Get your API key from https://www.trongrid.io/dashboard"));
				const key = await rl.question("API Key: ");

				if (!key.trim()) {
					console.error(styleText("red", "Error: API key cannot be empty."));
					process.exit(1);
				}

				saveApiKey(key.trim());
				console.log(styleText("green", "Authenticated. API key saved."));
			} finally {
				rl.close();
			}
		});

	auth
		.command("logout")
		.description("Remove stored credentials")
		.action(() => {
			removeApiKey();
			console.log("Credentials removed.");
		});

	auth
		.command("status")
		.description("Show current authentication state")
		.action(() => {
			const key = resolveApiKey();
			if (key) {
				const masked = `${key.slice(0, 4)}...${key.slice(-4)}`;
				console.log(`Authenticated: ${styleText("green", masked)}`);
				console.log(
					styleText(
						"dim",
						`Source: ${process.env.TRONGRID_API_KEY ? "TRONGRID_API_KEY env var" : "config file"}`,
					),
				);
			} else {
				console.log(styleText("yellow", "Not authenticated. Using free tier (3 QPS)."));
				console.log(styleText("dim", 'Run "trongrid auth login" to authenticate.'));
			}
		});
}
