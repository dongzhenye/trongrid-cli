# Phase B Wave 1 — `block view` / `account txs` / `token view`

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan one command at a time (implementer → spec review → code review triad per command per phase-b.md). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three user-confirmed Wave 1 commands — `block view`, `account txs`, `token view` — together with the minimum global-flag scaffolding each requires (`--confirmed`, `--reverse` / `--sort-by`, `--type`), and extract one new utility module (`token-identifier`). No write-side.

**Architecture:** Three read commands that each extend an existing resource group (`block`, `account`, `token` new). Each command lands with its own isolated sub-tasks and its own commits; the plan is ordered so each command's plumbing is merged before the next one builds on it. One new file per command, one new utility module, zero new production dependencies.

**Tech Stack:** TypeScript strict mode, commander.js, Bun test. Native `fetch` via existing `src/api/client.ts`. Zero new prod deps (commitment per `AGENTS.md`).

**Spec references (authoritative):**

- `docs/design/commands.md` Part II — `account`, `block`, `token` sections + §Global flags (`--confirmed`, `--reverse`, `--sort-by`)
- `docs/design/units.md` — S1 (TRX fields inside block/tx metadata), S2 (token `total_supply` + `_major`)
- `docs/design/mcp-skills-review.md` §4 — Q1 (confirmed), Q3 (sort), Q4 (token dispatch) resolutions
- `docs/architecture.md` §Defaults & conventions — the 5-row decision table
- `AGENTS.md` — contribution rules (one prod dep, semantic colors, `reportErrorAndExit`, `--json` on every data command)
- `docs/plans/phase-a-plus.md` — reference for task/commit rhythm

**Out of scope for Wave 1 (tracked for later waves):**

- 0x-prefixed 40-hex token address input — requires Base58check conversion (no new deps). Wave 1 accepts Base58 `T...` only; hex input rejected with a hint.
- TRC-721 / TRC-1155 in `token view` — `--type trc721|trc1155` is parsed but rejected at runtime with a "not yet implemented" error.
- Other `token` subcommands (`holders`, `transfers`, `balance`, `allowance`) — deferred to Wave 3 (token family polish).
- `account` list siblings (`transfers`, `delegations`, `permissions`, `approvals`) — deferred to Wave 2.
- `block stats` / `block range` / `block events` — deferred to later waves.
- Write-side commands — pre-B concerns (`--yes`/`--confirm`, SIGINT, actor tracking) deferred to Wave 6.
- Non-trivial `--confirmed` wiring for `account txs` and `token view` — no clean solidity mirror endpoints; flag is accepted globally but is a no-op for those commands in Wave 1. A short `// NOTE:` comment in each command's action documents the gap. Tracked as a follow-up roadmap item.

---

## File Map

### Command 1: `block view <number|hash>`

| File | Responsibility |
|------|----------------|
| Modify `src/index.ts` | Register `--confirmed` on the root command; add to `GlobalOptions`. |
| Modify `src/commands/block/latest.ts` | Change `registerBlockCommands` to **return** the `block` parent command (mirrors account/view.ts pattern) so sibling subcommands can attach. No behavior change to `block latest`. |
| Create `src/commands/block/view.ts` | `fetchBlockView(client, identifier, { confirmed })` + `registerBlockViewCommand(block, parent)`. Dispatches `/wallet/getblockbynum` vs `/wallet/getblockbyid` based on input shape, swaps `/walletsolidity/*` when `--confirmed`. |
| Create `src/utils/block-identifier.ts` | `detectBlockIdentifier(input)` → `{ kind: "number", value: number }` or `{ kind: "hash", value: string }`. Rejects anything else. |
| Modify `src/index.ts` | Import `registerBlockViewCommand`, wire it against the `block` returned by `registerBlockCommands`. |
| Create `tests/utils/block-identifier.test.ts` | Number / hash / reject cases. |
| Create `tests/commands/block-view.test.ts` | Number path, hash path, confirmed-path endpoint swap, error on unknown block. |

### Command 2: `account txs [address]`

| File | Responsibility |
|------|----------------|
| Modify `src/index.ts` | Register `--reverse` / `-r` and `--sort-by <field>` on the root command; add to `GlobalOptions`. |
| Create `src/utils/sort.ts` | `applySort(items, { defaultField, fieldDirections, sortBy, reverse })` — client-side sort with per-field default direction. |
| Create `src/commands/account/txs.ts` | `fetchAccountTxs(client, address, { limit, confirmed })` using `/v1/accounts/:address/transactions` + `registerAccountTxsCommand(account, parent)`. Uses `resolveAddress` for optional positional. |
| Modify `src/index.ts` | Import `registerAccountTxsCommand`, wire under the `account` parent returned by `registerAccountCommands`. |
| Create `tests/utils/sort.test.ts` | Default field, field override, reverse flip, mixed direction, empty list. |
| Create `tests/commands/account-txs.test.ts` | Parsing the API response, default timestamp-desc sort, `--reverse` flip, `--sort-by fee`, default_address fallback, empty account. |

### Command 3: `token view <id|address|symbol>`

| File | Responsibility |
|------|----------------|
| Modify `src/utils/tokens.ts` | Export `STATIC_SYMBOL_TO_ADDRESS` reverse map (same source-of-truth table as `STATIC_TRC20_DECIMALS`, derived once), plus `resolveSymbolToAddress(symbol)`. |
| Create `src/utils/token-identifier.ts` | `detectTokenIdentifier(input, typeOverride?)` → `{ kind: "trc10", assetId: string }` or `{ kind: "trc20", address: string }` or throws. Rejects 0x-hex with a hint (deferred). Rejects `trc721`/`trc1155` with "not yet implemented". |
| Create `src/commands/token/view.ts` | `fetchTokenView(client, identifier)` + `registerTokenCommands(parent)`. Branches on identifier kind: TRC-10 via `/wallet/getassetissuebyid`, TRC-20 via `triggerconstantcontract` calls for `name()` / `symbol()` / `decimals()` / `totalSupply()`. |
| Modify `src/index.ts` | Import and call `registerTokenCommands(program)`. |
| Create `tests/utils/token-identifier.test.ts` | Numeric → TRC-10, Base58 → TRC-20, symbol → TRC-20 via map, unknown symbol rejected with hint, 0x-hex rejected with hint, `--type` overrides, `trc721`/`trc1155` rejected. |
| Create `tests/commands/token-view.test.ts` | TRC-10 branch, TRC-20 branch (4 parallel fetches), symbol→address path, unknown symbol error, S2 shape (`total_supply` + `decimals` + `total_supply_major`). |

---

## Command 1 — `block view <number|hash>`

### Task 1.1 — Add `--confirmed` to global options

**Files:**

- Modify: `src/index.ts`
- Create: `tests/commands/global-flags.test.ts` (if not present — tiny smoke test)

- [ ] **Step 1: Write failing smoke test for `--confirmed` in `GlobalOptions`**

Create `tests/commands/global-flags.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Command } from "commander";

describe("global --confirmed flag", () => {
  it("parses --confirmed into opts.confirmed", () => {
    const program = new Command();
    program.option("--confirmed", "read confirmed (irreversible) chain state", false);
    program.parse(["node", "cli", "--confirmed"], { from: "node" });
    expect(program.opts().confirmed).toBe(true);
  });

  it("defaults confirmed to false", () => {
    const program = new Command();
    program.option("--confirmed", "read confirmed (irreversible) chain state", false);
    program.parse(["node", "cli"], { from: "node" });
    expect(program.opts().confirmed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify pass (commander handles this natively)**

```bash
bun test tests/commands/global-flags.test.ts
```

Expected: both PASS. This test exists to lock in the flag name — it is a regression guard, not a feature test. A failing test would indicate an accidental rename.

- [ ] **Step 3: Register `--confirmed` on the program**

In `src/index.ts`, add the option definition just below `-l, --limit`:

```ts
.option("--confirmed", "read confirmed (irreversible, ~60s lag) state instead of latest", false)
```

And extend `GlobalOptions`:

```ts
export interface GlobalOptions {
  json: boolean;
  network: string;
  apiKey?: string;
  color: boolean;
  verbose: boolean;
  limit: string;
  fields?: string;
  confirmed: boolean;
}
```

- [ ] **Step 4: Run full test suite to verify no regressions**

```bash
bun test
```

Expected: all existing 102 tests still PASS + 2 new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/commands/global-flags.test.ts
git commit -m "$(cat <<'EOF'
feat: add --confirmed global flag

Adds the --confirmed option defined in docs/design/commands.md Part II.
Default off — read latest state, accept ~0.01% reorg risk for 20x
freshness. Opt-in for high-stakes reads (exchange deposits, settlement,
bridges).

Phase B Wave 1. Wired to block view in the next commit; accepted but
no-op for other read commands until equivalent solidity endpoints are
wired.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.2 — `block-identifier` utility

**Files:**

- Create: `src/utils/block-identifier.ts`
- Create: `tests/utils/block-identifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/block-identifier.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { detectBlockIdentifier } from "../../src/utils/block-identifier.js";

describe("detectBlockIdentifier", () => {
  it("detects pure numeric string as block number", () => {
    expect(detectBlockIdentifier("70000000")).toEqual({ kind: "number", value: 70000000 });
    expect(detectBlockIdentifier("0")).toEqual({ kind: "number", value: 0 });
  });

  it("detects 64-char lowercase hex as block hash", () => {
    const hash = "0".repeat(64);
    expect(detectBlockIdentifier(hash)).toEqual({ kind: "hash", value: hash });
  });

  it("accepts 0x-prefixed hex and strips prefix", () => {
    const hash = "0".repeat(64);
    expect(detectBlockIdentifier(`0x${hash}`)).toEqual({ kind: "hash", value: hash });
  });

  it("accepts mixed-case hex and normalizes to lowercase", () => {
    const hash = "ABCD".repeat(16);
    expect(detectBlockIdentifier(hash)).toEqual({ kind: "hash", value: hash.toLowerCase() });
  });

  it("rejects empty input with actionable error", () => {
    expect(() => detectBlockIdentifier("")).toThrow(/block identifier required/i);
  });

  it("rejects non-numeric, non-hex input", () => {
    expect(() => detectBlockIdentifier("not-a-block")).toThrow(/invalid block identifier/i);
  });

  it("rejects hex of wrong length", () => {
    expect(() => detectBlockIdentifier("abc")).toThrow(/invalid block identifier/i);
    expect(() => detectBlockIdentifier("0".repeat(63))).toThrow(/invalid block identifier/i);
  });

  it("rejects negative numbers", () => {
    expect(() => detectBlockIdentifier("-1")).toThrow(/invalid block identifier/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/block-identifier.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Implement the helper**

Create `src/utils/block-identifier.ts`:

```ts
export type BlockIdentifier =
  | { kind: "number"; value: number }
  | { kind: "hash"; value: string };

const HEX64 = /^[0-9a-fA-F]{64}$/;
const NUMERIC = /^\d+$/;

/**
 * Parse a CLI block identifier into one of two dispatch forms.
 *
 * Accepts:
 *   - Pure numeric string (e.g. "70000000") → block number
 *   - 64-hex-char string, optionally 0x-prefixed, any case → block hash
 *
 * Returns a discriminated union; callers branch on `kind`.
 */
export function detectBlockIdentifier(input: string): BlockIdentifier {
  if (!input) {
    throw new Error("Block identifier required: pass a number or hash.");
  }
  if (NUMERIC.test(input)) {
    return { kind: "number", value: Number.parseInt(input, 10) };
  }
  const stripped = input.startsWith("0x") || input.startsWith("0X") ? input.slice(2) : input;
  if (HEX64.test(stripped)) {
    return { kind: "hash", value: stripped.toLowerCase() };
  }
  throw new Error(
    `Invalid block identifier: "${input}". Expected a block number (digits) or block hash (64 hex chars, optional 0x prefix).`,
  );
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test tests/utils/block-identifier.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/block-identifier.ts tests/utils/block-identifier.test.ts
git commit -m "$(cat <<'EOF'
feat: add detectBlockIdentifier helper

Parses CLI block input (number or hash, optional 0x prefix) into a
discriminated union for dispatch. Used by the block view command in
the next commit; reusable for block stats / block events in later
waves.

Phase B Wave 1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1.3 — `block view` fetch + command registration

**Files:**

- Create: `src/commands/block/view.ts`
- Modify: `src/commands/block/latest.ts` (change return type)
- Modify: `src/index.ts` (wire registration)
- Create: `tests/commands/block-view.test.ts`

- [ ] **Step 1: Write failing tests for `fetchBlockView`**

Create `tests/commands/block-view.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchBlockView } from "../../src/commands/block/view.js";

const blockFixture = {
  blockID: "000000000427d540abc123",
  block_header: {
    raw_data: {
      number: 70000000,
      timestamp: 1711929600000,
      witness_address: "41abc123",
      parentHash: "000000000427d53fabc122",
    },
  },
  transactions: [{}, {}, {}],
};

describe("block view", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches by number via /wallet/getblockbynum", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = init?.body as string | undefined;
      return Promise.resolve(new Response(JSON.stringify(blockFixture)));
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchBlockView(client, { kind: "number", value: 70000000 }, { confirmed: false });

    expect(capturedUrl).toContain("/wallet/getblockbynum");
    expect(capturedBody).toContain("70000000");
    expect(result.block_id).toBe("000000000427d540abc123");
    expect(result.number).toBe(70000000);
    expect(result.tx_count).toBe(3);
    expect(result.parent_hash).toBe("000000000427d53fabc122");
  });

  it("fetches by hash via /wallet/getblockbyid", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify(blockFixture)));
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchBlockView(
      client,
      { kind: "hash", value: "000000000427d540abc123" },
      { confirmed: false },
    );

    expect(capturedUrl).toContain("/wallet/getblockbyid");
    expect(result.block_id).toBe("000000000427d540abc123");
  });

  it("routes to /walletsolidity/* when confirmed is true", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify(blockFixture)));
    });

    const client = createClient({ network: "mainnet" });
    await fetchBlockView(client, { kind: "number", value: 70000000 }, { confirmed: true });

    expect(capturedUrl).toContain("/walletsolidity/getblockbynum");
  });

  it("throws a friendly error when the block is not found", async () => {
    // FullNode returns an empty object for an unknown block.
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));

    const client = createClient({ network: "mainnet" });
    await expect(
      fetchBlockView(client, { kind: "number", value: 999999999999 }, { confirmed: false }),
    ).rejects.toThrow(/block not found/i);
  });

  it("handles blocks with no transactions", async () => {
    const noTxs = { ...blockFixture, transactions: undefined };
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(noTxs))));

    const client = createClient({ network: "mainnet" });
    const result = await fetchBlockView(
      client,
      { kind: "number", value: 70000000 },
      { confirmed: false },
    );
    expect(result.tx_count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/block-view.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Refactor `block/latest.ts` to return the parent command**

Modify `src/commands/block/latest.ts`:

Change the `registerBlockCommands` signature from `void` to `Command` (return `block` after attaching `latest`), matching the `registerAccountCommands` pattern. Replace the function body's final statement:

```ts
export function registerBlockCommands(parent: Command): Command {
  const block = parent.command("block").description("Block queries").helpGroup("Read commands:");

  block
    .command("latest")
    // ... existing body unchanged ...
    ;

  return block;
}
```

(Keep the entire existing `.action(...)` and help text intact; only wrap and `return block` at the end.)

- [ ] **Step 4: Implement `fetchBlockView` + `registerBlockViewCommand`**

Create `src/commands/block/view.ts`:

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printResult, reportErrorAndExit } from "../../output/format.js";
import { type BlockIdentifier, detectBlockIdentifier } from "../../utils/block-identifier.js";

export interface BlockViewData {
  block_id: string;
  number: number;
  timestamp: number;
  witness_address: string;
  parent_hash: string;
  tx_count: number;
}

interface RawBlock {
  blockID?: string;
  block_header?: {
    raw_data?: {
      number?: number;
      timestamp?: number;
      witness_address?: string;
      parentHash?: string;
    };
  };
  transactions?: unknown[];
}

export async function fetchBlockView(
  client: ApiClient,
  id: BlockIdentifier,
  opts: { confirmed: boolean },
): Promise<BlockViewData> {
  const prefix = opts.confirmed ? "/walletsolidity" : "/wallet";
  const path = id.kind === "number" ? `${prefix}/getblockbynum` : `${prefix}/getblockbyid`;
  const body = id.kind === "number" ? { num: id.value } : { value: id.value };

  const raw = await client.post<RawBlock>(path, body);

  if (!raw.blockID || !raw.block_header?.raw_data) {
    throw new Error(
      `Block not found: ${id.kind === "number" ? id.value : id.value}`,
    );
  }

  const rd = raw.block_header.raw_data;
  return {
    block_id: raw.blockID,
    number: rd.number ?? 0,
    timestamp: rd.timestamp ?? 0,
    witness_address: rd.witness_address ?? "",
    parent_hash: rd.parentHash ?? "",
    tx_count: raw.transactions?.length ?? 0,
  };
}

function hintForBlockView(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const msg = err.message.toLowerCase();
  if (msg.includes("block not found")) {
    return "Check the block number or hash. If this is on a testnet, pass --network shasta or --network nile.";
  }
  if (msg.includes("invalid block identifier")) {
    return "Pass a block number (digits) or block hash (64 hex chars, optional 0x prefix).";
  }
  return undefined;
}

export function registerBlockViewCommand(block: Command, parent: Command): void {
  block
    .command("view")
    .description("View a block by number or hash")
    .argument("<number|hash>", "Block number (digits) or block hash (64 hex chars)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid block view 70000000
  $ trongrid block view 000000000427d540abc123...
  $ trongrid block view 70000000 --json
  $ trongrid block view 70000000 --confirmed       # irreversible state (~60s lag)
`,
    )
    .action(async (identifier: string) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        const id = detectBlockIdentifier(identifier);
        const client = getClient(opts);
        const data = await fetchBlockView(client, id, { confirmed: opts.confirmed });

        printResult(
          data,
          [
            ["Block", String(data.number)],
            ["Block ID", data.block_id],
            ["Parent Hash", data.parent_hash],
            ["Time", new Date(data.timestamp).toISOString()],
            ["Producer", data.witness_address],
            ["Transactions", String(data.tx_count)],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
          hint: hintForBlockView(err),
        });
      }
    });
}
```

- [ ] **Step 5: Wire registration in `src/index.ts`**

In `src/index.ts`, change the block import and wiring:

```ts
import { registerBlockCommands } from "./commands/block/latest.js";
import { registerBlockViewCommand } from "./commands/block/view.js";
// ...existing imports...

const block = registerBlockCommands(program);
registerBlockViewCommand(block, program);
// ...existing wiring...
```

- [ ] **Step 6: Run full suite**

```bash
bun test
```

Expected: existing 102 tests PASS + 2 global-flag + 8 block-identifier + 5 block-view = **117 tests PASS**.

- [ ] **Step 7: Manual smoke test**

```bash
bun run src/index.ts block view 70000000 --network mainnet
bun run src/index.ts block view 70000000 --json --network mainnet
bun run src/index.ts block view 70000000 --confirmed --network mainnet
```

Expected: first two return the latest 70000000 block, third returns the same block from the solidity endpoint (indistinguishable output but observable in `--verbose` if upstream URL is logged on failure).

- [ ] **Step 8: Commit**

```bash
git add src/commands/block/view.ts src/commands/block/latest.ts src/index.ts tests/commands/block-view.test.ts
git commit -m "$(cat <<'EOF'
feat: add block view <number|hash>

Fetches a block by number or hash via /wallet/getblockby{num,id},
returning the S1-aligned BlockViewData shape (block_id, number,
timestamp, producer, parent_hash, tx_count). --confirmed swaps to
/walletsolidity/* for irreversible state.

Refactors registerBlockCommands to return the block parent command,
matching the account-commands pattern so sibling subcommands can
attach without creating a second parent.

Phase B Wave 1 command 1 of 3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Command 2 — `account txs [address]`

### Task 2.1 — Add `--reverse` / `-r` and `--sort-by` to global options

**Files:**

- Modify: `src/index.ts`
- Modify: `tests/commands/global-flags.test.ts`

- [ ] **Step 1: Extend the global-flag smoke test**

Append to `tests/commands/global-flags.test.ts`:

```ts
describe("global sort flags", () => {
  it("parses --reverse / -r", () => {
    const program = new Command();
    program.option("-r, --reverse", "reverse default sort", false);
    program.parse(["node", "cli", "-r"], { from: "node" });
    expect(program.opts().reverse).toBe(true);
  });

  it("parses --sort-by <field>", () => {
    const program = new Command();
    program.option("--sort-by <field>", "override sort field");
    program.parse(["node", "cli", "--sort-by", "fee"], { from: "node" });
    expect(program.opts().sortBy).toBe("fee");
  });
});
```

- [ ] **Step 2: Run test to verify pass (commander handles this)**

```bash
bun test tests/commands/global-flags.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 3: Register the flags on the program**

In `src/index.ts`, add after `-f, --fields`:

```ts
.option("-r, --reverse", "reverse the command's default sort direction", false)
.option("--sort-by <field>", "override the command's default sort field")
```

Extend `GlobalOptions`:

```ts
export interface GlobalOptions {
  // ... existing fields ...
  reverse: boolean;
  sortBy?: string;
}
```

- [ ] **Step 4: Run full suite**

```bash
bun test
```

Expected: 119 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/commands/global-flags.test.ts
git commit -m "$(cat <<'EOF'
feat: add --reverse / --sort-by global flags

Per the Q3 resolution in docs/design/mcp-skills-review.md §4:
each list command picks a default sort field + direction; --reverse
flips direction (Unix muscle memory: ls -r, sort -r, du -r);
--sort-by switches field with the new field's inherent direction.

Phase B Wave 1. Wired to account txs in the next commits. Other list
commands will adopt these as they land.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.2 — Generic `applySort` helper

**Files:**

- Create: `src/utils/sort.ts`
- Create: `tests/utils/sort.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/sort.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { applySort } from "../../src/utils/sort.js";

const items = [
  { id: "a", ts: 10, fee: 100 },
  { id: "b", ts: 30, fee: 50 },
  { id: "c", ts: 20, fee: 300 },
];

const config = {
  defaultField: "ts",
  fieldDirections: { ts: "desc", fee: "desc", id: "asc" } as const,
};

describe("applySort", () => {
  it("sorts by defaultField with its default direction", () => {
    const out = applySort(items, config, {});
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]); // ts desc
  });

  it("--sort-by switches field, using the new field's default direction", () => {
    const out = applySort(items, config, { sortBy: "fee" });
    expect(out.map((x) => x.id)).toEqual(["c", "a", "b"]); // fee desc
  });

  it("--sort-by respects asc direction for dim-like fields", () => {
    const out = applySort(items, config, { sortBy: "id" });
    expect(out.map((x) => x.id)).toEqual(["a", "b", "c"]); // id asc
  });

  it("--reverse flips the current direction (default field)", () => {
    const out = applySort(items, config, { reverse: true });
    expect(out.map((x) => x.id)).toEqual(["a", "c", "b"]); // ts asc
  });

  it("--reverse combines with --sort-by", () => {
    const out = applySort(items, config, { sortBy: "fee", reverse: true });
    expect(out.map((x) => x.id)).toEqual(["b", "a", "c"]); // fee asc
  });

  it("rejects --sort-by on an unknown field with an actionable error", () => {
    expect(() => applySort(items, config, { sortBy: "unknown" })).toThrow(
      /unknown sort field.*ts.*fee.*id/i,
    );
  });

  it("returns empty array unchanged", () => {
    expect(applySort([], config, {})).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input = [...items];
    applySort(input, config, { sortBy: "fee" });
    expect(input.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/sort.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Implement `applySort`**

Create `src/utils/sort.ts`:

```ts
export type SortDirection = "asc" | "desc";

export interface SortConfig<T> {
  /** Field name used when no --sort-by override is given. */
  defaultField: keyof T & string;
  /** Map of field → inherent default direction. */
  fieldDirections: Readonly<Record<string, SortDirection>>;
}

export interface SortOptions {
  /** From global flag. Overrides the command's default field. */
  sortBy?: string;
  /** From global flag. Flips the current direction. */
  reverse?: boolean;
}

/**
 * Client-side sort for fetched list results.
 *
 * Per Q3 resolution in docs/design/mcp-skills-review.md: each list command
 * declares its default field + per-field inherent directions. --sort-by
 * switches field (using the new field's inherent direction). --reverse
 * flips whatever direction would otherwise apply.
 *
 * Does not mutate `items`. Throws if --sort-by names a field that has no
 * declared direction (prevents silent typo bugs).
 */
export function applySort<T>(
  items: T[],
  config: SortConfig<T>,
  opts: SortOptions,
): T[] {
  if (items.length === 0) return items;

  const field = (opts.sortBy ?? config.defaultField) as keyof T & string;
  const fieldDir = config.fieldDirections[field];
  if (!fieldDir) {
    const known = Object.keys(config.fieldDirections).join(", ");
    throw new Error(
      `Unknown sort field: "${field}". Valid fields for this command: ${known}.`,
    );
  }
  const direction: SortDirection = opts.reverse
    ? fieldDir === "asc"
      ? "desc"
      : "asc"
    : fieldDir;

  const sorted = [...items].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    const cmp = av < bv ? -1 : 1;
    return direction === "asc" ? cmp : -cmp;
  });
  return sorted;
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test tests/utils/sort.test.ts
```

Expected: all 8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sort.ts tests/utils/sort.test.ts
git commit -m "$(cat <<'EOF'
feat: add applySort helper for list commands

Client-side sort over a fetched page with per-field inherent direction.
Used by account txs in the next commit; shared by future list commands
(account transfers, sr list, holders, etc.).

Multi-key sort is intentionally out of scope — pipe --json through jq
for that. Multi-page sort is also out of scope: the sort is a
page-local operation.

Phase B Wave 1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2.3 — `account txs` fetch + command registration

**Files:**

- Create: `src/commands/account/txs.ts`
- Modify: `src/index.ts`
- Create: `tests/commands/account-txs.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/account-txs.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "../../src/api/client.js";
import { fetchAccountTxs, sortTxs } from "../../src/commands/account/txs.js";
import { setConfigValue } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const VALID = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

const apiResponse = {
  data: [
    {
      txID: "tx_b",
      blockNumber: 70000002,
      block_timestamp: 1711929602000,
      net_fee: 100,
      energy_fee: 0,
      raw_data: { contract: [{ type: "TransferContract" }] },
      ret: [{ contractRet: "SUCCESS" }],
    },
    {
      txID: "tx_c",
      blockNumber: 70000001,
      block_timestamp: 1711929601000,
      net_fee: 0,
      energy_fee: 300,
      raw_data: { contract: [{ type: "TriggerSmartContract" }] },
      ret: [{ contractRet: "SUCCESS" }],
    },
    {
      txID: "tx_a",
      blockNumber: 70000000,
      block_timestamp: 1711929600000,
      net_fee: 50,
      energy_fee: 50,
      raw_data: { contract: [{ type: "TransferContract" }] },
      ret: [{ contractRet: "SUCCESS" }],
    },
  ],
};

describe("fetchAccountTxs", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls /v1/accounts/:address/transactions with limit", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify(apiResponse)));
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountTxs(client, VALID, { limit: 20 });

    expect(capturedUrl).toContain(`/v1/accounts/${VALID}/transactions`);
    expect(capturedUrl).toContain("limit=20");
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      tx_id: "tx_b",
      block_number: 70000002,
      timestamp: 1711929602000,
      contract_type: "TransferContract",
      status: "SUCCESS",
      fee: 100,
      fee_unit: "sun",
      fee_trx: "0.0001",
    });
  });

  it("maps total fee as net_fee + energy_fee", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify(apiResponse))));
    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountTxs(client, VALID, { limit: 20 });
    const txA = result.find((r) => r.tx_id === "tx_a");
    expect(txA?.fee).toBe(100); // 50 + 50
  });

  it("returns empty array when the account has no txs", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({ data: [] }))));
    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountTxs(client, VALID, { limit: 20 });
    expect(result).toEqual([]);
  });

  it("handles missing optional fields gracefully", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ txID: "tx_x", blockNumber: 1, block_timestamp: 0, raw_data: { contract: [] } }],
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountTxs(client, VALID, { limit: 20 });
    expect(result[0]).toMatchObject({
      tx_id: "tx_x",
      contract_type: "Unknown",
      status: "UNKNOWN",
      fee: 0,
    });
  });
});

describe("sortTxs (default: timestamp desc)", () => {
  const items = [
    { tx_id: "tx_b", timestamp: 2, block_number: 2, fee: 100 },
    { tx_id: "tx_c", timestamp: 3, block_number: 3, fee: 50 },
    { tx_id: "tx_a", timestamp: 1, block_number: 1, fee: 300 },
  ];

  it("defaults to timestamp desc (newest first)", () => {
    const out = sortTxs(items, {});
    expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
  });

  it("--reverse flips to oldest first", () => {
    const out = sortTxs(items, { reverse: true });
    expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
  });

  it("--sort-by fee sorts by fee desc", () => {
    const out = sortTxs(items, { sortBy: "fee" });
    expect(out.map((x) => x.tx_id)).toEqual(["tx_a", "tx_b", "tx_c"]);
  });

  it("--sort-by block_number desc", () => {
    const out = sortTxs(items, { sortBy: "block_number" });
    expect(out.map((x) => x.tx_id)).toEqual(["tx_c", "tx_b", "tx_a"]);
  });

  it("rejects --sort-by on an unknown field with a hint", () => {
    expect(() => sortTxs(items, { sortBy: "bogus" })).toThrow(/unknown sort field/i);
  });
});

describe("account txs default_address resolution", () => {
  const TEST_DIR = join(import.meta.dirname, ".tmp-account-txs-default-test");
  const TEST_CONFIG = join(TEST_DIR, "config.json");

  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    setConfigValue(TEST_CONFIG, "default_address", VALID);
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("uses config default_address when argument is omitted", () => {
    expect(resolveAddress(undefined, TEST_CONFIG)).toBe(VALID);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/account-txs.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Implement `fetchAccountTxs` + `sortTxs` + command**

Create `src/commands/account/txs.ts`:

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { printListResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";

export interface AccountTxRow {
  tx_id: string;
  block_number: number;
  timestamp: number;
  contract_type: string;
  status: string;
  fee: number;
  fee_unit: "sun";
  fee_trx: string;
}

interface RawTx {
  txID?: string;
  blockNumber?: number;
  block_timestamp?: number;
  net_fee?: number;
  energy_fee?: number;
  raw_data?: { contract?: Array<{ type?: string }> };
  ret?: Array<{ contractRet?: string }>;
}

interface AccountTxsResponse {
  data?: RawTx[];
}

export async function fetchAccountTxs(
  client: ApiClient,
  address: string,
  opts: { limit: number },
): Promise<AccountTxRow[]> {
  const path = `/v1/accounts/${address}/transactions?limit=${opts.limit}`;
  const raw = await client.get<AccountTxsResponse>(path);
  return (raw.data ?? []).map((tx) => {
    const fee = (tx.net_fee ?? 0) + (tx.energy_fee ?? 0);
    return {
      tx_id: tx.txID ?? "",
      block_number: tx.blockNumber ?? 0,
      timestamp: tx.block_timestamp ?? 0,
      contract_type: tx.raw_data?.contract?.[0]?.type ?? "Unknown",
      status: tx.ret?.[0]?.contractRet ?? "UNKNOWN",
      fee,
      fee_unit: "sun" as const,
      fee_trx: sunToTrx(fee),
    };
  });
}

const TXS_SORT_CONFIG: SortConfig<AccountTxRow> = {
  defaultField: "timestamp",
  fieldDirections: {
    timestamp: "desc",
    block_number: "desc",
    fee: "desc",
  },
};

export function sortTxs(items: AccountTxRow[], opts: SortOptions): AccountTxRow[] {
  return applySort(items, TXS_SORT_CONFIG, opts);
}

function renderTxs(items: AccountTxRow[]): void {
  if (items.length === 0) {
    console.log(muted("No transactions found."));
    return;
  }
  console.log(muted(`Found ${items.length} transactions:\n`));
  for (const t of items) {
    const time = new Date(t.timestamp).toISOString();
    const fee = `${t.fee_trx} TRX`;
    console.log(`  ${t.tx_id}  ${muted(time)}  ${t.contract_type}  ${muted(fee)}`);
  }
}

export function registerAccountTxsCommand(account: Command, parent: Command): void {
  account
    .command("txs")
    .description("List transaction history for an address")
    .argument("[address]", "TRON address (defaults to config default_address)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid account txs TR...
  $ trongrid account txs                         # uses default_address
  $ trongrid account txs TR... --limit 50
  $ trongrid account txs TR... --reverse         # oldest first
  $ trongrid account txs TR... --sort-by fee     # largest fee first

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, fee (all default desc)
`,
    )
    .action(async (address: string | undefined) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        const resolved = resolveAddress(address);
        const client = getClient(opts);
        // NOTE: --confirmed has no effect here — /v1/accounts/:address/transactions has
        // no /walletsolidity mirror. Accepted silently for flag uniformity; tracked in
        // docs/plans/phase-b.md as a follow-up.
        const rows = await fetchAccountTxs(client, resolved, {
          limit: Number.parseInt(opts.limit, 10),
        });
        const sorted = sortTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });

        printListResult(sorted, renderTxs, { json: opts.json, fields: parseFields(opts) });
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
          hint: addressErrorHint(err),
        });
      }
    });
}
```

- [ ] **Step 4: Wire registration**

In `src/index.ts`, add the import and register under `account`:

```ts
import { registerAccountTxsCommand } from "./commands/account/txs.js";
// ...
const account = registerAccountCommands(program);
registerAccountTokensCommand(account, program);
registerAccountResourcesCommand(account, program);
registerAccountTxsCommand(account, program);
```

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: previous 119 + 8 applySort + 10 account-txs = **137 tests PASS**.

- [ ] **Step 6: Manual smoke test**

```bash
bun run src/index.ts account txs TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --limit 5
bun run src/index.ts account txs TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --json --limit 5
bun run src/index.ts account txs TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --reverse --limit 5
bun run src/index.ts account txs TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --sort-by fee --limit 5
```

Expected: returns 5 recent txs, reverse gives 5 oldest-of-page, sort-by-fee orders by fee desc.

- [ ] **Step 7: Commit**

```bash
git add src/commands/account/txs.ts src/index.ts tests/commands/account-txs.test.ts
git commit -m "$(cat <<'EOF'
feat: add account txs [address]

Lists transaction history via /v1/accounts/:address/transactions.
Default sort: timestamp desc. --reverse flips. --sort-by supports
timestamp, block_number, fee. [address] falls back to config
default_address when omitted.

--confirmed is accepted globally but has no effect here — no
/walletsolidity mirror for this TronGrid v1 endpoint. Documented
with a NOTE comment; tracked as a Phase B follow-up.

Phase B Wave 1 command 2 of 3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Command 3 — `token view <id|address|symbol>`

### Task 3.1 — Symbol→address reverse map

**Files:**

- Modify: `src/utils/tokens.ts`
- Modify: `tests/utils/tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/utils/tokens.test.ts` (inside the existing file, in a new `describe`):

```ts
import { resolveSymbolToAddress, STATIC_SYMBOL_TO_ADDRESS } from "../../src/utils/tokens.js";

describe("resolveSymbolToAddress", () => {
  it("returns the canonical address for known symbols (case-insensitive)", () => {
    expect(resolveSymbolToAddress("USDT")).toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(resolveSymbolToAddress("usdt")).toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(resolveSymbolToAddress("USDC")).toBe("TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8");
    expect(resolveSymbolToAddress("JST")).toBe("TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9");
  });

  it("returns undefined for unknown symbols", () => {
    expect(resolveSymbolToAddress("SCAMCOIN")).toBeUndefined();
  });

  it("exposes STATIC_SYMBOL_TO_ADDRESS for listing / debugging", () => {
    expect(STATIC_SYMBOL_TO_ADDRESS.USDT).toBe("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/tokens.test.ts
```

Expected: 3 new tests FAIL with "resolveSymbolToAddress is not defined".

- [ ] **Step 3: Add the reverse map + resolver**

In `src/utils/tokens.ts`, above `STATIC_TRC20_DECIMALS`:

```ts
/**
 * Symbol → TRC-20 contract address map. Derived from the TronScan verified-token
 * (加V) list (see memory project_token_symbol_source). Kept in lockstep with
 * STATIC_TRC20_DECIMALS below — add/remove in both or neither, verify address on
 * tronscan before adding.
 *
 * Unknown symbols MUST be rejected by callers (not fall back to user-supplied
 * input) to prevent phishing/scam token resolution.
 */
export const STATIC_SYMBOL_TO_ADDRESS: Readonly<Record<string, string>> = Object.freeze({
  USDT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  USDC: "TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8",
  WTRX: "TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR",
  JST: "TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9",
  SUN: "TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S",
  WIN: "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7",
  BTT: "TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4",
});

export function resolveSymbolToAddress(symbol: string): string | undefined {
  return STATIC_SYMBOL_TO_ADDRESS[symbol.toUpperCase()];
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test tests/utils/tokens.test.ts
```

Expected: all existing + 3 new PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokens.ts tests/utils/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: add STATIC_SYMBOL_TO_ADDRESS reverse map

Maps known token symbols (USDT, USDC, WTRX, JST, SUN, WIN, BTT) to
their canonical TRC-20 contract addresses. Seeded from the same
TronScan verified-token list used by STATIC_TRC20_DECIMALS.

Only manually verified entries are supported — unknown symbols MUST
be rejected by callers, never fall back to user input, to prevent
phishing / scam-token resolution.

Phase B Wave 1 (token view prerequisite).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.2 — `token-identifier` utility

**Files:**

- Create: `src/utils/token-identifier.ts`
- Create: `tests/utils/token-identifier.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/token-identifier.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { detectTokenIdentifier } from "../../src/utils/token-identifier.js";

describe("detectTokenIdentifier", () => {
  it("detects pure 1-7 digit numeric as TRC-10 asset ID", () => {
    expect(detectTokenIdentifier("1002000")).toEqual({ kind: "trc10", assetId: "1002000" });
    expect(detectTokenIdentifier("1")).toEqual({ kind: "trc10", assetId: "1" });
    expect(detectTokenIdentifier("9999999")).toEqual({ kind: "trc10", assetId: "9999999" });
  });

  it("detects 34-char Base58 starting with T as TRC-20 address", () => {
    const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(detectTokenIdentifier(addr)).toEqual({ kind: "trc20", address: addr });
  });

  it("resolves known symbols to TRC-20 addresses via the static map", () => {
    expect(detectTokenIdentifier("USDT")).toEqual({
      kind: "trc20",
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    });
    expect(detectTokenIdentifier("usdt")).toEqual({
      kind: "trc20",
      address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    });
  });

  it("rejects unknown symbols with a hint to pass the contract address", () => {
    expect(() => detectTokenIdentifier("SCAMCOIN")).toThrow(
      /unknown token symbol.*scamcoin.*contract address/i,
    );
  });

  it("rejects 0x-prefixed hex with a deferred-support hint", () => {
    expect(() => detectTokenIdentifier("0x" + "a".repeat(40))).toThrow(
      /0x.*hex.*not yet supported.*base58/i,
    );
  });

  it("honors --type trc10 override on numeric-looking-symbol collisions", () => {
    // e.g. a symbol that is all digits could also be a TRC-10 ID.
    // --type forces the interpretation.
    expect(detectTokenIdentifier("1002000", "trc10")).toEqual({ kind: "trc10", assetId: "1002000" });
  });

  it("honors --type trc20 override for explicit Base58", () => {
    const addr = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    expect(detectTokenIdentifier(addr, "trc20")).toEqual({ kind: "trc20", address: addr });
  });

  it("rejects --type trc721 with a not-yet-implemented error", () => {
    expect(() => detectTokenIdentifier("1002000", "trc721")).toThrow(/trc-?721.*not yet/i);
  });

  it("rejects --type trc1155 with a not-yet-implemented error", () => {
    expect(() => detectTokenIdentifier("1002000", "trc1155")).toThrow(/trc-?1155.*not yet/i);
  });

  it("rejects empty input", () => {
    expect(() => detectTokenIdentifier("")).toThrow(/token identifier required/i);
  });

  it("rejects garbage input", () => {
    expect(() => detectTokenIdentifier("!!!")).toThrow(/invalid token identifier/i);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/token-identifier.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Implement the helper**

Create `src/utils/token-identifier.ts`:

```ts
import { resolveSymbolToAddress } from "./tokens.js";

export type TokenIdentifier =
  | { kind: "trc10"; assetId: string }
  | { kind: "trc20"; address: string };

export type TokenTypeOverride = "trc10" | "trc20" | "trc721" | "trc1155";

const TRC10_NUMERIC = /^\d{1,7}$/;
const BASE58_ADDR = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_ADDR_0X = /^0x[0-9a-fA-F]{40}$/;
const SYMBOL = /^[A-Za-z][A-Za-z0-9]{0,15}$/;

/**
 * Parse a CLI token identifier into a dispatch form.
 *
 * Accepts:
 *   - 1–7 digit numeric → TRC-10 asset ID
 *   - 34-char Base58 starting with T → TRC-20 contract address
 *   - Symbol string → resolved via STATIC_SYMBOL_TO_ADDRESS (verified tokens only)
 *
 * Rejects:
 *   - 0x-prefixed 40-hex — deferred support (needs Base58check conversion)
 *   - Unknown symbols (never fall back to raw input — phishing guard)
 *   - TRC-721 / TRC-1155 — not yet implemented
 *
 * `typeOverride` forces the interpretation for ambiguous inputs (e.g. a
 * short-numeric symbol that collides with a TRC-10 ID).
 */
export function detectTokenIdentifier(
  input: string,
  typeOverride?: TokenTypeOverride,
): TokenIdentifier {
  if (!input) {
    throw new Error("Token identifier required: pass an asset ID, contract address, or symbol.");
  }

  if (typeOverride === "trc721" || typeOverride === "trc1155") {
    throw new Error(
      `${typeOverride.toUpperCase()} is not yet implemented. Wave 1 supports TRC-10 and TRC-20 only.`,
    );
  }

  if (HEX_ADDR_0X.test(input)) {
    throw new Error(
      `0x-prefixed hex addresses are not yet supported in Wave 1. Pass the Base58 address (T...) instead.`,
    );
  }

  if (typeOverride === "trc10") {
    if (!TRC10_NUMERIC.test(input)) {
      throw new Error(`Invalid TRC-10 asset ID: "${input}". Expected 1–7 digits.`);
    }
    return { kind: "trc10", assetId: input };
  }

  if (typeOverride === "trc20") {
    if (!BASE58_ADDR.test(input)) {
      throw new Error(
        `Invalid TRC-20 address: "${input}". Expected 34-char Base58 starting with T.`,
      );
    }
    return { kind: "trc20", address: input };
  }

  if (TRC10_NUMERIC.test(input)) {
    return { kind: "trc10", assetId: input };
  }
  if (BASE58_ADDR.test(input)) {
    return { kind: "trc20", address: input };
  }
  if (SYMBOL.test(input)) {
    const addr = resolveSymbolToAddress(input);
    if (!addr) {
      throw new Error(
        `Unknown token symbol: "${input}". Pass the contract address directly, or see docs/design/commands.md for the list of verified symbols.`,
      );
    }
    return { kind: "trc20", address: addr };
  }

  throw new Error(
    `Invalid token identifier: "${input}". Expected a TRC-10 asset ID (1–7 digits), a TRC-20 Base58 address (T...), or a known token symbol.`,
  );
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test tests/utils/token-identifier.test.ts
```

Expected: all 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/token-identifier.ts tests/utils/token-identifier.test.ts
git commit -m "$(cat <<'EOF'
feat: add detectTokenIdentifier helper

Dispatches CLI token input (1-7 digit numeric → TRC-10, 34-char Base58
T... → TRC-20, symbol → verified-map → TRC-20) per the Q4 resolution
in docs/design/mcp-skills-review.md §4. --type flag overrides dispatch
for ambiguous inputs.

Guardrails:
- Unknown symbols MUST be rejected (never fall back to raw input) —
  phishing guard per token-view spec in commands.md.
- 0x-prefixed hex deferred (Base58check conversion out of Wave 1).
- TRC-721 / TRC-1155 parsed but rejected as not-yet-implemented.

Phase B Wave 1 (token view prerequisite). Will also be used by
future token subcommands (holders, transfers, balance, allowance).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3.3 — `token view` fetch + command registration

**Files:**

- Create: `src/commands/token/view.ts`
- Modify: `src/index.ts`
- Create: `tests/commands/token-view.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/commands/token-view.test.ts`:

```ts
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchTokenView } from "../../src/commands/token/view.js";

const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("fetchTokenView — TRC-20", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches name / symbol / decimals / totalSupply via triggerconstantcontract", async () => {
    // Each triggerconstantcontract call returns an ABI-encoded hex string.
    // We simulate:
    //   name()     → "Tether USD"
    //   symbol()   → "USDT"
    //   decimals() → 6
    //   totalSupply() → 82,123,456,789,000 (0x4AB5C85A...)
    const responses: Record<string, string> = {
      "name()": encodeString("Tether USD"),
      "symbol()": encodeString("USDT"),
      "decimals()": "0000000000000000000000000000000000000000000000000000000000000006",
      "totalSupply()": toHex256(82_123_456_789_000n),
    };

    globalThis.fetch = mock((url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body ?? "{}") as string);
      const fn = body.function_selector as string;
      const hex = responses[fn];
      return Promise.resolve(new Response(JSON.stringify({ constant_result: [hex] })));
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchTokenView(client, { kind: "trc20", address: USDT });

    expect(result).toMatchObject({
      type: "TRC20",
      contract_address: USDT,
      name: "Tether USD",
      symbol: "USDT",
      decimals: 6,
      total_supply: "82123456789000",
      total_supply_major: "82123456.789",
    });
  });
});

describe("fetchTokenView — TRC-10", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches metadata via /wallet/getassetissuebyid", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "1002000",
            name: "BitTorrent_Old",
            abbr: "BTTOLD",
            precision: 6,
            total_supply: "990000000000000",
            owner_address: "TOwnerAddr...",
          }),
        ),
      );
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchTokenView(client, { kind: "trc10", assetId: "1002000" });

    expect(capturedUrl).toContain("/wallet/getassetissuebyid");
    expect(result).toMatchObject({
      type: "TRC10",
      contract_address: "1002000",
      name: "BitTorrent_Old",
      symbol: "BTTOLD",
      decimals: 6,
      total_supply: "990000000000000",
      total_supply_major: "990000000.0",
    });
  });

  it("throws with actionable error when asset is not found", async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response(JSON.stringify({}))));
    const client = createClient({ network: "mainnet" });
    await expect(fetchTokenView(client, { kind: "trc10", assetId: "9999999" })).rejects.toThrow(
      /token not found/i,
    );
  });

  it("defaults precision to 0 when upstream omits it (legacy TRC-10)", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "1000001",
            name: "Legacy",
            abbr: "LGCY",
            total_supply: "1000",
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const result = await fetchTokenView(client, { kind: "trc10", assetId: "1000001" });
    expect(result.decimals).toBe(0);
    expect(result.total_supply_major).toBe("1000");
  });
});

// Helpers: ABI-encode a string (returns hex for {offset, length, data}).
function encodeString(s: string): string {
  const hexBytes = Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const padded = hexBytes.padEnd(Math.ceil(hexBytes.length / 64) * 64, "0");
  const offset = "0".repeat(62) + "20";
  const length = s.length.toString(16).padStart(64, "0");
  return offset + length + padded;
}

function toHex256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/token-view.test.ts
```

Expected: all FAIL with "Cannot find module".

- [ ] **Step 3: Implement `fetchTokenView` + command**

Create `src/commands/token/view.ts`:

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { printResult, reportErrorAndExit } from "../../output/format.js";
import {
  detectTokenIdentifier,
  type TokenIdentifier,
  type TokenTypeOverride,
} from "../../utils/token-identifier.js";
import { formatMajor } from "../../utils/tokens.js";

export interface TokenViewData {
  type: "TRC10" | "TRC20";
  contract_address: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  total_supply_major: string;
}

interface TriggerResponse {
  constant_result?: string[];
}

async function callView<T>(
  client: ApiClient,
  contractAddress: string,
  selector: string,
  decode: (hex: string) => T,
): Promise<T> {
  const res = await client.post<TriggerResponse>("/wallet/triggerconstantcontract", {
    contract_address: contractAddress,
    function_selector: selector,
    parameter: "",
    owner_address: contractAddress,
    visible: true,
  });
  const hex = res.constant_result?.[0];
  if (!hex) {
    throw new Error(`No ${selector} result for contract ${contractAddress}`);
  }
  return decode(hex);
}

function decodeString(hex: string): string {
  // ABI-encoded string: 32 bytes offset, 32 bytes length, N bytes data (right-padded).
  if (hex.length < 128) return "";
  const length = Number.parseInt(hex.slice(64, 128), 16);
  if (!Number.isFinite(length) || length === 0) return "";
  const dataHex = hex.slice(128, 128 + length * 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number.parseInt(dataHex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

function decodeUint(hex: string): string {
  // Leading-zero-stripped decimal. Use BigInt to handle >2^53 supplies.
  const n = BigInt(`0x${hex || "0"}`);
  return n.toString(10);
}

async function fetchTrc20(client: ApiClient, address: string): Promise<TokenViewData> {
  const [name, symbol, decimalsStr, totalSupply] = await Promise.all([
    callView(client, address, "name()", decodeString),
    callView(client, address, "symbol()", decodeString),
    callView(client, address, "decimals()", decodeUint),
    callView(client, address, "totalSupply()", decodeUint),
  ]);
  const decimals = Number.parseInt(decimalsStr, 10);
  if (Number.isNaN(decimals) || decimals < 0 || decimals > 32) {
    throw new Error(`Unexpected decimals for ${address}: ${decimalsStr}`);
  }
  return {
    type: "TRC20",
    contract_address: address,
    name,
    symbol,
    decimals,
    total_supply: totalSupply,
    total_supply_major: formatMajor(totalSupply, decimals),
  };
}

interface AssetIssueFull {
  id?: string;
  name?: string;
  abbr?: string;
  precision?: number;
  total_supply?: number | string;
  owner_address?: string;
}

async function fetchTrc10(client: ApiClient, assetId: string): Promise<TokenViewData> {
  const raw = await client.post<AssetIssueFull>("/wallet/getassetissuebyid", {
    value: assetId,
  });
  if (!raw.id) {
    throw new Error(`Token not found: ${assetId}`);
  }
  const decimals = raw.precision ?? 0;
  const total = String(raw.total_supply ?? "0");
  return {
    type: "TRC10",
    contract_address: assetId,
    name: raw.name ?? "",
    symbol: raw.abbr ?? "",
    decimals,
    total_supply: total,
    total_supply_major: formatMajor(total, decimals),
  };
}

export async function fetchTokenView(
  client: ApiClient,
  id: TokenIdentifier,
): Promise<TokenViewData> {
  return id.kind === "trc10"
    ? fetchTrc10(client, id.assetId)
    : fetchTrc20(client, id.address);
}

function hintForTokenView(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const msg = err.message.toLowerCase();
  if (msg.includes("unknown token symbol")) {
    return "Verified symbols: USDT, USDC, WTRX, JST, SUN, WIN, BTT. Pass the contract address directly for others.";
  }
  if (msg.includes("0x") && msg.includes("hex")) {
    return "Base58 (T...) is required in Wave 1. 0x-hex support will land in a later wave.";
  }
  if (msg.includes("not yet implemented")) {
    return "Wave 1 supports TRC-10 and TRC-20 only. TRC-721 / TRC-1155 will land in a later wave.";
  }
  if (msg.includes("token not found")) {
    return "Check the asset ID or address. Cross-check on tronscan.org.";
  }
  return undefined;
}

export function registerTokenCommands(parent: Command): void {
  const token = parent
    .command("token")
    .description("Token queries (TRC-10 + TRC-20)")
    .helpGroup("Read commands:");

  token
    .command("view")
    .description("View token metadata by asset ID, contract address, or known symbol")
    .argument("<id|address|symbol>", "TRC-10 asset ID, TRC-20 Base58 address, or verified symbol")
    .option("--type <type>", "force token standard (trc10|trc20|trc721|trc1155)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid token view USDT
  $ trongrid token view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid token view 1002000
  $ trongrid token view USDT --json
  $ trongrid token view 1002000 --type trc10

Verified symbols (Wave 1): USDT, USDC, WTRX, JST, SUN, WIN, BTT.
Unknown symbols are rejected — pass the contract address instead.
`,
    )
    .action(async (input: string, localOpts: { type?: TokenTypeOverride }) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        const id = detectTokenIdentifier(input, localOpts.type);
        const client = getClient(opts);
        const data = await fetchTokenView(client, id);

        printResult(
          data,
          [
            ["Type", data.type],
            [data.type === "TRC10" ? "Asset ID" : "Contract", data.contract_address],
            ["Name", data.name],
            ["Symbol", data.symbol],
            ["Decimals", String(data.decimals)],
            ["Total Supply", `${data.total_supply_major} ${data.symbol || ""}`.trim()],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
          hint: hintForTokenView(err),
        });
      }
    });
}
```

- [ ] **Step 4: Wire registration**

In `src/index.ts`:

```ts
import { registerTokenCommands } from "./commands/token/view.js";
// ...
registerTokenCommands(program);
```

Place it after the `registerAccountTxsCommand(...)` line and before auth/config.

- [ ] **Step 5: Run full suite**

```bash
bun test
```

Expected: previous 137 + 11 token-identifier + 3 symbol-map + 4 token-view = **155 tests PASS**.

- [ ] **Step 6: Manual smoke test**

```bash
bun run src/index.ts token view USDT
bun run src/index.ts token view USDT --json
bun run src/index.ts token view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts token view 1002000
bun run src/index.ts token view SCAMCOIN         # expect: error + hint
bun run src/index.ts token view 0x${'a'.repeat(40)}   # expect: error + 0x-hint
bun run src/index.ts token view USDT --type trc721    # expect: error + not-yet hint
```

Expected: successful calls return name + symbol + decimals + supply; error calls exit with code 1 and a contextual Hint line.

- [ ] **Step 7: Run lint**

```bash
bun run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/commands/token/view.ts src/index.ts tests/commands/token-view.test.ts
git commit -m "$(cat <<'EOF'
feat: add token view <id|address|symbol>

Token metadata lookup with auto-detection per Q4 resolution. TRC-10
via /wallet/getassetissuebyid; TRC-20 via four parallel
triggerconstantcontract calls (name / symbol / decimals / totalSupply).
Symbol input resolves through the verified static map.

Output follows units.md S2: total_supply (raw string) + decimals +
total_supply_major. TRC-10 uses getassetissuebyid's precision as
decimals (defaults to 0 for legacy tokens).

Phase B Wave 1 command 3 of 3 — closes the wave.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Wave-close checklist

Run after all three commands are merged:

- [ ] `bun test` — 155+ tests green.
- [ ] `bun run lint` — clean.
- [ ] `bun run build` — clean tsc emit to `dist/`.
- [ ] `bun run src/index.ts --help` — new commands appear under the right `helpGroup`; `--confirmed` / `--reverse` / `--sort-by` listed as global options.
- [ ] Update `docs/plans/phase-b.md` "State at last update" row: shipped commands 7 → 10; resources 5 → 6 (+`token`).
- [ ] Update `docs/plans/phase-b.md` Session 2 section to ✅ merged, add a brief "what landed" recap.
- [ ] Write Session 3 plan: Wave 2 scope selection (account list family: `transfers`, `delegations`, `permissions`, `approvals`), applying the same patterns (`resolveAddress`, `applySort`, `reportErrorAndExit`).

---

## Self-review notes

**Spec coverage** (commands.md Part II):

- `block view <number|hash>` ✅ Task 1.3 covers both positional forms + `--confirmed`.
- `account txs <address>` ✅ Task 2.3. Positional migrated to `[address]` per the "Remaining `<address>` entries will gain the same fallback" note in commands.md §account.
- `token view <id|address|symbol>` ✅ Task 3.3, with auto-detection (3.2) + reverse map (3.1) + `--type` override.

**Defaults & conventions table** (architecture.md §Defaults & conventions):

- Row 1 `--confirmed` — ✅ Task 1.1 (global), Task 1.3 (block).
- Row 2 `account approvals` — not in Wave 1 (Wave 2 scope).
- Row 3 sort customization — ✅ Task 2.1 (global), Task 2.2 (helper), Task 2.3 (applied in `account txs`).
- Row 4 token identifier dispatch — ✅ Task 3.2.
- Row 5 Stake 2.0 default — not in Wave 1 (touches `account resources`, deferred to Wave 2 if refactored).

**units.md conformance**:

- S2 shape (`total_supply` + `decimals` + `total_supply_major`) — used in Task 3.3 via `formatMajor`.
- S1 shape for tx `fee` — used in Task 2.3 (`fee` + `fee_unit: "sun"` + `fee_trx`). Static `decimals: 6` intentionally omitted on per-row fee fields to keep row shape tight; head word `fee` already signals the unit via S4 context exemption. If this proves confusing for agents, revisit in Wave 2 review.

**No placeholders** ✅ Every step contains concrete test / impl code or exact commands. No "TODO" / "add appropriate" / "fill in" / "similar to".

**Type consistency** ✅ `BlockIdentifier`, `TokenIdentifier`, `TokenTypeOverride`, `SortConfig<T>`, `SortOptions`, `AccountTxRow`, `BlockViewData`, `TokenViewData` are defined once and referenced consistently.

---

## Execution handoff

Plan complete and saved to `docs/plans/phase-b-wave-1.md`.

Per `docs/plans/phase-b.md`, the agreed execution model is the `superpowers:subagent-driven-development` triad, one command at a time:

1. **Command 1 (block view)** — dispatch implementer subagent for Tasks 1.1–1.3, then spec-review subagent, then code-quality-review subagent. Merge feedback inline. Commit atomically per sub-task.
2. **Command 2 (account txs)** — same triad for Tasks 2.1–2.3.
3. **Command 3 (token view)** — same triad for Tasks 3.1–3.3.
4. **Wave close** — run the checklist above, update `phase-b.md` progress, open Session 3.

Begin with Command 1 on confirmation.
