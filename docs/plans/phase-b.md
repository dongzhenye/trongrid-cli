# Phase B — Default Address and Token Decimals (Post-Foundation Improvements)

> **Convention update 2026-04-15.** This plan was originally titled "Phase A+". It has been regularized to **Phase B** per [`meta/WORKFLOW.md §2`](https://github.com/dongzhenye/meta) (one-level phase letters, no sub-phases or `+` suffixes). Body text and historical task logs still contain the original "Phase A+" language in places — those references describe what was shipped at the time and are left untouched per the mid-stream-convention-change rule ("don't rewrite shipped history, doc-layer regularization + a note at the top is sufficient"). For the full cross-walk see the top of [`../roadmap.md`](../roadmap.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver two Phase A+ features — (A) a `default_address` config key that makes `<address>` positional optional across `account` commands, and (B) scalable-token decimals resolution in `account tokens` output (TRC-20 via hybrid static-map + on-chain `decimals()` fallback; TRC-10 via `/wallet/getassetissuebyid.precision`). Plus a small follow-on (Task A8) to bring `account view` into line with the class S1 bonus `decimals` rule. All three follow the committed decisions in `architecture.md`, `design/competitors.md`, and the deductive JSON unit shape contract in `design/units.md` (principles P1–P7, scenarios S1–S5).

**Architecture:** Two features that touch overlapping code in `src/commands/account/`. Feature A adds config-backed address resolution via a new `src/utils/resolve-address.ts` helper, plus key-level validation in `config set`. Feature B adds TRC20 decimals via a new `src/utils/tokens.ts` module with a static map and an on-chain fallback using TronGrid's `/wallet/triggerconstantcontract` endpoint. No new production dependencies.

**Tech Stack:** TypeScript, commander.js, Bun test. Native `fetch` via existing `src/api/client.ts`.

**Spec:**

- [`architecture.md` §Positional argument ordering](../architecture.md#positional-argument-ordering) — why default address is committed
- [`design/units.md`](../design/units.md) — JSON unit shape contract (P1–P7 + S1–S5); the authoritative source for `account tokens` class S2 shape and `account view` class S1 shape
- [`architecture.md` §Output Design](../architecture.md#output-design) — project-level summary linking to `design/units.md`
- [`design/competitors.md` §Decision 2](../design/competitors.md#decision-2-token-decimals-strategy) — rationale for the hybrid decimals strategy
- [`roadmap.md` Phase B](../roadmap.md#phase-b--post-foundation-improvements-%E2%9C%85-pre-publish-untagged) — scope and priority (renamed from "Phase A+" 2026-04-15)

**Out of scope:**

- `tx view` default-address fallback (tx takes a hash, not an address).
- Symbol resolution via on-chain `symbol()` (static symbol map already exists; this plan only tackles decimals).

**In scope as side-effect:** `config set` rejects unknown keys. This is a separate "config set: validate key against known config fields" line item in the roadmap; it's a 2-line change while we're touching `config/set.ts`, so doing it now avoids touching the file twice.

---

## File Map

### Feature A — Default Address

| File | Responsibility |
|------|----------------|
| Modify `src/utils/config.ts` | Add `default_address?: string` to `TrongridConfig`; export `CONFIG_KEYS` set. |
| Modify `src/commands/config/set.ts` | Validate key against `CONFIG_KEYS`; call `validateAddress` when key is `default_address`. |
| Create `src/utils/resolve-address.ts` | `resolveAddress(providedArg)` — returns validated arg if given, else reads `config.default_address`, else throws an actionable error. |
| Modify `src/commands/account/view.ts` | Make `<address>` optional (`[address]`); use `resolveAddress`. |
| Modify `src/commands/account/tokens.ts` | Same as view.ts. |
| Modify `src/commands/account/resources.ts` | Same as view.ts. |
| Modify `tests/utils/config.test.ts` | Add tests for `default_address` persistence. |
| Create `tests/utils/resolve-address.test.ts` | Priority order, missing-default error, invalid-default rejection. |
| Modify `tests/commands/account-view.test.ts` | Add test for default-address fallback. |
| Modify `tests/commands/account-tokens.test.ts` | Add test for default-address fallback. |
| Modify `tests/commands/account-resources.test.ts` | Add test for default-address fallback. |

### Feature B — Scalable-token decimals (class S2)

| File | Responsibility |
|------|----------------|
| Create `src/utils/tokens.ts` | Static TRC20 decimals map, `getStaticDecimals`, `fetchOnChainDecimals`, `resolveTrc20Decimals` (with in-run memoisation), plus `fetchTrc10Precision` and `resolveTrc10Decimals` (separate cache). |
| Modify `src/commands/account/tokens.ts` | After fetching balances, resolve decimals for TRC-20 AND TRC-10 in parallel; emit `decimals` + `balance_major` in JSON per scenario S2 (head word `balance`, not `amount` — TIP-20 `balanceOf` convention); format human output as `<major> (raw)`. |
| Create `tests/utils/tokens.test.ts` | Static lookup, on-chain TRC-20 fallback parsing (mocked fetch), TRC-10 precision parsing, memoisation for both resolvers, error-on-missing-result. |
| Modify `tests/commands/account-tokens.test.ts` | Update existing assertions for new JSON shape (`decimals` not `token_decimals`); add mixed TRC-20 + TRC-10 decimals resolution test. |

### Feature C — Class S1 bonus `decimals` field for `account view`

| File | Responsibility |
|------|----------------|
| Modify `src/commands/account/view.ts` | Add `decimals: 6` to `AccountViewData` interface and `fetchAccountView` return, implementing the class S1 bonus rule (P4) from `design/units.md`. |
| Modify `tests/commands/account-view.test.ts` | Add test asserting `result.decimals === 6` on the existing fetch fixtures. |

---

## Part A: Default Address

### Task A1: Extend config schema and export CONFIG_KEYS

**Files:**

- Modify: `src/utils/config.ts`
- Modify: `tests/utils/config.test.ts`

- [ ] **Step 1: Add failing test for `default_address` persistence**

Add to `tests/utils/config.test.ts` inside the existing `describe("config", ...)`:

```ts
it("persists default_address", () => {
  const path = join(TEST_DIR, "config.json");
  setConfigValue(path, "default_address", "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
  expect(getConfigValue(path, "default_address")).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
});

it("exposes CONFIG_KEYS as a set of known keys", async () => {
  const { CONFIG_KEYS } = await import("../../src/utils/config.js");
  expect(CONFIG_KEYS.has("network")).toBe(true);
  expect(CONFIG_KEYS.has("default_address")).toBe(true);
  expect(CONFIG_KEYS.has("apiKey")).toBe(true);
  expect(CONFIG_KEYS.has("unknown_key")).toBe(false);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/config.test.ts
```

Expected: First new test passes (existing writeConfig is permissive); second fails because `CONFIG_KEYS` is not exported.

- [ ] **Step 3: Add `default_address` to interface and export CONFIG_KEYS**

Modify `src/utils/config.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test tests/utils/config.test.ts
```

Expected: both new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts tests/utils/config.test.ts
git commit -m "$(cat <<'EOF'
feat: add default_address to config schema

Part of Phase A+ default address feature. Exposes CONFIG_KEYS
as the authoritative set of known config keys for subsequent
validation in config set.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: Validate config keys in `config set`

**Files:**

- Modify: `src/commands/config/set.ts`
- Create: `tests/commands/config-set.test.ts`

- [ ] **Step 1: Write failing tests for key validation and address format validation**

Create `tests/commands/config-set.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setConfigValue } from "../../src/utils/config.js";
import { validateConfigKey, validateConfigValue } from "../../src/commands/config/set.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-config-set-test");

describe("config set validation", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("accepts known keys", () => {
    expect(() => validateConfigKey("network")).not.toThrow();
    expect(() => validateConfigKey("default_address")).not.toThrow();
  });

  it("rejects unknown keys with a helpful message", () => {
    expect(() => validateConfigKey("netwrok")).toThrow(/unknown config key.*netwrok.*network/);
  });

  it("validates address format for default_address", () => {
    expect(() => validateConfigValue("default_address", "not-an-address")).toThrow(/invalid tron address/i);
    expect(() =>
      validateConfigValue("default_address", "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW"),
    ).not.toThrow();
  });

  it("does not validate format for other keys", () => {
    expect(() => validateConfigValue("network", "mainnet")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/config-set.test.ts
```

Expected: imports fail — `validateConfigKey` and `validateConfigValue` are not exported.

- [ ] **Step 3: Add exported validators and wire them into the set command**

Modify `src/commands/config/set.ts`:

```ts
import { styleText } from "node:util";
import type { Command } from "commander";
import { CONFIG_KEYS, getConfigValue, readConfig, setConfigValue } from "../../utils/config.js";
import { validateAddress } from "../../utils/address.js";

export function validateConfigKey(key: string): void {
  if (!(CONFIG_KEYS as Set<string>).has(key)) {
    const known = Array.from(CONFIG_KEYS).join(", ");
    throw new Error(`Unknown config key "${key}". Known keys: ${known}.`);
  }
}

export function validateConfigValue(key: string, value: string): void {
  if (key === "default_address") {
    try {
      validateAddress(value);
    } catch (err) {
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
          console.log(`${styleText("dim", key.padEnd(16))}  ${value}`);
        }
      }
    });
}
```

Also: the `list` padding was 12, bump to 16 to fit `default_address`.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test tests/commands/config-set.test.ts
bun test tests/utils/config.test.ts
```

Expected: all new tests PASS; existing config tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/config/set.ts tests/commands/config-set.test.ts
git commit -m "$(cat <<'EOF'
feat: validate config keys and default_address format

config set now rejects unknown keys with a helpful message
listing known ones, and validates TRON address format when
setting default_address. Resolves the config-validation item
from Phase A+ code quality fixes.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: Create `resolve-address` helper

**Files:**

- Create: `src/utils/resolve-address.ts`
- Create: `tests/utils/resolve-address.test.ts`

- [ ] **Step 1: Write failing tests for resolution priority and error cases**

Create `tests/utils/resolve-address.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setConfigValue, CONFIG_PATH } from "../../src/utils/config.js";
import { resolveAddress } from "../../src/utils/resolve-address.js";

const TEST_DIR = join(import.meta.dirname, ".tmp-resolve-address-test");
const TEST_CONFIG = join(TEST_DIR, "config.json");
const VALID_1 = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";
const VALID_2 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("resolveAddress", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns the provided argument when given", () => {
    expect(resolveAddress(VALID_1, TEST_CONFIG)).toBe(VALID_1);
  });

  it("rejects invalid provided argument before consulting config", () => {
    setConfigValue(TEST_CONFIG, "default_address", VALID_2);
    expect(() => resolveAddress("not-an-addr", TEST_CONFIG)).toThrow(/invalid tron address/i);
  });

  it("falls back to default_address when argument is undefined", () => {
    setConfigValue(TEST_CONFIG, "default_address", VALID_2);
    expect(resolveAddress(undefined, TEST_CONFIG)).toBe(VALID_2);
  });

  it("throws an actionable error when neither argument nor default is set", () => {
    expect(() => resolveAddress(undefined, TEST_CONFIG)).toThrow(
      /no address provided.*trongrid config set default_address/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/utils/resolve-address.test.ts
```

Expected: import fails — `resolve-address.ts` does not exist yet.

- [ ] **Step 3: Implement `resolveAddress`**

Create `src/utils/resolve-address.ts`:

```ts
import { CONFIG_PATH, getConfigValue } from "./config.js";
import { validateAddress } from "./address.js";

/**
 * Resolve an address argument to a concrete, validated TRON address.
 *
 * Priority:
 *   1. If `provided` is non-empty, validate and return it.
 *   2. Otherwise, fall back to `default_address` from config.
 *   3. If neither exists, throw an actionable error naming the fix.
 */
export function resolveAddress(provided: string | undefined, configPath: string = CONFIG_PATH): string {
  if (provided) {
    validateAddress(provided);
    return provided;
  }
  const fallback = getConfigValue(configPath, "default_address");
  if (!fallback) {
    throw new Error(
      "No address provided and no default is configured.\n" +
      "  Pass an address as an argument, or run:\n" +
      "    trongrid config set default_address <addr>",
    );
  }
  validateAddress(fallback);
  return fallback;
}
```

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test tests/utils/resolve-address.test.ts
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/resolve-address.ts tests/utils/resolve-address.test.ts
git commit -m "$(cat <<'EOF'
feat: add resolve-address helper with config fallback

New shared helper that resolves an optional address argument
to a validated TRON address, falling back to the configured
default_address. Emits an actionable error naming the fix
(aptos-style) when neither is available.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A4: Wire `resolveAddress` into `account view`

**Files:**

- Modify: `src/commands/account/view.ts`
- Modify: `tests/commands/account-view.test.ts`

- [ ] **Step 1: Write failing test for default-address fallback**

Add to `tests/commands/account-view.test.ts` (follow the existing mock-fetch pattern — if the file tests the command action directly, add a `describe` block that pre-seeds a temp config file and invokes the action with `undefined` as the address).

Skeleton (adapt to the file's existing style; the test file already exists and will make the pattern obvious):

```ts
it("falls back to config default_address when address arg is omitted", async () => {
  // set up temp config with default_address = VALID
  // mock fetch to return a minimal account response
  // invoke the action handler with undefined
  // assert the fetch URL contains the default address
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/account-view.test.ts
```

Expected: FAIL (command currently requires positional address).

- [ ] **Step 3: Make address optional and use `resolveAddress`**

Modify the `.argument` and action body in `src/commands/account/view.ts`:

```ts
import { resolveAddress } from "../../utils/resolve-address.js";
// ...

account
  .command("view")
  .description("View account balance, type, and activation status")
  .argument("[address]", "TRON address (defaults to config default_address)")
  .action(async (address: string | undefined) => {
    const { getClient, parseFields } = await import("../../index.js");
    const opts = parent.opts<GlobalOptions>();
    try {
      const resolved = resolveAddress(address);
      const client = getClient(opts);
      const data = await fetchAccountView(client, resolved);

      printResult(
        data as unknown as Record<string, unknown>,
        [
          ["Address", data.address],
          ["Balance", `${data.balance_trx} TRX`],
          ["Type", data.is_contract ? "Contract" : "EOA"],
          ["Created", data.create_time ? new Date(data.create_time).toISOString() : "Unknown"],
        ],
        { json: opts.json, fields: parseFields(opts) },
      );
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err), {
        json: opts.json,
        verbose: opts.verbose,
        upstream: (err as { upstream?: unknown }).upstream,
      });
      process.exit(1);
    }
  });
```

Note: we replaced the `validateAddress(address)` call with `resolveAddress(address)`, which validates internally.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test tests/commands/account-view.test.ts
```

Expected: new test PASSES; existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/view.ts tests/commands/account-view.test.ts
git commit -m "$(cat <<'EOF'
feat: make address optional in account view

Uses the new resolveAddress helper so account view falls back
to default_address from config when the positional argument is
omitted. Part of the default-address feature committed in
architecture.md §Positional argument ordering.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A5: Wire `resolveAddress` into `account tokens`

**Files:**

- Modify: `src/commands/account/tokens.ts`
- Modify: `tests/commands/account-tokens.test.ts`

Identical pattern to Task A4.

- [ ] **Step 1: Add failing default-fallback test to `tests/commands/account-tokens.test.ts`** (mirror the A4 test, asserting the fetched URL uses the configured default).

- [ ] **Step 2: Run and verify FAIL.**

- [ ] **Step 3: Update `src/commands/account/tokens.ts`:**

```ts
import { resolveAddress } from "../../utils/resolve-address.js";
// ...

account
  .command("tokens")
  .description("List TRC20 and TRC10 token balances")
  .argument("[address]", "TRON address (defaults to config default_address)")
  .action(async (address: string | undefined) => {
    // ... inside try:
    const resolved = resolveAddress(address);
    const client = getClient(opts);
    const tokens = await fetchAccountTokens(client, resolved);
    // ... rest unchanged for now (Feature B extends this)
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/tokens.ts tests/commands/account-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: make address optional in account tokens

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A6: Wire `resolveAddress` into `account resources`

**Files:**

- Modify: `src/commands/account/resources.ts`
- Modify: `tests/commands/account-resources.test.ts`

Identical pattern to Tasks A4 and A5. Same bite-sized steps: failing test → run-fail → implement with `[address]` + `resolveAddress(address)` → run-pass → commit.

Commit message header: `feat: make address optional in account resources`

---

### Task A7: Update commands.md to reflect optional addresses

**Files:**

- Modify: `docs/designs/commands.md` (moved from `docs/commands.md` in a later commit; use the current path)

- [ ] **Step 1: Update the account section to show `[address]` instead of `<address>`:**

```bash
trongrid account view [address]          # Balance, type, activation status
trongrid account tokens [address]        # All TRC20/TRC10 balances
trongrid account resources [address]     # Energy, bandwidth, staking state
```

Note about `[address]`: address falls back to `default_address` from config when omitted. Add a short line below the account block:

> Commands with `[address]` accept an optional TRON address. When omitted, the address defaults to `default_address` from config (`trongrid config set default_address <addr>`).

Leave the other `account <cmd>` entries (txs, transfers, delegations, permissions) still as `<address>` — those are implemented in Phase B and the default-address wiring for them is a Phase B follow-up.

- [ ] **Step 2: Commit**

```bash
git add docs/designs/commands.md
git commit -m "$(cat <<'EOF'
docs: mark account view/tokens/resources address as optional

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A8: Emit `decimals: 6` in `account view` (class S1 bonus rule)

**Files:**

- Modify: `src/commands/account/view.ts`
- Modify: `tests/commands/account-view.test.ts`

**Rationale:** Per P4's bonus rule in `design/units.md`, TRX's statically-known decimals (`6`) should be emitted alongside `balance_unit: "sun"` and `balance_trx`. Although strictly redundant with the named unit, the field makes the JSON self-contained (no external sun→trx glossary required), enables uniform parsing (no branching on whether `_unit` is set), and provides an agent audit trail. Zero runtime cost — it is a static literal. This task brings `account view` into full compliance with the class S1 four-field shape.

- [ ] **Step 1: Add failing test for `decimals: 6`**

Add to `tests/commands/account-view.test.ts` inside the existing outer `describe("account view", ...)` block:

```ts
it("emits decimals: 6 per class S1 bonus rule", async () => {
  const client = createClient({ network: "mainnet" });
  const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
  expect(result.decimals).toBe(6);
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun test tests/commands/account-view.test.ts
```

Expected: FAIL — `AccountViewData` has no `decimals` field; TypeScript compile error or `undefined` assertion failure.

- [ ] **Step 3: Add `decimals` to the interface and return literal**

Modify `src/commands/account/view.ts`:

```ts
interface AccountViewData {
  address: string;
  balance: number;
  balance_unit: "sun";
  decimals: 6;
  balance_trx: string;
  is_contract: boolean;
  create_time: number;
}

export async function fetchAccountView(
  client: ApiClient,
  address: string,
): Promise<AccountViewData> {
  const raw = await client.post<{
    address: string;
    balance?: number;
    create_time?: number;
    type?: string;
    account_resource?: Record<string, unknown>;
  }>("/wallet/getaccount", { address, visible: true });

  const balance = raw.balance ?? 0;

  return {
    address: raw.address ?? address,
    balance: balance,
    balance_unit: "sun",
    decimals: 6,
    balance_trx: sunToTrx(balance),
    is_contract: raw.type === "Contract",
    create_time: raw.create_time ?? 0,
  };
}
```

Note the type literal `decimals: 6` — this is a narrowed type since TRX decimals are fixed forever. It both documents the invariant and lets TypeScript catch any accidental drift.

- [ ] **Step 4: Run tests to verify pass**

```bash
bun test tests/commands/account-view.test.ts
bun test
```

All tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/view.ts tests/commands/account-view.test.ts
git commit -m "$(cat <<'EOF'
feat: emit decimals field in account view (class S1 bonus rule)

Adds decimals: 6 to AccountViewData and fetchAccountView
return per the class S1 bonus rule documented in
docs/designs/units.md §P4. The field is strictly redundant
with balance_unit: "sun" for a TRON-native consumer, but
makes the JSON self-contained for generic parsers and
agents without ecosystem priors. Zero runtime cost — a
static type literal.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Part B: Scalable-token decimals (class S2)

### Task B1: Static TRC20 decimals map

**Files:**

- Create: `src/utils/tokens.ts`
- Create: `tests/utils/tokens.test.ts`

- [ ] **Step 1: Write failing test for the static map lookup**

Create `tests/utils/tokens.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { getStaticDecimals } from "../../src/utils/tokens.js";

describe("getStaticDecimals", () => {
  it("returns 6 for USDT", () => {
    expect(getStaticDecimals("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(6);
  });

  it("returns undefined for unknown contracts", () => {
    expect(getStaticDecimals("TXYZunknownunknownunknownunknowxxxx")).toBeUndefined();
  });

  it("treats contract addresses case-sensitively (base58 is case-sensitive)", () => {
    expect(getStaticDecimals("tr7nhqjekqxgtci8q8zy4pl8otszgjlj6t")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and verify FAIL** (module doesn't exist yet).

- [ ] **Step 3: Create `src/utils/tokens.ts` with the static map**

```ts
/**
 * Static decimals map for the most common TRC20 tokens on TRON mainnet.
 *
 * Source: TronScan verified token list (https://tronscan.org/#/tokens/list).
 * Only include high-holder-count verified tokens to avoid phishing collisions.
 * On cache miss, callers MUST fall back to an on-chain decimals() call —
 * this map is an optimisation, NOT the source of truth.
 *
 * Adding a token: verify contract address on TronScan and confirm the
 * decimals() value with an on-chain call before adding.
 */
const STATIC_TRC20_DECIMALS: Record<string, number> = {
  TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: 6,  // USDT
  TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8: 6,  // USDC
  TNUC9Qb1rRpS5CbWLmNMxXBjyFoydXjWFR: 6,  // WTRX
  TCFLL5dx5ZJdKnWuesXxi1VPwjLVmWZZy9: 18, // JST
  TSSMHYeV2uE9qYH95DqyoCuNCzEL1NvU3S: 18, // SUN
  TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7: 6,  // WIN
  TAFjULxiVgT4qWk6UZwjqwZXTSaGaqnVp4: 18, // BTT
  // Implementing session: verify and extend the map with 5-10 more from
  // TronScan's top verified tokens, with the implementer's USDT test above
  // as the reference for adding entries.
};

export function getStaticDecimals(contractAddress: string): number | undefined {
  return STATIC_TRC20_DECIMALS[contractAddress];
}
```

**Note to implementing session**: Before adding new entries, cross-check decimals against the live chain via `POST /wallet/triggerconstantcontract` with `function_selector: "decimals()"`. Do not trust third-party lists blindly.

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokens.ts tests/utils/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: add static TRC20 decimals map for top tokens

First half of the hybrid decimals strategy. Covers ~7
high-holder-count verified TRC20s (USDT, USDC, WTRX, JST,
SUN, WIN, BTT) to avoid per-query on-chain calls for the
common case. On-chain fallback follows in the next commit.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: On-chain decimals fallback

**Files:**

- Modify: `src/utils/tokens.ts`
- Modify: `tests/utils/tokens.test.ts`

- [ ] **Step 1: Write failing tests for the on-chain fallback**

Add to `tests/utils/tokens.test.ts`:

```ts
import { fetchOnChainDecimals } from "../../src/utils/tokens.js";
import { createClient } from "../../src/api/client.js";

describe("fetchOnChainDecimals", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses uint256 hex result into an integer", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            result: { result: true },
            constant_result: ["0000000000000000000000000000000000000000000000000000000000000006"],
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const decimals = await fetchOnChainDecimals(client, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(decimals).toBe(6);
  });

  it("throws when the contract has no constant_result", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ result: { result: true } }))),
    );
    const client = createClient({ network: "mainnet" });
    await expect(
      fetchOnChainDecimals(client, "TXYZunknownunknownunknownunknowxxxx"),
    ).rejects.toThrow(/no decimals\(\) result/i);
  });
});
```

Also add the missing imports at the top (`afterEach`, `mock`).

- [ ] **Step 2: Run and verify FAIL** (function not exported yet).

- [ ] **Step 3: Implement `fetchOnChainDecimals`**

Append to `src/utils/tokens.ts`:

```ts
import type { ApiClient } from "../api/client.js";

interface TriggerConstantResponse {
  result?: { result?: boolean; message?: string };
  constant_result?: string[];
}

/**
 * Call the TRC20 contract's `decimals()` view function via TronGrid's
 * FullNode trigger-constant proxy. Returns the decimals as an integer.
 *
 * Uses the contract address as the `owner_address` (any valid address
 * works for view calls; using the contract itself avoids dependency on
 * an externally meaningful caller).
 */
export async function fetchOnChainDecimals(
  client: ApiClient,
  contractAddress: string,
): Promise<number> {
  const res = await client.post<TriggerConstantResponse>("/wallet/triggerconstantcontract", {
    contract_address: contractAddress,
    function_selector: "decimals()",
    parameter: "",
    owner_address: contractAddress,
    visible: true,
  });

  const hex = res.constant_result?.[0];
  if (!hex) {
    throw new Error(`No decimals() result for contract ${contractAddress}`);
  }
  return Number.parseInt(hex, 16);
}
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokens.ts tests/utils/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: add on-chain TRC20 decimals fallback via trigger-constant

Second half of the hybrid decimals strategy. For tokens not
in the static map, call the contract's decimals() view via
TronGrid's /wallet/triggerconstantcontract endpoint and parse
the uint256 hex result.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B3: Combined `resolveTrc20Decimals` with memoisation

**Files:**

- Modify: `src/utils/tokens.ts`
- Modify: `tests/utils/tokens.test.ts`

**Scope:** This task wraps the TRC-20 branch only. TRC-10 precision uses a different fetch endpoint (`/wallet/getassetissuebyid.precision`) and gets its own resolver in Task B3b with a separate memoisation cache — keeping the two resolvers independent avoids conflating distinct on-chain vocabularies.

Memoisation matters because `account tokens` queries N tokens and may hit the same contract twice (unlikely for a single account, but trivially cheap to add, and important when this helper gets reused in future commands).

- [ ] **Step 1: Write failing tests**

Add to `tests/utils/tokens.test.ts`:

```ts
import { resolveTrc20Decimals } from "../../src/utils/tokens.js";

describe("resolveTrc20Decimals", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the static value without hitting the network for known tokens", async () => {
    const fetchMock = mock(() => {
      throw new Error("should not be called");
    });
    globalThis.fetch = fetchMock;
    const client = createClient({ network: "mainnet" });
    const result = await resolveTrc20Decimals(client, "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(result).toBe(6);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to on-chain for unknown tokens", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            result: { result: true },
            constant_result: ["0000000000000000000000000000000000000000000000000000000000000012"],
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const result = await resolveTrc20Decimals(client, "TXYZnewtokenaddressnewtokenaddressxx");
    expect(result).toBe(18);
  });

  it("memoises on-chain lookups within one resolver instance", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            result: { result: true },
            constant_result: ["0000000000000000000000000000000000000000000000000000000000000012"],
          }),
        ),
      );
    });
    const client = createClient({ network: "mainnet" });
    await resolveTrc20Decimals(client, "TXYZnewtokenaddressnewtokenaddressxx");
    await resolveTrc20Decimals(client, "TXYZnewtokenaddressnewtokenaddressxx");
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify FAIL.**

- [ ] **Step 3: Implement `resolveTrc20Decimals` with module-level cache**

Append to `src/utils/tokens.ts`:

```ts
const onChainCache = new Map<string, number>();

/**
 * Resolve TRC20 decimals with a hybrid strategy:
 *   1. Static map for top tokens (no network call).
 *   2. Module-level memoisation cache for previously-seen unknowns.
 *   3. On-chain decimals() call as the source of truth for cache misses.
 *
 * The module-level cache is intentionally process-local; it has no TTL.
 * trongrid CLI processes are short-lived, so persistent caching is
 * overkill. Multi-command shell sessions re-fetch once per process.
 */
export async function resolveTrc20Decimals(client: ApiClient, contractAddress: string): Promise<number> {
  const fromStatic = getStaticDecimals(contractAddress);
  if (fromStatic !== undefined) return fromStatic;

  const cached = onChainCache.get(contractAddress);
  if (cached !== undefined) return cached;

  const fetched = await fetchOnChainDecimals(client, contractAddress);
  onChainCache.set(contractAddress, fetched);
  return fetched;
}
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokens.ts tests/utils/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: combine static + on-chain decimals with memoisation

Single entrypoint resolveTrc20Decimals implements the hybrid
strategy: static map first, then module-level cache, then
on-chain fallback. Memoisation prevents duplicate contract
calls within a single CLI invocation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B3b: TRC-10 precision resolver via `/wallet/getassetissuebyid`

**Files:**

- Modify: `src/utils/tokens.ts`
- Modify: `tests/utils/tokens.test.ts`

**Rationale:** TRC-10 asset metadata is served by FullNode's `/wallet/getassetissuebyid` endpoint. The precision field (conceptually equivalent to TRC-20's `decimals`) is often `0` for early-era TRC-10 tokens but can be up to 6 for newer ones. Resolver must handle both. No static map — TRC-10 tokens are less numerous and less phishing-prone than TRC-20, and precision lookups are cheap (single FullNode call per unique asset ID).

The cache is **separate** from `onChainCache` in Task B3 because:
1. Key space is disjoint (TRC-20 uses base58 contract addresses; TRC-10 uses numeric string IDs like `"1002000"`).
2. Resolution path is distinct (contract call vs asset metadata).
3. Keeping them separate makes it obvious which lookup path fired during debugging.

- [ ] **Step 1: Write failing tests for TRC-10 precision fetching**

Add to `tests/utils/tokens.test.ts`:

```ts
import { fetchTrc10Precision, resolveTrc10Decimals } from "../../src/utils/tokens.js";

describe("fetchTrc10Precision", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses the precision field from asset info", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "1002000",
            precision: 6,
            name: "TestToken",
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const precision = await fetchTrc10Precision(client, "1002000");
    expect(precision).toBe(6);
  });

  it("defaults to 0 when precision field is absent (common for early TRC-10)", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "1000001",
            name: "LegacyToken",
          }),
        ),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const precision = await fetchTrc10Precision(client, "1000001");
    expect(precision).toBe(0);
  });
});

describe("resolveTrc10Decimals", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns on-chain precision for a TRC-10 asset", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: "1002000", precision: 6 })),
      ),
    );
    const client = createClient({ network: "mainnet" });
    const result = await resolveTrc10Decimals(client, "1002000");
    expect(result).toBe(6);
  });

  it("memoises lookups within one resolver instance", async () => {
    let calls = 0;
    globalThis.fetch = mock(() => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ id: "1002000", precision: 6 })),
      );
    });
    const client = createClient({ network: "mainnet" });
    await resolveTrc10Decimals(client, "1002000");
    await resolveTrc10Decimals(client, "1002000");
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run and verify FAIL** (functions not yet exported).

- [ ] **Step 3: Implement `fetchTrc10Precision` and `resolveTrc10Decimals`**

Append to `src/utils/tokens.ts`:

```ts
interface AssetIssueResponse {
  id?: string;
  precision?: number;
  name?: string;
}

/**
 * Call FullNode's /wallet/getassetissuebyid to fetch a TRC-10 asset's
 * precision (the TRC-10 equivalent of TRC-20 decimals). Most early-era
 * TRC-10 assets have precision 0, so missing `precision` is treated as 0
 * rather than an error.
 */
export async function fetchTrc10Precision(
  client: ApiClient,
  assetId: string,
): Promise<number> {
  const res = await client.post<AssetIssueResponse>(
    "/wallet/getassetissuebyid",
    { value: assetId },
  );
  return res.precision ?? 0;
}

const trc10Cache = new Map<string, number>();

/**
 * Resolve TRC-10 decimals (= precision) with a module-level cache.
 * No static map — TRC-10 tokens are less numerous than TRC-20 and
 * metadata lookups are cheap (single FullNode call per unique ID).
 * The cache is separate from `onChainCache` because the key space and
 * lookup path differ (see Task B3b rationale in the plan).
 */
export async function resolveTrc10Decimals(
  client: ApiClient,
  assetId: string,
): Promise<number> {
  const cached = trc10Cache.get(assetId);
  if (cached !== undefined) return cached;

  const fetched = await fetchTrc10Precision(client, assetId);
  trc10Cache.set(assetId, fetched);
  return fetched;
}
```

- [ ] **Step 4: Run tests to verify pass.**

- [ ] **Step 5: Commit**

```bash
git add src/utils/tokens.ts tests/utils/tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: add TRC-10 precision resolver with memoisation

New fetchTrc10Precision + resolveTrc10Decimals pair parallel
to the TRC-20 resolvers. TRC-10 precision comes from FullNode's
/wallet/getassetissuebyid endpoint and defaults to 0 when
absent (common for early-era TRC-10 tokens). Cache is separate
from the TRC-20 on-chain cache because key space (numeric
asset IDs vs base58 contract addresses) and lookup path
(asset metadata vs contract view call) differ.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B4: Extend TokenBalance with decimals fields and resolve in `fetchAccountTokens`

**Files:**

- Modify: `src/commands/account/tokens.ts`
- Modify: `tests/commands/account-tokens.test.ts`

- [ ] **Step 1: Write failing test for new JSON shape**

Add to `tests/commands/account-tokens.test.ts`:

```ts
it("enriches TRC20 entries with decimals and balance_major", async () => {
  globalThis.fetch = mock((url: string) => {
    // First call: account data
    if (url.includes("/v1/accounts/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                trc20: [
                  { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: "1234000" },
                ],
              },
            ],
          }),
        ),
      );
    }
    // (no on-chain call expected — USDT is in the static map)
    throw new Error(`Unexpected URL: ${url}`);
  });

  const client = createClient({ network: "mainnet" });
  const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

  expect(tokens).toHaveLength(1);
  expect(tokens[0]).toMatchObject({
    type: "TRC20",
    contract_address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    balance: "1234000",
    decimals: 6,
    balance_major: "1.234",
  });
});

it("enriches TRC10 entries with decimals and balance_major via getassetissuebyid", async () => {
  globalThis.fetch = mock((url: string) => {
    if (url.includes("/v1/accounts/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                assetV2: [{ key: "1002000", value: 1234567 }],
              },
            ],
          }),
        ),
      );
    }
    if (url.includes("/wallet/getassetissuebyid")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ id: "1002000", precision: 6 }),
        ),
      );
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const client = createClient({ network: "mainnet" });
  const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
  expect(tokens[0]).toMatchObject({
    type: "TRC10",
    contract_address: "1002000",
    balance: "1234567",
    decimals: 6,
    balance_major: "1.234567",
  });
});

it("handles TRC10 tokens with precision 0 (legacy early tokens)", async () => {
  globalThis.fetch = mock((url: string) => {
    if (url.includes("/v1/accounts/")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                assetV2: [{ key: "1000001", value: 42 }],
              },
            ],
          }),
        ),
      );
    }
    if (url.includes("/wallet/getassetissuebyid")) {
      return Promise.resolve(new Response(JSON.stringify({ id: "1000001" })));
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  const client = createClient({ network: "mainnet" });
  const tokens = await fetchAccountTokens(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
  expect(tokens[0]).toMatchObject({
    type: "TRC10",
    contract_address: "1000001",
    balance: "42",
    decimals: 0,
    balance_major: "42",
  });
});
```

- [ ] **Step 2: Also update the existing test asserting 3 tokens**

The existing `parses TRC20 and TRC10 tokens from /v1/accounts/:address` test hard-codes a TRC20 token (`TEkxi...`, USDC) that is in the static map (6 decimals) and a TRC10 asset. Update the assertions to include `decimals: 6` and `balance_major` for the two TRC20 entries, AND to include `decimals` + `balance_major` for the TRC10 entry (driven by a mocked `/wallet/getassetissuebyid` response). The test mocks must now handle three URL patterns: the `/v1/accounts/` account fetch, and the `/wallet/getassetissuebyid` TRC10 precision fetch. TRC-20 static tokens do not need any additional mocked URL.

Reference values:
- `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (USDT) balance `38927318000` → `balance_major: "38927.318"`
- `TEkxiTehnzSmSe2XqrBj4w32RUN966rdz8` (USDC) balance `500000000000000000` → `balance_major: "500000000000.0"`

Keep the string form exact — do not rely on `Number.toFixed` because it introduces rounding for values above 2^53.

- [ ] **Step 3: Run and verify FAIL.**

- [ ] **Step 4: Implement shape change and decimals resolution**

Modify `src/commands/account/tokens.ts`:

```ts
import { resolveTrc20Decimals, resolveTrc10Decimals } from "../../utils/tokens.js";

// Fields follow scenario S2 from docs/designs/units.md:
// {head} + decimals + {head}_major. The head is `balance` because this
// represents an address's available token balance (TIP-20 `balanceOf`
// return-parameter convention). Covers both TRC-20 and TRC-10 since both
// are class S2 scalable quantities.
export interface TokenBalance {
  type: "TRC20" | "TRC10";
  contract_address: string;
  balance: string;
  decimals?: number;      // Undefined only on lookup failure; see error handling in fetchAccountTokens.
  balance_major?: string; // Undefined only on lookup failure.
}

/**
 * Convert a raw integer balance string into a major-unit decimal string.
 * Uses BigInt to preserve precision for values above 2^53.
 *
 * Example: formatMajor("38927318000", 6) → "38927.318"
 * Example: formatMajor("38927318000000", 6) → "38927318.0"
 * Trailing zeros in the fractional part are trimmed except for one "0"
 * when the fractional part would otherwise be empty.
 */
export function formatMajor(rawBalance: string, decimals: number): string {
  if (decimals === 0) return rawBalance;

  const negative = rawBalance.startsWith("-");
  const magnitude = negative ? rawBalance.slice(1) : rawBalance;
  const padded = magnitude.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals) || "0";
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "") || "0";
  const result = `${intPart}.${fracPart}`;
  return negative ? `-${result}` : result;
}

export async function fetchAccountTokens(
  client: ApiClient,
  address: string,
): Promise<TokenBalance[]> {
  const raw = await client.get<AccountV1Response>(`/v1/accounts/${address}`);
  const account = raw.data?.[0];
  if (!account) return [];

  const results: TokenBalance[] = [];

  for (const entry of account.trc20 ?? []) {
    for (const [contract_address, balance] of Object.entries(entry)) {
      results.push({ type: "TRC20", contract_address, balance });
    }
  }

  for (const asset of account.assetV2 ?? []) {
    results.push({ type: "TRC10", contract_address: asset.key, balance: String(asset.value) });
  }

  // Resolve decimals for BOTH TRC-20 and TRC-10 in parallel. Each type uses its
  // own resolver (different on-chain fetch path) but the in-loop logic is
  // uniform because they both produce an integer `decimals` value.
  await Promise.all(
    results.map(async (t) => {
      try {
        const decimals =
          t.type === "TRC20"
            ? await resolveTrc20Decimals(client, t.contract_address)
            : await resolveTrc10Decimals(client, t.contract_address);
        t.decimals = decimals;
        t.balance_major = formatMajor(t.balance, decimals);
      } catch {
        // On lookup failure, leave the fields unset. The raw balance is
        // still present. Don't fail the whole command for one token.
      }
    }),
  );

  return results;
}
```

- [ ] **Step 5: Run tests to verify pass.**

- [ ] **Step 6: Commit**

```bash
git add src/commands/account/tokens.ts tests/commands/account-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: resolve TRC20 and TRC10 decimals in account tokens

Extends TokenBalance with optional decimals and balance_major
fields, populated via resolveTrc20Decimals (hybrid static map
+ on-chain decimals()) for TRC-20 and resolveTrc10Decimals
(/wallet/getassetissuebyid.precision) for TRC-10. Both types
run in parallel via Promise.all.

Field naming follows scenario S2 from docs/designs/units.md:
{head} + decimals + {head}_major, with head = "balance"
per the TIP-20 balanceOf convention.

Failure to resolve one token's decimals logs nothing and
leaves the fields unset — other tokens still report, and
the raw balance is always present as a fallback.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B5: Update human output for formatted balances

**Files:**

- Modify: `src/commands/account/tokens.ts`

- [ ] **Step 1: Manually inspect the current human output**

Current line (in the command action, human branch):

```ts
console.log(`  ${typeTag} ${t.contract_address.padEnd(35)}  ${t.balance}`);
```

This prints raw. We want: if `balance_major` is present, show `<major>` as primary with raw as dimmed suffix; else fall back to raw.

- [ ] **Step 2: Update the rendering loop**

```ts
import { styleText } from "node:util";
// ...

for (const t of tokens) {
  const typeTag = styleText("dim", `[${t.type}]`);
  const display =
    t.balance_major !== undefined
      ? `${t.balance_major} ${styleText("dim", `(raw ${t.balance})`)}`
      : t.balance;
  console.log(`  ${typeTag} ${t.contract_address.padEnd(35)}  ${display}`);
}
```

This shows `1.234 (raw 1234000)` for TRC20 and plain raw for TRC10, matching the JSON contract (raw is always present; major is optional).

- [ ] **Step 3: Manually verify with a real call**

```bash
bun run src/index.ts account tokens TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
```

Expected output: TRC20 entries show `<major> (raw <raw>)`, TRC10 entries show raw only.

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/tokens.ts
git commit -m "$(cat <<'EOF'
feat: show formatted TRC20 balances in human output

Renders TRC20 entries as "<major> (raw <raw>)" when decimals
are resolved, falling back to raw-only for TRC10 and for
TRC20 contracts with failed decimals lookups.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B6: Verify docs match the implemented TokenBalance shape

**Files:**

- Inspect: `docs/architecture.md` (§Output Design scenario table)
- Inspect: `docs/designs/units.md` (§S2 example + §3 head-word rationale)
- Inspect: `docs/research.md` (§Decision 2 JSON example)

**Scope:** Now mandatory (upgraded from conditional in the original plan). Part B changes the public JSON contract in a way that commit 1–3 of the units.md rollout already anticipated, so the doc text should already match. This task is a final cross-check before closing Phase A+ — any drift discovered here is a bug in the rollout.

- [ ] **Step 1: Run the actual command against a test account and capture the JSON**

```bash
bun run src/index.ts --json account tokens TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
```

Pick an address that holds at least one TRC-20 and one TRC-10. Save the output.

- [ ] **Step 2: Compare every field in the output to the S2 shape in `docs/designs/units.md` §4**

Verify for both TRC-20 and TRC-10 entries:
- `balance` is a string (raw integer).
- `decimals` is an integer.
- `balance_major` is a precision-safe string matching `formatMajor(balance, decimals)`.
- No `token_decimals` field exists anywhere (the old name must be fully retired).
- Head word is `balance` (not `amount`) — the TIP-20 read-side convention.

- [ ] **Step 3: Compare the output to the quick-reference rows in `docs/architecture.md` §Output Design scenario table**

The S2 row should read: `` `balance` (raw) + `balance_major` + `decimals` ``. Flag any divergence.

- [ ] **Step 4: Compare the output to the example in `docs/research.md` §Decision 2**

The JSON example under "JSON output shape" should match the implemented contract. Flag any divergence.

- [ ] **Step 5: Commit (only if drift found)**

If any of steps 2–4 found divergence, land a doc fix as a separate commit with header `docs: align <file> to implemented TokenBalance shape`. If all three docs match the output, close this task with no commit — the checklist pass is the deliverable.

---

## Self-Review Checklist

Before executing the plan, the implementing session should confirm:

1. **Spec coverage** — every roadmap item is addressed:
   - `account tokens` JSON `decimals` + `balance_major` (TRC-20 AND TRC-10) → Tasks B1, B2, B3, B3b, B4, B5, B6.
   - `account view` JSON `decimals: 6` (class S1 bonus rule) → Task A8.
   - `config set` key validation → Task A2.
   - Default address feature → Tasks A1–A7.

2. **Placeholder scan** — search this plan for `TBD`, `TODO`, `similar to task`, `implement later`. None expected; if found, flag.

3. **Type consistency** — the helper names used across tasks match:
   - `validateConfigKey`, `validateConfigValue` — Task A2 only.
   - `resolveAddress(providedArg, configPath?)` — Tasks A3, A4, A5, A6.
   - `getStaticDecimals`, `fetchOnChainDecimals`, `resolveTrc20Decimals` — Tasks B1, B2, B3.
   - `fetchTrc10Precision`, `resolveTrc10Decimals` — Task B3b.
   - `formatMajor(rawBalance, decimals)` — Task B4.

4. **Independence** — Part A and Part B can be executed independently. Part A touches `account/view.ts`, `account/tokens.ts`, `account/resources.ts`, `config/set.ts`, `utils/config.ts`, `utils/resolve-address.ts`. Task A8 touches `account/view.ts` (same file as A4). Part B touches `account/tokens.ts`, `utils/tokens.ts`. Overlaps: `account/tokens.ts` (A5 + B4) and `account/view.ts` (A4 + A8). Execute in order A4 → A8 → A5 → B4 to keep each diff minimal.

5. **Memory-safety of address lists** — the static TRC20 map is a small constant; no concern. The on-chain memoisation cache is a `Map` at module scope, bounded in practice by the number of distinct unknown TRC20s a user touches in one CLI invocation. No eviction needed.

---

## Execution Handoff

Recommended approach: **subagent-driven**. Each task (A1…A8, B1…B3, B3b, B4…B6) is small enough to dispatch to a fresh agent with the task section pasted as the prompt. Review between tasks.

Alternative: inline execution, batch in groups — `[A1, A2, A3]`, then `[A4, A5, A6, A7, A8]`, then `[B1, B2, B3, B3b]`, then `[B4, B5, B6]`, with review checkpoints between groups.

Ordering: **execute Part A (including A8) fully before Part B** to keep the `account/tokens.ts` diff minimal at any given commit. Task A8 touches `account/view.ts` which is already done by A4, so A8 is a clean follow-on. Task B3b is strictly additive to `utils/tokens.ts` and can be done in parallel with B3 if desired, though the recommended order is sequential (B1 → B2 → B3 → B3b → B4) to keep the TRC-20 and TRC-10 resolvers clearly separated in history.
