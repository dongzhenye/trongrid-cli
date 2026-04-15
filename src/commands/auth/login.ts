import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { removeApiKey, resolveApiKey, saveApiKey } from "../../auth/store.js";
import { fail, muted, pass, warn } from "../../output/colors.js";

export function registerAuthCommands(parent: Command): void {
	const auth = parent
		.command("auth")
		.description("Authentication")
		.helpGroup("Authentication & Configuration:");

	auth
		.command("login")
		.description("Authenticate with TronGrid API key (interactive)")
		.helpGroup("Credentials:")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid auth login                      # prompts for API key
  $ trongrid auth status                     # check current auth state
  $ trongrid auth logout                     # remove stored credentials
`,
		)
		.action(async () => {
			const rl = createInterface({
				input: process.stdin,
				output: process.stdout,
			});
			try {
				console.log(muted("Get your API key from https://www.trongrid.io/dashboard"));
				const key = await rl.question("API Key: ");

				if (!key.trim()) {
					console.error(fail("Error: API key cannot be empty."));
					process.exit(1);
				}

				saveApiKey(key.trim());
				console.log(pass("Authenticated. API key saved."));
			} finally {
				rl.close();
			}
		});

	auth
		.command("logout")
		.description("Remove stored credentials")
		.helpGroup("Credentials:")
		.action(() => {
			removeApiKey();
			console.log("Credentials removed.");
		});

	auth
		.command("status")
		.description("Show current authentication state")
		.helpGroup("Read commands:")
		.action(() => {
			const key = resolveApiKey();
			if (key) {
				const masked = `${key.slice(0, 4)}...${key.slice(-4)}`;
				console.log(`Authenticated: ${pass(masked)}`);
				console.log(
					muted(
						`Source: ${process.env.TRONGRID_API_KEY ? "TRONGRID_API_KEY env var" : "config file"}`,
					),
				);
			} else {
				console.log(warn("Not authenticated. Using free tier (3 QPS)."));
				console.log(muted('Run "trongrid auth login" to authenticate.'));
			}
		});
}
