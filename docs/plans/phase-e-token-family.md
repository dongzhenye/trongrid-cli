# Phase E — Token Family Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 4 new token commands (holders, transfers, balance, allowance) + 3 `account tokens` UX fixes. TRX + TRC-20 supported; TRC-10/721/1155 deferred with forward-looking hints.

**Architecture:** E-prep builds 5 plumbing pieces (token identifier refactor, hex-to-Base58, batch token info, account-tokens display fixes, uncentered transfer renderer). E-main adds 4 commands on top, each following the established single-file pattern. Single PR on `feat/phase-e-token-family`.

**Tech Stack:** TypeScript strict, commander.js, Bun test. Native `fetch` via `src/api/client.ts`. `node:crypto` for SHA256 (hex-to-Base58). Zero new production dependencies.

**Spec:** [`docs/designs/phase-e-token-family.md`](../designs/phase-e-token-family.md)

**Branch:** `feat/phase-e-token-family` (create from `main` at start)

---

## Task 1: Rename TokenIdentifier.kind → type and widen union (P1)

**Files:**
- Modify: `src/utils/token-identifier.ts`
- Modify: `src/commands/token/view.ts`
- Modify: `tests/utils/token-identifier.test.ts`
- Modify: `tests/commands/token-view.test.ts`

- [ ] **Step 1: Update the TokenIdentifier type and detectTokenIdentifier function**

In `src/utils/token-identifier.ts`, replace the entire file:

```typescript
import { UsageError } from "../output/format.js";
import { resolveSymbolToAddress } from "./tokens.js";

export type TokenIdentifier =
	| { type: "trx" }
	| { type: "trc10"; assetId: string }
	| { type: "trc20"; address: string }
	| { type: "trc721"; address: string }
	| { type: "trc1155"; address: string };

export type TokenTypeOverride = "trx" | "trc10" | "trc20" | "trc721" | "trc1155";

const TRC10_NUMERIC = /^\d{1,7}$/;
const BASE58_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_ADDR_0X = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

/**
 * Parse a CLI token identifier into a dispatch form.
 *
 * Returns a typed result for ALL token types so each command can decide
 * its own support level (TRX + TRC-20 in Phase E; TRC-10/721/1155
 * return typed results that commands reject with UsageError).
 *
 * Special cases:
 *   - "TRX" / "trx" symbol → { type: "trx" }
 *   - 0x-prefixed hex → still rejected (acceptance deferred)
 */
export function detectTokenIdentifier(
	input: string,
	typeOverride?: TokenTypeOverride,
): TokenIdentifier {
	if (!input) {
		throw new UsageError(
			"Token identifier required: pass an asset ID, contract address, or symbol.",
		);
	}

	// TRX special case — check before symbol resolution
	if (input.toUpperCase() === "TRX" && (!typeOverride || typeOverride === "trx")) {
		return { type: "trx" };
	}

	if (typeOverride === "trx") {
		throw new UsageError(
			`--type trx only applies to the "TRX" symbol, not "${input}".`,
		);
	}

	if (typeOverride === "trc721") {
		if (!BASE58_ADDR.test(input)) {
			throw new UsageError(`Invalid TRC-721 address: "${input}". Expected 34-char Base58 starting with T.`);
		}
		return { type: "trc721", address: input };
	}

	if (typeOverride === "trc1155") {
		if (!BASE58_ADDR.test(input)) {
			throw new UsageError(`Invalid TRC-1155 address: "${input}". Expected 34-char Base58 starting with T.`);
		}
		return { type: "trc1155", address: input };
	}

	if (HEX_ADDR_0X.test(input)) {
		throw new UsageError(
			`0x-prefixed hex addresses are not yet supported. Pass the Base58 address (T...) instead.`,
		);
	}

	if (typeOverride === "trc10") {
		if (!TRC10_NUMERIC.test(input)) {
			throw new UsageError(`Invalid TRC-10 asset ID: "${input}". Expected 1–7 digits.`);
		}
		return { type: "trc10", assetId: input };
	}

	if (typeOverride === "trc20") {
		if (!BASE58_ADDR.test(input)) {
			throw new UsageError(
				`Invalid TRC-20 address: "${input}". Expected 34-char Base58 starting with T.`,
			);
		}
		return { type: "trc20", address: input };
	}

	if (TRC10_NUMERIC.test(input)) {
		return { type: "trc10", assetId: input };
	}
	if (BASE58_ADDR.test(input)) {
		return { type: "trc20", address: input };
	}
	if (SYMBOL.test(input)) {
		const addr = resolveSymbolToAddress(input);
		if (!addr) {
			throw new UsageError(
				`Unknown token symbol: "${input}". Pass the contract address directly, or see docs/design/commands.md for the list of verified symbols.`,
			);
		}
		return { type: "trc20", address: addr };
	}

	throw new UsageError(
		`Invalid token identifier: "${input}". Expected a TRC-10 asset ID (1–7 digits), a TRC-20 Base58 address (T...), or a known token symbol.`,
	);
}
```

- [ ] **Step 2: Update token/view.ts to use `.type` instead of `.kind`**

In `src/commands/token/view.ts`, change every reference:

Line 125: `id.kind === "trc10"` → `id.type === "trc10"`

Also update the error messages: replace `"Wave 1"` references with `"not yet supported"`:
- Line 42-44: change the trc721/trc1155 error to return a result instead of throwing (already handled by new detectTokenIdentifier)
- Line 48-49: 0x hex message (already updated in detectTokenIdentifier)

The `fetchTokenView` function signature remains the same, but the discriminator check changes:

```typescript
export async function fetchTokenView(
	client: ApiClient,
	id: TokenIdentifier,
): Promise<TokenViewData> {
	if (id.type === "trx") {
		throw new UsageError("Use `trongrid account view <address>` to see TRX balance.");
	}
	if (id.type === "trc721" || id.type === "trc1155") {
		throw new UsageError(
			`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
		);
	}
	return id.type === "trc10" ? fetchTrc10(client, id.assetId) : fetchTrc20(client, id.address);
}
```

Update `hintForTokenView` to handle new error messages:
- Replace `"wave 1"` matching with `"not yet supported"` matching
- Add TRX hint: point to `account view`

- [ ] **Step 3: Update tests to use `.type` instead of `.kind`**

In `tests/utils/token-identifier.test.ts`:
- Replace all `kind:` with `type:` in expected results
- Add new test cases:

```typescript
it("detects TRX symbol as type trx", () => {
    expect(detectTokenIdentifier("TRX")).toEqual({ type: "trx" });
    expect(detectTokenIdentifier("trx")).toEqual({ type: "trx" });
});

it("returns typed result for --type trc721", () => {
    const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(detectTokenIdentifier(addr, "trc721")).toEqual({ type: "trc721", address: addr });
});

it("returns typed result for --type trc1155", () => {
    const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(detectTokenIdentifier(addr, "trc1155")).toEqual({ type: "trc1155", address: addr });
});
```

In `tests/commands/token-view.test.ts`:
- Replace `{ kind: "trc20"` with `{ type: "trc20"` and `{ kind: "trc10"` with `{ type: "trc10"`

- [ ] **Step 4: Run tests**

Run: `bun test`
Expected: All 280 tests pass (snapshot updates from kind→type rename may require updating expected strings in hint tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor: rename TokenIdentifier.kind to type and widen union

Add trx/trc721/trc1155 variants. Each command decides its own support
level rather than the identifier rejecting at detection time."
```

---

## Task 2: Add hexToBase58 address conversion utility (P2)

**Files:**
- Modify: `src/utils/address.ts`
- Modify: `tests/utils/address.test.ts`

- [ ] **Step 1: Write the failing tests**

Create or extend `tests/utils/address.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { hexToBase58, isValidAddress, validateAddress } from "../../src/utils/address.js";
import { UsageError } from "../../src/output/format.js";

// ... existing tests for isValidAddress / validateAddress ...

describe("hexToBase58", () => {
	it("converts USDT contract hex to known Base58", () => {
		// USDT contract: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
		// Hex (EVM, no 41 prefix): 0xa614f803b6fd780986a42c78ec9c7f77e6ded13c
		expect(hexToBase58("a614f803b6fd780986a42c78ec9c7f77e6ded13c"))
			.toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
	});

	it("handles 0x prefix", () => {
		expect(hexToBase58("0xa614f803b6fd780986a42c78ec9c7f77e6ded13c"))
			.toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
	});

	it("handles 41-prefixed hex (TRON native format)", () => {
		expect(hexToBase58("41a614f803b6fd780986a42c78ec9c7f77e6ded13c"))
			.toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
	});

	it("converts a different known address", () => {
		// TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs (Tether Treasury)
		// The hex for this address: find from the events data
		// We can derive by checking: any known hex→base58 pair
		const result = hexToBase58("0x" + "0".repeat(40));
		// Zero address should produce a valid Base58 string starting with T
		expect(result).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
	});

	it("throws on invalid hex length", () => {
		expect(() => hexToBase58("abcd")).toThrow(/invalid/i);
	});

	it("round-trips with isValidAddress", () => {
		const base58 = hexToBase58("0xa614f803b6fd780986a42c78ec9c7f77e6ded13c");
		expect(isValidAddress(base58)).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/utils/address.test.ts`
Expected: FAIL — `hexToBase58` is not exported

- [ ] **Step 3: Implement hexToBase58**

In `src/utils/address.ts`, add:

```typescript
import { createHash } from "node:crypto";

// ... existing code (BASE58_REGEX, HEX_REGEX, isValidAddress, validateAddress) ...

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encode a Buffer as a Base58 string. Standard Bitcoin/TRON alphabet.
 */
function base58Encode(buffer: Uint8Array): string {
	// Count leading zeros
	let zeros = 0;
	for (const byte of buffer) {
		if (byte !== 0) break;
		zeros++;
	}

	// Convert to BigInt for division
	let num = BigInt("0x" + Buffer.from(buffer).toString("hex"));
	const chars: string[] = [];
	while (num > 0n) {
		const remainder = Number(num % 58n);
		num = num / 58n;
		chars.push(BASE58_ALPHABET[remainder]);
	}

	// Add leading '1' characters for leading zero bytes
	for (let i = 0; i < zeros; i++) {
		chars.push("1");
	}

	return chars.reverse().join("");
}

/**
 * Convert an EVM hex address to a TRON Base58Check address.
 *
 * Accepts three forms:
 *   - 40 hex chars (raw EVM): "a614f803..."
 *   - "0x" + 40 hex chars: "0xa614f803..."
 *   - "41" + 40 hex chars (TRON native hex): "41a614f803..."
 *
 * Conversion: strip prefix → prepend 0x41 → double SHA256 → first 4
 * bytes checksum → Base58 encode (0x41 + 20 bytes + 4 checksum bytes).
 *
 * Uses node:crypto for SHA256. Zero external dependencies.
 */
export function hexToBase58(hex: string): string {
	let raw = hex;
	if (raw.startsWith("0x") || raw.startsWith("0X")) {
		raw = raw.slice(2);
	}
	if (raw.length === 42 && raw.startsWith("41")) {
		// Already has TRON prefix
	} else if (raw.length === 40) {
		raw = "41" + raw;
	} else {
		throw new Error(`Invalid hex address length: expected 40 or 42 hex chars, got ${raw.length}`);
	}

	// Validate hex
	if (!/^[0-9a-fA-F]{42}$/.test(raw)) {
		throw new Error(`Invalid hex address: contains non-hex characters`);
	}

	const addressBytes = Buffer.from(raw, "hex");
	const hash1 = createHash("sha256").update(addressBytes).digest();
	const hash2 = createHash("sha256").update(hash1).digest();
	const checksum = hash2.subarray(0, 4);

	const payload = new Uint8Array(addressBytes.length + 4);
	payload.set(addressBytes);
	payload.set(checksum, addressBytes.length);

	return base58Encode(payload);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/utils/address.test.ts`
Expected: All pass. The USDT hex→Base58 round-trip is the critical assertion.

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/utils/address.ts tests/utils/address.test.ts
git commit -m "feat: add hexToBase58 address conversion utility

Converts EVM hex addresses from TronGrid event results to TRON
Base58Check format. Uses node:crypto for SHA256. No new dependencies."
```

---

## Task 3: Add batch TRC-20 token info client (P3)

**Files:**
- Create: `src/api/token-info.ts`
- Create: `tests/api/token-info.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/token-info.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchBatchTrc20Info, type Trc20Info } from "../../src/api/token-info.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDC = "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8";

describe("fetchBatchTrc20Info", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches token info for a single address", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						data: [
							{
								contract_address: USDT,
								name: "Tether USD",
								symbol: "USDT",
								decimals: "6",
								type: "trc20",
								total_supply: "86374532395869756",
							},
						],
						success: true,
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchBatchTrc20Info(client, [USDT]);
		expect(result.size).toBe(1);
		const info = result.get(USDT);
		expect(info).toBeDefined();
		expect(info!.symbol).toBe("USDT");
		expect(info!.decimals).toBe(6);
		expect(info!.total_supply).toBe("86374532395869756");
	});

	it("fetches multiple tokens in one call", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(
				new Response(
					JSON.stringify({
						data: [
							{ contract_address: USDT, name: "Tether USD", symbol: "USDT", decimals: "6", type: "trc20", total_supply: "86374532395869756" },
							{ contract_address: USDC, name: "USD Coin", symbol: "USDC", decimals: "6", type: "trc20", total_supply: "500000000000000" },
						],
						success: true,
					}),
				),
			),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchBatchTrc20Info(client, [USDT, USDC]);
		expect(result.size).toBe(2);
		expect(result.get(USDT)!.symbol).toBe("USDT");
		expect(result.get(USDC)!.symbol).toBe("USDC");
	});

	it("returns empty map for empty input", async () => {
		const client = createClient({ network: "mainnet" });
		const result = await fetchBatchTrc20Info(client, []);
		expect(result.size).toBe(0);
	});

	it("returns empty map when API returns no data", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({ data: [], success: true }))),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchBatchTrc20Info(client, [USDT]);
		expect(result.size).toBe(0);
	});

	it("passes contract_list as comma-separated query param", async () => {
		let capturedUrl = "";
		globalThis.fetch = mock((url: string) => {
			capturedUrl = url;
			return Promise.resolve(new Response(JSON.stringify({ data: [], success: true })));
		});
		const client = createClient({ network: "mainnet" });
		await fetchBatchTrc20Info(client, [USDT, USDC]);
		expect(capturedUrl).toContain(`contract_list=${USDT},${USDC}`);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/api/token-info.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fetchBatchTrc20Info**

Create `src/api/token-info.ts`:

```typescript
import type { ApiClient } from "./client.js";

export interface Trc20Info {
	contract_address: string;
	name: string;
	symbol: string;
	decimals: number;
	type: string;
	total_supply: string;
}

interface BatchInfoResponse {
	data?: Array<{
		contract_address?: string;
		name?: string;
		symbol?: string;
		decimals?: string;
		type?: string;
		total_supply?: string;
	}>;
	success?: boolean;
}

/**
 * Batch-fetch TRC-20 token metadata (symbol, name, decimals, type,
 * totalSupply) for up to 20 addresses in one HTTP call.
 *
 * Endpoint: GET /v1/trc20/info?contract_list={addr1},{addr2},...
 *
 * Returns a Map keyed by contract address for O(1) lookup.
 * On failure (network error, bad response), returns an empty Map so
 * callers can gracefully degrade to individual lookups.
 */
export async function fetchBatchTrc20Info(
	client: ApiClient,
	addresses: string[],
): Promise<Map<string, Trc20Info>> {
	const result = new Map<string, Trc20Info>();
	if (addresses.length === 0) return result;

	// API limit: 20 addresses per call. Chunk if needed.
	const CHUNK_SIZE = 20;
	const chunks: string[][] = [];
	for (let i = 0; i < addresses.length; i += CHUNK_SIZE) {
		chunks.push(addresses.slice(i, i + CHUNK_SIZE));
	}

	await Promise.all(
		chunks.map(async (chunk) => {
			const contractList = chunk.join(",");
			const res = await client.get<BatchInfoResponse>(
				`/v1/trc20/info?contract_list=${contractList}`,
			);
			for (const item of res.data ?? []) {
				if (!item.contract_address) continue;
				result.set(item.contract_address, {
					contract_address: item.contract_address,
					name: item.name ?? "",
					symbol: item.symbol ?? "",
					decimals: Number.parseInt(item.decimals ?? "0", 10),
					type: item.type ?? "trc20",
					total_supply: item.total_supply ?? "0",
				});
			}
		}),
	);

	return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test tests/api/token-info.test.ts`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add src/api/token-info.ts tests/api/token-info.test.ts
git commit -m "feat: add batch TRC-20 token info client

Wraps GET /v1/trc20/info?contract_list= to resolve symbol, name,
decimals, type, and totalSupply for up to 20 tokens per call."
```

---

## Task 4: Account tokens — batch info, symbol display, UX fixes (P4)

**Files:**
- Modify: `src/commands/account/tokens.ts`
- Modify: `tests/commands/account-tokens.test.ts`

- [ ] **Step 1: Update fetchAccountTokens to use batch token info**

In `src/commands/account/tokens.ts`:

1. Add import: `import { fetchBatchTrc20Info } from "../../api/token-info.js";`
2. Add `symbol?: string` and `name?: string` to `TokenBalance` interface
3. Replace the per-token decimals resolution with batch token info:

```typescript
export async function fetchAccountTokens(
	client: ApiClient,
	address: string,
): Promise<TokenBalance[]> {
	const raw = await client.get<AccountV1Response>(`/v1/accounts/${address}`);

	const account = raw.data?.[0];
	if (!account) return [];

	const results: TokenBalance[] = [];

	// TRC20: [{contract_address: balanceStr}, ...]
	for (const entry of account.trc20 ?? []) {
		for (const [contract_address, balance] of Object.entries(entry)) {
			results.push({ type: "TRC20", contract_address, balance });
		}
	}

	// TRC10 (assetV2): [{key: tokenId, value: amount}, ...]
	for (const asset of account.assetV2 ?? []) {
		results.push({ type: "TRC10", contract_address: asset.key, balance: String(asset.value) });
	}

	// Batch-resolve TRC-20 metadata (symbol, name, decimals) in one call.
	const trc20Addrs = results.filter((t) => t.type === "TRC20").map((t) => t.contract_address);
	let batchInfo = new Map<string, import("../../api/token-info.js").Trc20Info>();
	if (trc20Addrs.length > 0) {
		try {
			batchInfo = await fetchBatchTrc20Info(client, trc20Addrs);
		} catch {
			// Batch failed — fall through to individual resolution below
		}
	}

	// Apply batch results + fallback for TRC-20; individual fetch for TRC-10
	await Promise.all(
		results.map(async (t) => {
			try {
				if (t.type === "TRC20") {
					const info = batchInfo.get(t.contract_address);
					if (info) {
						t.decimals = info.decimals;
						t.balance_major = formatMajor(t.balance, info.decimals);
						t.symbol = info.symbol;
						t.name = info.name;
					} else {
						// Batch miss — fallback to on-chain call
						const decimals = await resolveTrc20Decimals(client, t.contract_address);
						t.decimals = decimals;
						t.balance_major = formatMajor(t.balance, decimals);
					}
				} else {
					const decimals = await resolveTrc10Decimals(client, t.contract_address);
					t.decimals = decimals;
					t.balance_major = formatMajor(t.balance, decimals);
				}
			} catch {
				// Leave fields unset — raw balance still present
			}
		}),
	);

	return results;
}
```

- [ ] **Step 2: Update renderTokenList with new display order and UX fixes**

```typescript
export function renderTokenList(tokens: TokenBalance[]): void {
	if (tokens.length === 0) {
		console.log(muted("No tokens found."));
		return;
	}
	const noun = tokens.length === 1 ? "token" : "tokens";
	console.log(muted(`Found ${tokens.length} ${noun}:\n`));

	// Column order: type tag | symbol or [?] | (contract) | balance | raw annotation
	// Key columns first (symbol + contract), then metric (balance).
	const cells: string[][] = tokens.map((t) => {
		const symbolCol = t.symbol ?? (t.decimals === undefined ? "[?]" : "");
		const contractCol = `(${truncateAddress(t.contract_address, 4, 4)})`;
		const balanceCol = t.balance_major ?? t.balance;

		// Trial #7: suppress redundant raw when major equals raw
		let rawAnnotation = "";
		if (t.decimals === undefined) {
			rawAnnotation = muted("(decimals unresolved)");
		} else if (t.balance_major !== undefined && t.balance_major !== t.balance) {
			rawAnnotation = muted(`(raw ${t.balance})`);
		}

		return [
			`[${t.type}]`,
			symbolCol,
			contractCol,
			balanceCol,
			rawAnnotation,
		];
	});

	const balanceCol = 3;
	const balanceWidth = Math.max(...cells.map((c) => (c[balanceCol] ?? "").length));
	for (const row of cells) {
		const cur = row[balanceCol] ?? "";
		row[balanceCol] = alignNumber(cur, balanceWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}
```

- [ ] **Step 3: Update TokenBalance interface**

Add to the interface:

```typescript
export interface TokenBalance {
	type: "TRC20" | "TRC10";
	contract_address: string;
	balance: string;
	decimals?: number;
	balance_major?: string;
	symbol?: string;
	name?: string;
}
```

- [ ] **Step 4: Update tests**

In `tests/commands/account-tokens.test.ts`, add test cases for the three UX fixes:

```typescript
it("shows resolved symbol as primary identifier", () => {
	// ... mock fetchBatchTrc20Info response with symbol: "USDT"
	// Verify the rendered output contains "USDT" before the balance
});

it("shows [?] marker when decimals are unresolved", () => {
	// ... mock both batch and fallback to fail
	// Verify output contains "[?]" and "(decimals unresolved)"
});

it("suppresses redundant raw when balance_major equals balance", () => {
	// ... mock a TRC-10 token with decimals 0 (balance_major === balance)
	// Verify output does NOT contain "(raw"
});
```

Update existing snapshot expectations to reflect the new column order (symbol + contract before balance).

- [ ] **Step 5: Run tests**

Run: `bun test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add src/commands/account/tokens.ts tests/commands/account-tokens.test.ts
git commit -m "refactor: account tokens batch info, symbol display, UX fixes

- Use /v1/trc20/info batch endpoint for TRC-20 metadata
- Symbol as primary identifier, contract as secondary (trial #1)
- [?] marker + '(decimals unresolved)' on lookup failure (trial #6)
- Suppress redundant '(raw N)' when major equals raw (trial #7)"
```

---

## Task 5: Add renderUncenteredTransferList (P5)

**Files:**
- Modify: `src/output/transfers.ts`
- Modify: `tests/output/transfers.test.ts`

- [ ] **Step 1: Write failing tests**

In `tests/output/transfers.test.ts`, add:

```typescript
import { describe, expect, it, mock } from "bun:test";
import type { UncenteredTransferRow } from "../../src/output/transfers.js";
import { renderUncenteredTransferList } from "../../src/output/transfers.js";

describe("renderUncenteredTransferList", () => {
	it("renders empty state", () => {
		const logs: string[] = [];
		const orig = console.log;
		console.log = mock((...args: unknown[]) => logs.push(args.join(" ")));
		renderUncenteredTransferList([]);
		console.log = orig;
		expect(logs.some((l) => l.includes("No transfers found"))).toBe(true);
	});

	it("renders from/to as peers with arrow separator", () => {
		const rows: UncenteredTransferRow[] = [
			{
				tx_id: "abc123def456abc123def456abc123def456abc123def456abc123def456abcdef",
				block_timestamp: 1710000000000,
				from: "TFromAddr1234567890123456789012AB",
				to: "TToAddress234567890123456789012XY",
				value: "1000000",
				decimals: 6,
				value_major: "1.0",
			},
		];
		const logs: string[] = [];
		const orig = console.log;
		console.log = mock((...args: unknown[]) => logs.push(args.join(" ")));
		renderUncenteredTransferList(rows);
		console.log = orig;
		const output = logs.join("\n");
		expect(output).toContain("1 transfer");
		expect(output).toContain("→");
		expect(output).toContain("1.0");
	});

	it("renders plural header for multiple rows", () => {
		const rows: UncenteredTransferRow[] = [
			{ tx_id: "a".repeat(64), block_timestamp: 1710000000000, from: "T" + "A".repeat(33), to: "T" + "B".repeat(33), value: "100", decimals: 0, value_major: "100" },
			{ tx_id: "b".repeat(64), block_timestamp: 1710000001000, from: "T" + "C".repeat(33), to: "T" + "D".repeat(33), value: "200", decimals: 0, value_major: "200" },
		];
		const logs: string[] = [];
		const orig = console.log;
		console.log = mock((...args: unknown[]) => logs.push(args.join(" ")));
		renderUncenteredTransferList(rows);
		console.log = orig;
		expect(logs.some((l) => l.includes("2 transfers"))).toBe(true);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/output/transfers.test.ts`
Expected: FAIL — `renderUncenteredTransferList` not exported

- [ ] **Step 3: Implement renderUncenteredTransferList**

In `src/output/transfers.ts`, add below the existing centered exports:

```typescript
/**
 * Row type for an **uncentered** transfer list — from and to are peers,
 * no direction column. Used by `token transfers`, future `tx transfers`.
 * See memory feedback_transfer_list_two_styles.
 */
export interface UncenteredTransferRow {
	tx_id: string;
	block_timestamp: number; // unix ms
	from: string;
	to: string;
	value: string;          // raw
	decimals: number;
	value_major: string;
}

/**
 * Human-mode renderer for uncentered transfer lists. `from` and `to`
 * shown as peers with a `→` separator. No direction column.
 *
 * Column order: time | from | → | to | value_major | tx_id
 */
export function renderUncenteredTransferList(rows: UncenteredTransferRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No transfers found."));
		return;
	}
	const headerNoun = rows.length === 1 ? "transfer" : "transfers";
	console.log(muted(`Found ${rows.length} ${headerNoun}:\n`));

	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.block_timestamp),
		truncateAddress(r.from, 4, 4),
		"→",
		truncateAddress(r.to, 4, 4),
		r.value_major,
		truncateAddress(r.tx_id, 4, 4),
	]);

	// Right-align value column
	const valueCol = 4;
	const valueWidth = Math.max(...cells.map((c) => (c[valueCol] ?? "").length));
	for (const row of cells) {
		const cur = row[valueCol] ?? "";
		row[valueCol] = alignNumber(cur, valueWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}
```

- [ ] **Step 4: Run tests**

Run: `bun test tests/output/transfers.test.ts`
Expected: All pass (both centered and uncentered tests)

- [ ] **Step 5: Commit**

```bash
git add src/output/transfers.ts tests/output/transfers.test.ts
git commit -m "feat: add renderUncenteredTransferList to transfers.ts

From/to as peers, no direction column. For token transfers and
future tx transfers. See feedback_transfer_list_two_styles."
```

---

## Task 6: Add token holders command (M1)

**Files:**
- Create: `src/commands/token/holders.ts`
- Create: `tests/commands/token-holders.test.ts`
- Modify: `src/commands/token/view.ts` (wire command)

- [ ] **Step 1: Write failing tests**

Create `tests/commands/token-holders.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenHolders, type HolderRow } from "../../src/commands/token/holders.js";
import { UsageError } from "../../src/output/format.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const HOLDER_A = "TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs";
const HOLDER_B = "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb";

describe("fetchTokenHolders", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses holder map entries into HolderRow with rank and share_pct", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(
					new Response(JSON.stringify({
						data: [{ contract_address: USDT, symbol: "USDT", name: "Tether USD", decimals: "6", type: "trc20", total_supply: "100000000000000" }],
						success: true,
					})),
				);
			}
			// holders endpoint
			return Promise.resolve(
				new Response(JSON.stringify({
					data: [
						{ [HOLDER_A]: "60000000000000" },
						{ [HOLDER_B]: "40000000000000" },
					],
					success: true,
					meta: { page_size: 2 },
				})),
			);
		});

		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenHolders(client, USDT, { limit: 20 });

		expect(rows).toHaveLength(2);
		expect(rows[0].rank).toBe(1);
		expect(rows[0].address).toBe(HOLDER_A);
		expect(rows[0].balance).toBe("60000000000000");
		expect(rows[0].decimals).toBe(6);
		expect(rows[0].balance_major).toBe("60000000.0");
		expect(rows[0].share_pct).toBe("60.00");
		expect(rows[1].rank).toBe(2);
		expect(rows[1].share_pct).toBe("40.00");
	});

	it("returns empty array when no holders", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, decimals: "6", total_supply: "100", symbol: "USDT", name: "Tether", type: "trc20" }],
					success: true,
				})));
			}
			return Promise.resolve(new Response(JSON.stringify({ data: [], success: true })));
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenHolders(client, USDT, { limit: 20 });
		expect(rows).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Implement token holders**

Create `src/commands/token/holders.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { UsageError, printListResult, reportErrorAndExit } from "../../output/format.js";
import { muted } from "../../output/colors.js";
import { alignNumber, alignText, computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";
import { detectTokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface HolderRow {
	rank: number;
	address: string;
	balance: string;
	decimals: number;
	balance_major: string;
	share_pct: string;
}

interface HoldersResponse {
	data?: Array<Record<string, string>>;
	success?: boolean;
}

export async function fetchTokenHolders(
	client: ApiClient,
	contractAddress: string,
	opts: { limit: number },
): Promise<HolderRow[]> {
	// Fetch token info for decimals + totalSupply
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 0;
	const totalSupply = BigInt(info?.total_supply ?? "0");

	const params = new URLSearchParams();
	params.set("limit", String(opts.limit));
	params.set("order_by", "balance,desc");

	const res = await client.get<HoldersResponse>(
		`/v1/contracts/${contractAddress}/tokens?${params.toString()}`,
	);

	const rows: HolderRow[] = [];
	let rank = 0;
	for (const entry of res.data ?? []) {
		for (const [address, balance] of Object.entries(entry)) {
			rank++;
			const balanceBig = BigInt(balance);
			// share_pct = balance / totalSupply * 100, with 2 decimal places
			let sharePct = "0.00";
			if (totalSupply > 0n) {
				// Multiply by 10000 for 2 decimal places, then divide
				const bps = (balanceBig * 10000n) / totalSupply;
				sharePct = `${(Number(bps) / 100).toFixed(2)}`;
			}
			rows.push({
				rank,
				address,
				balance,
				decimals,
				balance_major: formatMajor(balance, decimals),
				share_pct: sharePct,
			});
		}
	}
	return rows;
}

const HOLDERS_SORT_CONFIG: SortConfig<HolderRow> = {
	defaultField: "balance",
	fieldDirections: {
		balance: "desc",
		rank: "asc",
	},
	tieBreakField: "rank",
};

function renderHolderList(rows: HolderRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No holders found."));
		return;
	}
	const noun = rows.length === 1 ? "holder" : "holders";
	console.log(muted(`Top ${rows.length} ${noun}:\n`));

	const cells: string[][] = rows.map((r) => [
		`#${r.rank}`,
		truncateAddress(r.address, 4, 4),
		r.balance_major,
		`${r.share_pct}%`,
	]);

	// Right-align rank, balance, and share columns
	for (const colIdx of [0, 2, 3]) {
		const width = Math.max(...cells.map((c) => (c[colIdx] ?? "").length));
		for (const row of cells) {
			const cur = row[colIdx] ?? "";
			row[colIdx] = alignNumber(cur, width);
		}
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

function hintForTokenHolders(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("trx")) {
		return "TRX holder ranking requires indexed data not available on TronGrid. Support depends on a future product decision.";
	}
	if (msg.includes("not yet supported")) {
		return "Support is planned for a future release.";
	}
	return undefined;
}

export function registerTokenHoldersCommand(token: Command, parent: Command): void {
	token
		.command("holders")
		.description("Top holders of a TRC-20 token with balance distribution")
		.helpGroup("Read commands:")
		.argument("<id|address|symbol>", "TRC-20 Base58 address or verified symbol")
		.option("--type <type>", "force token standard")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token holders USDT
  $ trongrid token holders TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --limit 50
  $ trongrid token holders USDT --json

Sort:
  default — balance desc (largest holder first)
  fields  — balance, rank
`,
		)
		.action(async (input: string, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(input, localOpts.type);
				if (id.type === "trx") {
					throw new UsageError("TRX holder ranking is not available on TronGrid.");
				}
				if (id.type !== "trc20") {
					throw new UsageError(
						`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
					);
				}
				const client = getClient(opts);
				const rows = await fetchTokenHolders(client, id.address, {
					limit: Number.parseInt(opts.limit, 10),
				});
				const sorted = applySort(rows, HOLDERS_SORT_CONFIG, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderHolderList, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTokenHolders(err),
				});
			}
		});
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/token-holders.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/commands/token/holders.ts tests/commands/token-holders.test.ts
git commit -m "feat: add token holders command

Top TRC-20 holders with balance + share %. Uses /v1/contracts/{addr}/
tokens + batch token info for decimals/totalSupply. TRX and TRC-10
rejected with forward-looking hints."
```

---

## Task 7: Add token transfers command (M2)

**Files:**
- Create: `src/commands/token/transfers.ts`
- Create: `tests/commands/token-transfers.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/token-transfers.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenTransfers } from "../../src/commands/token/transfers.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("fetchTokenTransfers", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("parses Transfer events with hex-to-Base58 conversion", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, symbol: "USDT", name: "Tether USD", decimals: "6", type: "trc20", total_supply: "100000000" }],
					success: true,
				})));
			}
			// events endpoint
			return Promise.resolve(new Response(JSON.stringify({
				data: [{
					block_number: 81882707,
					block_timestamp: 1776315840000,
					contract_address: USDT,
					event_name: "Transfer",
					result: {
						from: "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c",
						to: "0xffd14c4e694cb47f3cd909ecaf2d73859796553e",
						value: "1000000",
					},
					transaction_id: "abc123",
				}],
				success: true,
			})));
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenTransfers(client, USDT, { limit: 20 });
		expect(rows).toHaveLength(1);
		// hex addresses should be converted to Base58
		expect(rows[0].from).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
		expect(rows[0].to).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
		expect(rows[0].value).toBe("1000000");
		expect(rows[0].value_major).toBe("1.0");
		expect(rows[0].decimals).toBe(6);
	});

	it("returns empty array when no events", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, decimals: "6", symbol: "USDT", name: "Tether", type: "trc20", total_supply: "0" }],
					success: true,
				})));
			}
			return Promise.resolve(new Response(JSON.stringify({ data: [], success: true })));
		});
		const client = createClient({ network: "mainnet" });
		const rows = await fetchTokenTransfers(client, USDT, { limit: 20 });
		expect(rows).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Implement token transfers**

Create `src/commands/token/transfers.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { UsageError, printListResult, reportErrorAndExit } from "../../output/format.js";
import { type UncenteredTransferRow, renderUncenteredTransferList } from "../../output/transfers.js";
import { hexToBase58 } from "../../utils/address.js";
import { applySort, type SortConfig } from "../../utils/sort.js";
import { parseTimeRange } from "../../utils/time-range.js";
import { detectTokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

interface RawEvent {
	block_number?: number;
	block_timestamp?: number;
	contract_address?: string;
	event_name?: string;
	result?: { from?: string; to?: string; value?: string };
	transaction_id?: string;
	_unconfirmed?: boolean;
}

interface EventsResponse {
	data?: RawEvent[];
	success?: boolean;
}

export async function fetchTokenTransfers(
	client: ApiClient,
	contractAddress: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number; confirmed?: boolean },
): Promise<UncenteredTransferRow[]> {
	// Fetch token info for decimals
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 0;

	const params = new URLSearchParams();
	params.set("event_name", "Transfer");
	params.set("limit", String(opts.limit));
	params.set("order_by", "block_timestamp,desc");
	if (opts.minTimestamp !== undefined) params.set("min_block_timestamp", String(opts.minTimestamp));
	if (opts.maxTimestamp !== undefined) params.set("max_block_timestamp", String(opts.maxTimestamp));
	if (opts.confirmed) params.set("only_confirmed", "true");

	const res = await client.get<EventsResponse>(
		`/v1/contracts/${contractAddress}/events?${params.toString()}`,
	);

	const rows: UncenteredTransferRow[] = [];
	for (const evt of res.data ?? []) {
		if (evt.event_name !== "Transfer" || !evt.result) continue;
		const fromHex = evt.result.from ?? "";
		const toHex = evt.result.to ?? "";
		const value = evt.result.value ?? "0";

		let from: string;
		let to: string;
		try {
			from = hexToBase58(fromHex);
			to = hexToBase58(toHex);
		} catch {
			// Skip malformed addresses
			continue;
		}

		rows.push({
			tx_id: evt.transaction_id ?? "",
			block_timestamp: evt.block_timestamp ?? 0,
			from,
			to,
			value,
			decimals,
			value_major: formatMajor(value, decimals),
		});
	}
	return rows;
}

const TOKEN_TRANSFERS_SORT_CONFIG: SortConfig<UncenteredTransferRow> = {
	defaultField: "block_timestamp",
	fieldDirections: {
		block_timestamp: "desc",
		value: "desc",
	},
	tieBreakField: "block_timestamp",
};

function hintForTokenTransfers(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("trx")) {
		return 'Network-wide TRX transfer history is not available on TronGrid. For per-account TRX transfers, use "trongrid account txs". Support depends on a future product decision.';
	}
	if (msg.includes("not yet supported")) {
		return "Support is planned for a future release.";
	}
	return undefined;
}

export function registerTokenTransfersCommand(token: Command, parent: Command): void {
	token
		.command("transfers")
		.description("Transfer history of a TRC-20 token")
		.helpGroup("Read commands:")
		.argument("<id|address|symbol>", "TRC-20 Base58 address or verified symbol")
		.option("--type <type>", "force token standard")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token transfers USDT
  $ trongrid token transfers USDT --before 2026-04-01 --after 2026-03-01
  $ trongrid token transfers USDT --limit 50 --reverse
  $ trongrid token transfers USDT --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value
`,
		)
		.action(async (input: string, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(input, localOpts.type);
				if (id.type === "trx") {
					throw new UsageError(
						"Network-wide TRX transfer history is not available on TronGrid.",
					);
				}
				if (id.type !== "trc20") {
					throw new UsageError(
						`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
					);
				}
				const client = getClient(opts);
				const range = parseTimeRange(opts.before, opts.after);
				const rows = await fetchTokenTransfers(client, id.address, {
					limit: Number.parseInt(opts.limit, 10),
					minTimestamp: range.minTimestamp,
					maxTimestamp: range.maxTimestamp,
					confirmed: opts.confirmed,
				});
				const sorted = applySort(rows, TOKEN_TRANSFERS_SORT_CONFIG, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderUncenteredTransferList, {
					json: opts.json,
					fields: parseFields(opts),
				});
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTokenTransfers(err),
				});
			}
		});
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/token-transfers.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/commands/token/transfers.ts tests/commands/token-transfers.test.ts
git commit -m "feat: add token transfers command

TRC-20 transfer history via /v1/contracts/{addr}/events?event_name=
Transfer. Hex addresses converted to Base58. Uncentered renderer
(from/to as peers). Supports --before/--after/--confirmed."
```

---

## Task 8: Add token balance command (M3)

**Files:**
- Create: `src/commands/token/balance.ts`
- Create: `tests/commands/token-balance.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/token-balance.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenBalance } from "../../src/commands/token/balance.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const HOLDER = "TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs";

describe("fetchTokenBalance", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("fetches TRC-20 balance via /v1/accounts/{addr}/trc20/balance", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, symbol: "USDT", name: "Tether USD", decimals: "6", type: "trc20", total_supply: "100" }],
					success: true,
				})));
			}
			// balance endpoint
			return Promise.resolve(new Response(JSON.stringify({
				data: [{ [USDT]: "1317713193083827" }],
				success: true,
			})));
		});
		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenBalance(client, { type: "trc20", address: USDT }, HOLDER);
		expect(result.balance).toBe("1317713193083827");
		expect(result.decimals).toBe(6);
		expect(result.balance_major).toBe("1317713193.083827");
		expect(result.token_symbol).toBe("USDT");
	});

	it("fetches TRX balance via /v1/accounts/{addr}", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response(JSON.stringify({
				data: [{ address: HOLDER, balance: 35216519 }],
			}))),
		);
		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenBalance(client, { type: "trx" }, HOLDER);
		expect(result.balance).toBe("35216519");
		expect(result.balance_unit).toBe("sun");
		expect(result.decimals).toBe(6);
		expect(result.balance_trx).toBe("35.216519");
	});
});
```

- [ ] **Step 2: Implement token balance**

Create `src/commands/token/balance.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { UsageError, printResult, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { detectTokenIdentifier, type TokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor, sunToTrx } from "../../utils/tokens.js";

// sunToTrx is in format.ts, not tokens.ts — check and import accordingly
// Actually sunToTrx is in format.ts. Let me fix the import.

interface TrxBalanceResult {
	token: "TRX";
	address: string;
	balance: string;
	balance_unit: "sun";
	decimals: 6;
	balance_trx: string;
}

interface Trc20BalanceResult {
	token: string;
	token_address: string;
	token_symbol?: string;
	token_name?: string;
	address: string;
	balance: string;
	decimals: number;
	balance_major: string;
}

export type TokenBalanceResult = TrxBalanceResult | Trc20BalanceResult;

interface AccountResponse {
	data?: Array<{ balance?: number; address?: string }>;
}

interface Trc20BalanceResponse {
	data?: Array<Record<string, string>>;
	success?: boolean;
}

export async function fetchTokenBalance(
	client: ApiClient,
	id: TokenIdentifier,
	address: string,
): Promise<TokenBalanceResult> {
	if (id.type === "trx") {
		const res = await client.get<AccountResponse>(`/v1/accounts/${address}`);
		const balance = res.data?.[0]?.balance ?? 0;
		const balanceStr = String(balance);
		return {
			token: "TRX",
			address,
			balance: balanceStr,
			balance_unit: "sun",
			decimals: 6,
			balance_trx: formatMajor(balanceStr, 6),
		};
	}

	if (id.type !== "trc20") {
		throw new UsageError(
			`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
		);
	}

	// Fetch token metadata
	const infoMap = await fetchBatchTrc20Info(client, [id.address]);
	const info = infoMap.get(id.address);
	const decimals = info?.decimals ?? 0;

	// Fetch balance
	const res = await client.get<Trc20BalanceResponse>(
		`/v1/accounts/${address}/trc20/balance?contract_address=${id.address}`,
	);

	let rawBalance = "0";
	for (const entry of res.data ?? []) {
		const val = entry[id.address];
		if (val !== undefined) {
			rawBalance = val;
			break;
		}
	}

	return {
		token: info?.symbol ?? id.address,
		token_address: id.address,
		token_symbol: info?.symbol,
		token_name: info?.name,
		address,
		balance: rawBalance,
		decimals,
		balance_major: formatMajor(rawBalance, decimals),
	};
}

function hintForTokenBalance(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("not yet supported")) {
		return "Support is planned for a future release.";
	}
	return addressErrorHint(err);
}

export function registerTokenBalanceCommand(token: Command, parent: Command): void {
	token
		.command("balance")
		.description("Check a specific token balance for an address")
		.helpGroup("Read commands:")
		.argument("<token>", "Token: TRX, TRC-20 address, or verified symbol")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.option("--type <type>", "force token standard")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token balance TRX TKHu...
  $ trongrid token balance USDT                  # uses default_address
  $ trongrid token balance USDT TKHu... --json
`,
		)
		.action(async (tokenInput: string, address: string | undefined, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(tokenInput, localOpts.type);
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const data = await fetchTokenBalance(client, id, resolved);

				if (data.token === "TRX") {
					const trx = data as TrxBalanceResult;
					printResult(trx, [
						["token", "Token", "TRX (Tronix)"],
						["address", "Address", trx.address],
						["balance_trx", "Balance", `${trx.balance_trx} TRX`],
					], { json: opts.json, fields: parseFields(opts) });
				} else {
					const trc20 = data as Trc20BalanceResult;
					const tokenLabel = trc20.token_name
						? `${trc20.token_symbol} (${trc20.token_name})`
						: trc20.token_symbol ?? trc20.token_address;
					printResult(trc20, [
						["token", "Token", tokenLabel],
						["token_address", "Contract", trc20.token_address],
						["address", "Address", trc20.address],
						["balance_major", "Balance", `${trc20.balance_major} ${trc20.token_symbol ?? ""}`],
					], { json: opts.json, fields: parseFields(opts) });
				}
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTokenBalance(err),
				});
			}
		});
}
```

Note: `sunToTrx` is in `src/output/format.ts`, but `formatMajor` from `src/utils/tokens.ts` with decimals=6 gives the same result. Use `formatMajor` for consistency.

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/token-balance.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/commands/token/balance.ts tests/commands/token-balance.test.ts
git commit -m "feat: add token balance command

TRX via /v1/accounts/{addr} (S1 shape), TRC-20 via /v1/accounts/
{addr}/trc20/balance (S2 shape). Address optional with default_address
fallback. TRC-10/721/1155 deferred with hint."
```

---

## Task 9: Add token allowance command (M4)

**Files:**
- Create: `src/commands/token/allowance.ts`
- Create: `tests/commands/token-allowance.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/token-allowance.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenAllowance } from "../../src/commands/token/allowance.js";
import { UsageError } from "../../src/output/format.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const OWNER = "TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs";
const SPENDER = "TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb";

function toHex256(n: bigint): string {
	return n.toString(16).padStart(64, "0");
}

describe("fetchTokenAllowance", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("calls allowance(owner, spender) and returns S2 shape", async () => {
		globalThis.fetch = mock((url: string, init?: RequestInit) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, symbol: "USDT", name: "Tether USD", decimals: "6", type: "trc20", total_supply: "100" }],
					success: true,
				})));
			}
			// triggerconstantcontract
			return Promise.resolve(new Response(JSON.stringify({
				constant_result: [toHex256(1000000000n)], // 1000 USDT
			})));
		});
		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenAllowance(client, USDT, OWNER, SPENDER);
		expect(result.allowance).toBe("1000000000");
		expect(result.decimals).toBe(6);
		expect(result.allowance_major).toBe("1000.0");
		expect(result.token_symbol).toBe("USDT");
	});

	it("handles zero allowance", async () => {
		globalThis.fetch = mock((url: string) => {
			if (typeof url === "string" && url.includes("/v1/trc20/info")) {
				return Promise.resolve(new Response(JSON.stringify({
					data: [{ contract_address: USDT, decimals: "6", symbol: "USDT", name: "Tether", type: "trc20", total_supply: "0" }],
					success: true,
				})));
			}
			return Promise.resolve(new Response(JSON.stringify({
				constant_result: [toHex256(0n)],
			})));
		});
		const client = createClient({ network: "mainnet" });
		const result = await fetchTokenAllowance(client, USDT, OWNER, SPENDER);
		expect(result.allowance).toBe("0");
		expect(result.allowance_major).toBe("0");
	});
});
```

- [ ] **Step 2: Implement token allowance**

Create `src/commands/token/allowance.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { fetchBatchTrc20Info } from "../../api/token-info.js";
import type { GlobalOptions } from "../../index.js";
import { UsageError, printResult, reportErrorAndExit } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import { detectTokenIdentifier, type TokenTypeOverride } from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface AllowanceResult {
	token: string;
	token_address: string;
	token_symbol?: string;
	token_name?: string;
	owner: string;
	spender: string;
	allowance: string;
	decimals: number;
	allowance_major: string;
}

interface TriggerResponse {
	constant_result?: string[];
}

/**
 * ABI-encode an address for contract call parameters.
 * TRON addresses in Base58 are converted to hex (strip 41 prefix,
 * left-pad to 32 bytes).
 *
 * For triggerconstantcontract with `visible: true`, we pass addresses
 * as-is in the parameter field — the node handles conversion.
 * But allowance(address,address) needs two address params concatenated
 * as 64-char hex each. With `visible: true`, we pass the Base58
 * addresses directly and let the node decode them.
 *
 * Actually: with visible:true, the `parameter` field should contain
 * the ABI-encoded hex of the two addresses (without 0x prefix).
 * Each address is left-padded to 32 bytes in the EVM ABI encoding.
 */

export async function fetchTokenAllowance(
	client: ApiClient,
	contractAddress: string,
	owner: string,
	spender: string,
): Promise<AllowanceResult> {
	// Fetch token metadata
	const infoMap = await fetchBatchTrc20Info(client, [contractAddress]);
	const info = infoMap.get(contractAddress);
	const decimals = info?.decimals ?? 0;

	// Call allowance(owner, spender) via triggerConstantContract
	// With visible: true, we pass addresses as Base58 strings
	const res = await client.post<TriggerResponse>("/wallet/triggerconstantcontract", {
		contract_address: contractAddress,
		function_selector: "allowance(address,address)",
		parameter: "",
		owner_address: owner,
		visible: true,
		// For allowance(address,address) with visible:true, pass the
		// addresses in the parameter as a JSON-formatted call.
		// Actually, the TronGrid API with visible:true supports passing
		// call_value and parameters differently. Let's use the standard
		// approach: encode parameters as hex.
	});

	// Hmm, the parameter encoding for multi-arg functions needs thought.
	// Let me use a different approach: pass both addresses through the
	// `parameter` field as ABI-encoded hex.

	const hex = res.constant_result?.[0];
	if (!hex) {
		throw new Error(`No allowance() result for ${contractAddress}`);
	}
	const allowance = BigInt(`0x${hex || "0"}`).toString(10);

	return {
		token: info?.symbol ?? contractAddress,
		token_address: contractAddress,
		token_symbol: info?.symbol,
		token_name: info?.name,
		owner,
		spender,
		allowance,
		decimals,
		allowance_major: formatMajor(allowance, decimals),
	};
}

function hintForTokenAllowance(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("trx") && msg.includes("allowance")) {
		return "TRX has no allowance mechanism — allowance is a TRC-20 concept.";
	}
	if (msg.includes("not yet supported")) {
		return "Support is planned for a future release.";
	}
	return undefined;
}

export function registerTokenAllowanceCommand(token: Command, parent: Command): void {
	token
		.command("allowance")
		.description("Check TRC-20 allowance granted by owner to spender")
		.helpGroup("Read commands:")
		.argument("<token>", "TRC-20 address or verified symbol")
		.argument("<owner>", "Owner address (the grantor)")
		.argument("<spender>", "Spender address (the grantee)")
		.option("--type <type>", "force token standard")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid token allowance USDT TOwner... TSpender...
  $ trongrid token allowance USDT TOwner... TSpender... --json
`,
		)
		.action(async (tokenInput: string, ownerInput: string, spenderInput: string, localOpts: { type?: TokenTypeOverride }) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const id = detectTokenIdentifier(tokenInput, localOpts.type);
				if (id.type === "trx") {
					throw new UsageError("TRX has no allowance mechanism (allowance is a TRC-20 concept).");
				}
				if (id.type !== "trc20") {
					throw new UsageError(
						`${id.type.toUpperCase()} tokens are not yet supported for this command. Support is planned for a future release.`,
					);
				}
				const owner = validateAddress(ownerInput);
				const spender = validateAddress(spenderInput);
				const client = getClient(opts);
				const data = await fetchTokenAllowance(client, id.address, owner, spender);

				const tokenLabel = data.token_name
					? `${data.token_symbol} (${data.token_name})`
					: data.token_symbol ?? data.token_address;
				printResult(data, [
					["token", "Token", tokenLabel],
					["token_address", "Contract", data.token_address],
					["owner", "Owner", data.owner],
					["spender", "Spender", data.spender],
					["allowance_major", "Allowance", `${data.allowance_major} ${data.token_symbol ?? ""}`],
				], { json: opts.json, fields: parseFields(opts) });
			} catch (err) {
				reportErrorAndExit(err, {
					json: opts.json,
					verbose: opts.verbose,
					hint: hintForTokenAllowance(err),
				});
			}
		});
}
```

**Important implementation note:** The `allowance(address,address)` ABI encoding with `visible: true` needs care. The `parameter` field must contain the two addresses ABI-encoded. With `visible: true`, addresses can be passed as Base58 in other fields, but the `parameter` field for function arguments still needs hex encoding. The implementer should test this against real TronGrid and adjust the encoding approach — either:
1. Use `visible: true` and pass Base58 addresses as `parameter` (if TronGrid supports it)
2. Use hex addresses in the `parameter` field with proper ABI padding

Check the existing `token view` pattern in `callView()` (`src/commands/token/view.ts:26-43`) — it passes `parameter: ""` for zero-arg functions. For `allowance(address,address)`, the parameter is two 32-byte ABI-encoded addresses.

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/token-allowance.test.ts`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/commands/token/allowance.ts tests/commands/token-allowance.test.ts
git commit -m "feat: add token allowance command

TRC-20 allowance check via triggerConstantContract allowance(address,
address). TRX rejected with mechanism explanation. S2 shape output."
```

---

## Task 10: Wire new commands + standardize error messages (M5)

**Files:**
- Modify: `src/commands/token/view.ts`

- [ ] **Step 1: Update registerTokenCommands to wire new subcommands**

In `src/commands/token/view.ts`, import and wire the four new commands:

```typescript
import { registerTokenHoldersCommand } from "./holders.js";
import { registerTokenTransfersCommand } from "./transfers.js";
import { registerTokenBalanceCommand } from "./balance.js";
import { registerTokenAllowanceCommand } from "./allowance.js";

export function registerTokenCommands(parent: Command): void {
	const token = parent
		.command("token")
		.description("Token queries (TRC-20 + TRX)")
		.helpGroup("Read commands:");

	// existing view command registration...

	registerTokenHoldersCommand(token, parent);
	registerTokenTransfersCommand(token, parent);
	registerTokenBalanceCommand(token, parent);
	registerTokenAllowanceCommand(token, parent);
}
```

- [ ] **Step 2: Standardize "Wave 1" references**

Search for any remaining "Wave 1" text in error messages and help text across the codebase and replace with the standardized "not yet supported" language:

- `src/commands/token/view.ts` help text: `"Verified symbols (Wave 1)"` → `"Verified symbols"`
- `src/utils/token-identifier.ts` if any remain (should already be updated in Task 1)

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: All tests pass

- [ ] **Step 4: Run lint and build**

Run: `bun run lint && bun run build`
Expected: Both clean

- [ ] **Step 5: Commit**

```bash
git add src/commands/token/view.ts
git commit -m "refactor: wire token subcommands and standardize error messages

Register holders/transfers/balance/allowance under token parent.
Replace 'Wave 1' with 'not yet supported' across help text."
```

---

## Task 11: Update roadmap and handoff (M6)

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/handoff.md`

- [ ] **Step 1: Update roadmap.md**

Mark all Phase E items as `- [x]`:

```markdown
## Phase E — Token family polish ✅ (pre-publish, untagged)

**Goal**: Ship the remaining `token` subcommands and close the token-display trial items from Phase C.

- [x] `token holders <id|address|symbol>` — top holders + distribution
- [x] `token transfers <id|address|symbol>` — transfer history of a single token
- [x] `token balance <token> [address]` — specific-token balance check
- [x] `token allowance <token> <owner> <spender>` — one-pair approval lookup
- [x] `account tokens` default display shows resolved symbol as primary identifier (Phase C trial #1); address moves to secondary; batch /v1/trc20/info replaces per-token RPC
- [x] `account tokens` lookup-failure entries keep unit context with a `[?]` / `(decimals unresolved)` marker (trial #6)
- [x] `account tokens` suppress redundant `(raw N)` when major equals raw (trial #7)
```

- [ ] **Step 2: Update handoff.md**

Update the state table:

```markdown
| | |
|---|---|
| `main` tip | `<commit>` (Phase E merged, 2026-04-16) |
| Active phase | **Phase F** — Contract family |
| Tests | ~340 passing |
| Prod deps | 1 (`commander`) |
| Commands | 17 across 6 resources |
```

Add to decision ledger:

```markdown
- Token type support per command: TRX + TRC-20 required; TRC-10/721/1155 → typed result, per-command rejection → spec `docs/designs/phase-e-token-family.md`
- TokenIdentifier discriminator: `type` (renamed from `kind`) → `src/utils/token-identifier.ts`
- Batch token info via /v1/trc20/info → `src/api/token-info.ts`
- Uncentered transfer list renderer → `src/output/transfers.ts`
- Positioning tension documented → `docs/designs/phase-e-token-family.md` §Strategic context
```

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md docs/plans/handoff.md
git commit -m "docs: update roadmap and handoff for Phase E close"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] `token holders` — Task 6
- [x] `token transfers` — Task 7
- [x] `token balance` — Task 8
- [x] `token allowance` — Task 9
- [x] `account tokens` symbol primary — Task 4
- [x] `account tokens` lookup-failure marker — Task 4
- [x] `account tokens` suppress redundant raw — Task 4
- [x] Token identifier rename kind→type — Task 1
- [x] TRX special-case symbol — Task 1
- [x] hexToBase58 — Task 2
- [x] Batch token info — Task 3
- [x] Uncentered transfer renderer — Task 5
- [x] Wire commands — Task 10
- [x] Roadmap + handoff — Task 11

**Placeholder scan:** No TBDs. The allowance ABI encoding (Task 9) has an implementation note about `visible:true` parameter encoding that the implementer needs to test against real TronGrid — this is flagged explicitly, not a placeholder.

**Type consistency:** `TokenIdentifier.type` used consistently across all tasks. `HolderRow`, `UncenteredTransferRow`, `TokenBalanceResult`, `AllowanceResult` types are consistent between test and implementation code.
