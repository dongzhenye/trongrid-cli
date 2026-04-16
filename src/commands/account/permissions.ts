import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";
import { formatJson, reportErrorAndExit, UsageError } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";

/**
 * TRON permission model. This command deviates intentionally from the
 * Phase D list-command pattern because permissions are grouped by role
 * (owner / active[] / witness?), not a flat homogeneous list. Forcing
 * them through applySort would require flattening to key rows, which
 * loses the permission-as-unit structure that multi-sig audit workflows
 * depend on.
 *
 * JSON shape per a deliberate exception to docs/design/units.md (no S-
 * class applies — no quantity fields). Documented in the Phase D spec
 * under "intentional deviation".
 *
 * --sort-by / --reverse throw UsageError — permissions are not a list.
 */
export interface PermissionKey {
	address: string;
	weight: number;
}

export interface PermissionBlock {
	type: string;
	id?: number;
	permission_name: string;
	threshold: number;
	operations?: string;
	keys: PermissionKey[];
}

export interface AccountPermissions {
	address: string;
	owner: PermissionBlock;
	active: PermissionBlock[];
	witness: PermissionBlock | null;
}

interface RawKey {
	address?: string;
	weight?: number;
}
interface RawPermission {
	type?: string;
	id?: number;
	permission_name?: string;
	threshold?: number;
	operations?: string;
	keys?: RawKey[];
}
interface RawAccount {
	address?: string;
	owner_permission?: RawPermission;
	active_permission?: RawPermission[];
	witness_permission?: RawPermission;
}

export async function fetchAccountPermissions(
	client: ApiClient,
	address: string,
): Promise<AccountPermissions> {
	const raw = await client.post<RawAccount>("/wallet/getaccount", { address, visible: true });

	const ownerRaw = raw.owner_permission;
	if (!ownerRaw) {
		throw new Error(
			`Account not activated or not found: ${address}. Permissions are only defined on activated accounts.`,
		);
	}

	return {
		address: raw.address ?? address,
		owner: parseBlock(ownerRaw, "Owner"),
		active: (raw.active_permission ?? []).map((p, i) => ({ ...parseBlock(p, "Active"), id: i })),
		witness: raw.witness_permission ? parseBlock(raw.witness_permission, "Witness") : null,
	};
}

function parseBlock(raw: RawPermission, type: string): PermissionBlock {
	const keys: PermissionKey[] = (raw.keys ?? []).map((k) => ({
		address: k.address ?? "",
		weight: k.weight ?? 0,
	}));
	// Sort by weight desc inside the block so multi-sig audits read
	// top-weighted keys first. Not user-controllable (--sort-by is
	// already rejected for this command).
	keys.sort((a, b) => b.weight - a.weight);
	return {
		type,
		permission_name: raw.permission_name ?? type.toLowerCase(),
		threshold: raw.threshold ?? 1,
		operations: raw.operations,
		keys,
	};
}

export function renderPermissions(data: AccountPermissions): void {
	const addressNote = data.witness ? "SR account" : "normal account";
	console.log(muted(`Address: ${data.address} (${addressNote})\n`));

	renderBlock("Owner permission", data.owner);
	for (let i = 0; i < data.active.length; i++) {
		console.log("");
		const block = data.active[i];
		if (!block) continue;
		renderBlock(`Active permission #${i} (${block.permission_name})`, block);
	}
	if (data.witness) {
		console.log("");
		renderBlock("Witness permission", data.witness);
	}
}

/**
 * Guard that rejects `--sort-by` / `--reverse` on the permissions command.
 * Exported for testability so the integration suite can exercise the check
 * without spinning up commander. Kept as a one-liner over a boolean-return
 * so callers don't forget to throw.
 */
export function rejectSortFlags(opts: { sortBy?: string; reverse?: boolean }): void {
	if (opts.sortBy !== undefined || opts.reverse) {
		throw new UsageError(
			"--sort-by / --reverse are not supported on account permissions: permissions are structured, not a flat list. Use --json | jq to reorder.",
		);
	}
}

function renderBlock(label: string, block: PermissionBlock): void {
	console.log(muted(`${label}:`));
	console.log(`  threshold: ${block.threshold}`);
	console.log(`  keys:`);
	const cells: string[][] = block.keys.map((k) => [
		`weight ${k.weight}`,
		truncateAddress(k.address, 4, 4),
	]);
	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`    ${line}`);
	}
}

export function registerAccountPermissionsCommand(account: Command, parent: Command): void {
	account
		.command("permissions")
		.description("View multi-sig permission structure (owner / active / witness)")
		.helpGroup("Read commands:")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account permissions TR...
  $ trongrid account permissions                  # uses default_address
  $ trongrid account permissions TR... --json     # structured: { owner, active, witness? }

Note:
  Permissions are structured, not a list.
  --sort-by / --reverse are rejected with a UsageError on this command.
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				rejectSortFlags(opts);
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const data = await fetchAccountPermissions(client, resolved);
				if (opts.json) {
					console.log(formatJson(data, parseFields(opts)));
				} else {
					renderPermissions(data);
				}
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: addressErrorHint(err),
				});
			}
		});
}
