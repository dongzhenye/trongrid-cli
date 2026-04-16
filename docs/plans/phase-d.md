# Phase D Implementation Plan — Account list family + Phase-C trial plumbing

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is the **plan** (step-level implementation detail, agent-facing). The corresponding **spec** (goal, architecture, decision rationale, memory references) lives at [`../designs/phase-d.md`](../designs/phase-d.md) and stays stable as the "what and why" while this plan iterates as the "how". Read the spec first for context before executing any task below.

**Goal:** Ship 9 cross-cutting plumbing fixes from the Phase C trial walkthrough (D-prep PR), then three new account list commands built on the cleaned foundation (D-main PR).

**Architecture:** Two sequential PRs on `feat/phase-d-account-list`. D-prep touches only existing files and lands first (P1 widens `humanPairs` 3-tuple, which downstream consumers depend on). D-main adds `src/commands/account/{transfers,delegations,permissions}.ts` + `src/utils/time-range.ts`, each command following the Phase C 3-commit rhythm (scaffold → endpoint → register). New `src/output/columns.ts` + `src/output/transfers.ts` in D-prep provide layered rendering primitives; D-main's new commands consume them.

**Tech Stack:** TypeScript strict mode, commander.js, Bun test. Native `fetch` via `src/api/client.ts`. Zero new production dependencies.

**Total commits:** ~21 (10 D-prep + 11 D-main).

---

## Context — read before starting

1. [`../designs/phase-d.md`](../designs/phase-d.md) — the Phase D spec, authoritative for scope + architecture + decision rationale.
2. [`phase-c.md`](./phase-c.md) — the Phase C plan; its 3-commit-per-command rhythm is the execution template for D-main tasks.
3. [`../designs/units.md`](../designs/units.md) — JSON unit shape contract (S1 / S2 classes). Any new quantity field must conform.
4. [`../../AGENTS.md`](../../AGENTS.md) — contribution rules (one prod dep, semantic colors, `reportErrorAndExit`, `--json` on every data command).
5. Memory files (read via MEMORY.md index before touching rendering or commits):
   - `feedback_human_render_alignment` — column alignment primitives
   - `feedback_transfer_list_two_styles` — centered vs uncentered (why `src/output/transfers.ts` is named generically)
   - `feedback_commit_rhythm` — atomic commits + docs-only commits for investigations
   - `feedback_know_why` — every commit body explains the WHY, not just the WHAT

**Execution model:** dispatch one subagent per task. Each subagent receives this plan file as context + the specific task id to implement. Review checkpoints between tasks catch drift early.

---

## D-prep PR — Plumbing fixes (10 tasks)

### Task P1 — Widen `humanPairs` to 3-tuple `[key, label, value]`

**Files:**
- Modify: `src/output/format.ts`
- Create: `tests/output/fields-human.test.ts`

**Goal:** Change `printResult`'s `humanPairs` parameter from `[string, string][]` (label, value) to `[string, string, string][]` (key, label, value) so `--fields` can filter human-mode output using the same `key` list that JSON mode already filters by. No command files are migrated in this task — that is P2. This task is strict type-change + filtering logic + new test.

- [ ] **Step 1: Write failing test for `--fields` filtering in human mode**

Create `tests/output/fields-human.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { printResult } from "../../src/output/format.js";

describe("printResult human mode --fields filtering", () => {
  const sample = { address: "TR7NHqj", balance: 100, type: "EOA" };
  const pairs: [string, string, string][] = [
    ["address", "Address", sample.address],
    ["balance", "Balance", String(sample.balance)],
    ["type", "Type", sample.type],
  ];

  it("prints all pairs when no fields filter", () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => out.push(msg);
    try {
      printResult(sample, pairs, { json: false });
    } finally {
      console.log = origLog;
    }
    expect(out[0]).toContain("Address");
    expect(out[0]).toContain("Balance");
    expect(out[0]).toContain("Type");
  });

  it("filters human output by field key", () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => out.push(msg);
    try {
      printResult(sample, pairs, { json: false, fields: ["address", "type"] });
    } finally {
      console.log = origLog;
    }
    expect(out[0]).toContain("Address");
    expect(out[0]).toContain("Type");
    expect(out[0]).not.toContain("Balance");
  });

  it("ignores unknown field keys without crashing", () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => out.push(msg);
    try {
      printResult(sample, pairs, { json: false, fields: ["address", "nonexistent"] });
    } finally {
      console.log = origLog;
    }
    expect(out[0]).toContain("Address");
    expect(out[0]).not.toContain("Balance");
  });

  it("JSON mode still filters by field", () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (msg: string) => out.push(msg);
    try {
      printResult(sample, pairs, { json: true, fields: ["address"] });
    } finally {
      console.log = origLog;
    }
    expect(out[0]).toContain('"address"');
    expect(out[0]).not.toContain('"balance"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails (type error)**

Run: `bun test tests/output/fields-human.test.ts`
Expected: compile error — `printResult`'s second parameter is still `[string, string][]`, the 3-tuple literal mismatches.

- [ ] **Step 3: Widen `printResult` signature + add filter logic**

In `src/output/format.ts`, update the `printResult` signature and body:

```ts
export type HumanPair = [key: string, label: string, value: string];

export function printResult<T extends object>(
	data: T,
	humanPairs: HumanPair[],
	options: { json?: boolean; fields?: string[] },
): void {
	if (options.json) {
		console.log(formatJson(data, options.fields));
		return;
	}
	const filtered =
		options.fields && options.fields.length > 0
			? humanPairs.filter(([key]) => options.fields!.includes(key))
			: humanPairs;
	// formatKeyValue still takes [label, value][]; drop the key for display.
	console.log(formatKeyValue(filtered.map(([, label, value]) => [label, value])));
}
```

Do **not** change `formatKeyValue` — it stays as a pure `[label, value]` display helper. The key is metadata for filtering, handled inside `printResult`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/output/fields-human.test.ts`
Expected: 4 PASS.

Then run the full suite to catch any 2-tuple call site that now errors: `bun test`.

Expected: **compile errors** at each of the 9 existing command files that pass 2-tuple `humanPairs`. This is expected — P2 fixes them. Do **not** migrate them in P1.

- [ ] **Step 5: Commit P1 (type widening only; build is red; command files migrate in P2)**

Since the build is red across existing command files, the pre-commit hook may reject. If the hook runs `bun run build` or `bun test`, allow it to catch this state — then **bundle P1 + P2 into a single atomic commit** (see P2 for the commit message). If the hook is soft (lint-only), commit P1 alone with:

```bash
git add src/output/format.ts tests/output/fields-human.test.ts
git commit -m "$(cat <<'EOF'
refactor: widen humanPairs to 3-tuple (key, label, value)

Changes printResult's humanPairs parameter from [string, string][]
(label, value) to [string, string, string][] (key, label, value) so
that --fields can filter human-mode output using the same field-key
list that JSON mode already filters by. Previously --fields was a
silent no-op in human mode (Phase C trial walkthrough item #3).

formatKeyValue stays pure [label, value] display — filtering happens
in printResult before the display hand-off. Keeps the filter
concern in one place.

Command files that still pass 2-tuple humanPairs will fail to build
after this commit; they are migrated in the immediate follow-up.

Phase D P1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

If the pre-commit hook rejects the red build, merge this with P2 into one commit with the subject `refactor: widen humanPairs to 3-tuple and migrate commands`. The rhythm preference is "P1 then P2 as two commits" but build-green at every commit takes precedence.

---

### Task P2 — Migrate command files to 3-tuple `humanPairs`

**Files:** Modify (each one call site):
- `src/commands/account/view.ts`
- `src/commands/account/tokens.ts` (wait — this file uses `printListResult` not `printResult`, so it does NOT call `humanPairs`; skip)
- `src/commands/account/resources.ts`
- `src/commands/block/latest.ts`
- `src/commands/block/view.ts`
- `src/commands/tx/view.ts`
- `src/commands/token/view.ts`
- `src/commands/auth/status.ts`
- `src/commands/config/list.ts`

**Goal:** Mechanical migration — each `humanPairs` literal gains a key (matching the corresponding JSON field name) as its new first element.

- [ ] **Step 1: Grep for all `printResult` call sites**

Run: `rg -l "printResult\(" src/commands/`

Expected: ~8 files. Confirm the list above. `account/tokens.ts` uses `printListResult` (list-mode, different helper), not `printResult`, so it is **not** in this task.

- [ ] **Step 2: Migrate each call site**

For each file, the pattern is:

```ts
// Before:
printResult(
  data,
  [
    ["Address", data.address],
    ["Balance", `${data.balance_trx} TRX`],
  ],
  { json: opts.json, fields: parseFields(opts) },
);

// After (key matches the JSON field name):
printResult(
  data,
  [
    ["address", "Address", data.address],
    ["balance_trx", "Balance", `${data.balance_trx} TRX`],
  ],
  { json: opts.json, fields: parseFields(opts) },
);
```

**Key naming rule**: the key string must match the corresponding top-level JSON field name in `data`. That way `--fields balance_trx` filters both human mode (shows only the Balance row) and JSON mode (shows only `"balance_trx": ...`) identically. When a display row has no natural JSON counterpart (e.g. a "Created" row derived from `create_time`), use the source field name as key (`create_time`).

Go file-by-file. In each file:

**`src/commands/account/view.ts`** — existing 4 pairs become:
```ts
[
  ["address", "Address", data.address],
  ["balance_trx", "Balance", `${data.balance_trx} TRX`],
  ["is_contract", "Type", data.is_contract ? "Contract" : "EOA"],
  ["create_time", "Created", data.create_time ? formatTimestamp(data.create_time) : "Unknown"],
]
```

**`src/commands/account/resources.ts`** — existing 3 pairs become:
```ts
[
  ["address", "Address", data.address],
  ["energy", "Energy", `${data.energy_used.toLocaleString()} / ${data.energy_limit.toLocaleString()}`],
  ["bandwidth", "Bandwidth", `${data.bandwidth_used.toLocaleString()} / ${data.bandwidth_limit.toLocaleString()}`],
]
```

Note: `energy` and `bandwidth` are composite display rows that don't map to a single JSON field. They get their own keys (not `energy_used` or `energy_limit` — either would be misleading as a filter key). This is an acceptable deviation from the strict "key matches JSON field name" rule; document it inline if it confuses reviewers.

**`src/commands/block/latest.ts`**, **`block/view.ts`**, **`tx/view.ts`**, **`token/view.ts`**, **`auth/status.ts`**, **`config/list.ts`** — apply the same pattern. Read each file to see its current 2-tuple, add a key matching the JSON field name.

- [ ] **Step 3: Update existing command test snapshots if needed**

Run: `bun test`
Expected: previously-failing type errors are gone. If any snapshot test fails because of whitespace changes in the human output, accept the snapshot (the display shape should not have changed; the test framework may or may not flag anything depending on how brittle snapshots were written).

- [ ] **Step 4: Add a `--fields` integration test for at least one command**

In `tests/commands/account-view.test.ts`, add:

```ts
it("--fields filters human output to selected keys", async () => {
  // Setup mock client + program with --fields address,balance_trx
  // Capture stdout
  // Expect: only Address and Balance rows
  // Expect: no Type or Created rows
});
```

Mirror the existing integration test style in that file; use the same mock client pattern used by Phase C tests.

- [ ] **Step 5: Run full suite + lint**

Run: `bun test && bun run lint && bun run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/commands/ tests/commands/account-view.test.ts
git commit -m "$(cat <<'EOF'
refactor: migrate command files to 3-tuple humanPairs

Adds a key (matching each row's JSON field name) to every existing
printResult call site so --fields can filter human output the same
way it filters JSON output. Mechanical sweep over 7 command files.

Adds a dedicated integration test on account view verifying that
--fields address,balance_trx filters the human-mode display to
exactly those two rows.

Closes Phase C trial walkthrough item #3.

Phase D P2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P3 — Stable tie-breaker in `applySort`

**Files:**
- Modify: `src/utils/sort.ts`
- Modify: `tests/utils/sort.test.ts`
- Modify: `src/commands/account/txs.ts`
- Modify: `tests/commands/account-txs.test.ts`

**Goal:** Add optional `tieBreakField` to `SortConfig<T>` so ties on the primary field sort deterministically by the secondary. `account txs` opts in immediately; D-main commands opt in as they land.

- [ ] **Step 1: Write failing test for tie-break behavior**

In `tests/utils/sort.test.ts`, add:

```ts
describe("applySort tieBreakField", () => {
  interface Row {
    primary: number;
    tie: number;
  }

  it("breaks ties using tieBreakField per its own direction", () => {
    const rows: Row[] = [
      { primary: 5, tie: 100 },
      { primary: 5, tie: 300 },
      { primary: 5, tie: 200 },
      { primary: 3, tie: 999 },
    ];
    const sorted = applySort(
      rows,
      {
        defaultField: "primary",
        fieldDirections: { primary: "desc", tie: "desc" },
        tieBreakField: "tie",
      },
      {},
    );
    expect(sorted.map((r) => r.tie)).toEqual([300, 200, 100, 999]);
  });

  it("leaves input order for ties when no tieBreakField", () => {
    const rows: Row[] = [
      { primary: 5, tie: 100 },
      { primary: 5, tie: 300 },
      { primary: 5, tie: 200 },
    ];
    const sorted = applySort(
      rows,
      { defaultField: "primary", fieldDirections: { primary: "desc", tie: "desc" } },
      {},
    );
    expect(sorted.map((r) => r.tie)).toEqual([100, 300, 200]);
  });

  it("ignores tieBreakField when it equals the primary sort field", () => {
    const rows: Row[] = [
      { primary: 5, tie: 100 },
      { primary: 3, tie: 200 },
    ];
    const sorted = applySort(
      rows,
      {
        defaultField: "primary",
        fieldDirections: { primary: "desc", tie: "desc" },
        tieBreakField: "primary",
      },
      {},
    );
    expect(sorted.map((r) => r.primary)).toEqual([5, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/utils/sort.test.ts`
Expected: type error — `SortConfig` has no `tieBreakField`.

- [ ] **Step 3: Extend `SortConfig` + update `applySort`**

In `src/utils/sort.ts`:

```ts
export interface SortConfig<T> {
	defaultField: keyof T & string;
	fieldDirections: Readonly<Record<string, SortDirection>>;
	/**
	 * Optional secondary sort field applied when the primary comparator
	 * returns 0. Uses its own inherent direction from `fieldDirections`.
	 * Ignored if it equals the active primary field (would be a no-op).
	 */
	tieBreakField?: keyof T & string;
}
```

In the comparator inside `applySort`, after the primary comparison returns 0, apply the tie-break:

```ts
const sorted = [...items].sort((a, b) => {
	const av = a[field];
	const bv = b[field];
	// ...existing primary comparison returning cmp...
	const primaryCmp = primaryCompare(av, bv, direction);
	if (primaryCmp !== 0) return primaryCmp;

	const tbField = config.tieBreakField;
	if (!tbField || tbField === field) return 0;
	const tbDir = config.fieldDirections[tbField];
	if (!tbDir) return 0;
	const tbA = a[tbField];
	const tbB = b[tbField];
	if (tbA === tbB) return 0;
	if (tbA === undefined || tbA === null) return 1;
	if (tbB === undefined || tbB === null) return -1;
	const rawCmp = tbA < tbB ? -1 : 1;
	return tbDir === "asc" ? rawCmp : -rawCmp;
});
```

(Extract `primaryCompare` out of the existing inline comparator if it makes the code cleaner; otherwise inline it.)

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test tests/utils/sort.test.ts`
Expected: all 3 new tests PASS + existing sort tests still PASS.

- [ ] **Step 5: Opt `account txs` into the tie-breaker**

In `src/commands/account/txs.ts`, extend `TXS_SORT_CONFIG`:

```ts
const TXS_SORT_CONFIG: SortConfig<AccountTxRow> = {
	defaultField: "timestamp",
	fieldDirections: {
		timestamp: "desc",
		block_number: "desc",
		fee: "desc",
	},
	tieBreakField: "timestamp",
};
```

In `tests/commands/account-txs.test.ts`, add a test that creates two txs with equal `fee` and asserts the `timestamp desc` order is preserved when `--sort-by fee` is applied.

- [ ] **Step 6: Commit**

```bash
git add src/utils/sort.ts tests/utils/sort.test.ts src/commands/account/txs.ts tests/commands/account-txs.test.ts
git commit -m "$(cat <<'EOF'
feat: add stable tie-breaker to applySort

Adds optional SortConfig.tieBreakField so that ties on the active
sort field are broken deterministically by a declared secondary
field (each with its own inherent direction). Without this, tied
primary values fell back to input order, which for account txs
sorted by fee produced a visually arbitrary ordering within the
zero-fee block.

account txs opts in immediately with tieBreakField: "timestamp"
(newest-first among tied fees). Phase D list commands adopt the
same pattern as they land.

Closes Phase C trial walkthrough item #10.

Phase D P3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P4 — Throw `UsageError` from validators for exit code 2

**Files:** Modify (4 validator files + their tests):
- `src/utils/address.ts`
- `src/utils/block-identifier.ts`
- `src/utils/token-identifier.ts`
- `src/utils/resolve-address.ts`
- `tests/utils/address.test.ts`
- `tests/utils/block-identifier.test.ts`
- `tests/utils/token-identifier.test.ts`
- `tests/utils/resolve-address.test.ts`

**Goal:** Sweep over all bad-user-input validators to throw `UsageError` (already defined in `src/output/format.ts`) instead of plain `Error`. `exitCodeFor` already maps `UsageError → 2` at `format.ts:196`, so this is a discipline sweep, not new behavior per se — it wires validators into the existing exit-code contract that only `applySort` was using before.

- [ ] **Step 1: Write failing test for `UsageError` + exit code 2 on one validator**

In `tests/utils/address.test.ts`, add:

```ts
import { UsageError } from "../../src/output/format.js";

describe("validateAddress error type", () => {
  it("throws UsageError (not plain Error) on bad input", () => {
    expect(() => validateAddress("NOT_AN_ADDRESS")).toThrow(UsageError);
  });

  it("empty string throws UsageError", () => {
    expect(() => validateAddress("")).toThrow(UsageError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/utils/address.test.ts`
Expected: FAIL — validator currently throws plain `Error`, not `UsageError`.

- [ ] **Step 3: Migrate `address.ts`**

In `src/utils/address.ts`:

```ts
import { UsageError } from "../output/format.js";

const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

export function isValidAddress(address: string): boolean {
	if (!address) return false;
	return BASE58_REGEX.test(address) || HEX_REGEX.test(address);
}

export function validateAddress(address: string): string {
	if (!isValidAddress(address)) {
		throw new UsageError(
			`Invalid TRON address format: "${address}". Expected Base58 (T...) or Hex (41...).`,
		);
	}
	return address;
}
```

- [ ] **Step 4: Migrate `block-identifier.ts`**

Replace all `throw new Error(...)` in `detectBlockIdentifier` with `throw new UsageError(...)`. Keep the existing messages unchanged. Add the import.

- [ ] **Step 5: Migrate `token-identifier.ts`**

Replace all `throw new Error(...)` in `detectTokenIdentifier` with `throw new UsageError(...)`. Add the import. There are ~8 throw sites; do them all.

- [ ] **Step 6: Migrate `resolve-address.ts`**

Replace the `throw new Error(...)` in `resolveAddress` (the "No address provided" case) with `throw new UsageError(...)`. Add the import.

- [ ] **Step 7: Update tests for the other three validators**

For `tests/utils/block-identifier.test.ts`, `token-identifier.test.ts`, `resolve-address.test.ts`: add one `expect(...).toThrow(UsageError)` assertion per validator so each is locked against regression.

- [ ] **Step 8: Run suite + manual exit-code spot check**

Run: `bun test`
Expected: all green, +4 tests.

Manual check:
```bash
bun run build
node dist/index.js account view NOT_AN_ADDRESS; echo "exit=$?"
```
Expected: `exit=2` (was `exit=1` before).

- [ ] **Step 9: Commit**

```bash
git add src/utils/address.ts src/utils/block-identifier.ts src/utils/token-identifier.ts src/utils/resolve-address.ts tests/utils/
git commit -m "$(cat <<'EOF'
refactor: throw UsageError from validators for exit code 2

Sweeps the four user-input validators (validateAddress,
detectBlockIdentifier, detectTokenIdentifier, resolveAddress) to
throw UsageError instead of plain Error. exitCodeFor in format.ts
already maps UsageError -> 2, so this wires the validators into
the existing deterministic exit code contract (0 success / 1
general / 2 usage / 3 network) that only applySort was using before.

Agent callers can now reliably distinguish "bad invocation, don't
retry" from "transient failure, safe to retry" by exit code on
every validation path.

Closes Phase C trial walkthrough item #11.

Phase D P4.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P5 — Rebalance error vs hint across validators

**Files:** Modify:
- `src/utils/resolve-address.ts` (`addressErrorHint`)
- `src/commands/block/view.ts` (any inline hint)
- `src/commands/token/view.ts` (any inline hint)
- Any other file with a `hintFor*` helper uncovered during Step 1
- Tests for each touched file

**Goal:** Every `Error:` line states the symptom tersely; every `Hint:` line adds a **distinct** actionable insight — not a rephrase of the error. Audit all hint producers and rebalance.

- [ ] **Step 1: Inventory all hint producers**

Run:
```bash
rg -n "hint:" src/ | head -30
rg -n "Hint:" src/ | head -30
rg -n "addressErrorHint|hintForBlock|hintForToken" src/
```

Expected: list of functions / call sites. Build a checklist.

- [ ] **Step 2: Review each producer's error/hint pair**

For each producer, capture the current pair:

```
Error: Invalid TRON address format: "TR7NFOO". Expected Base58 (T...) or Hex (41...).
Hint:  Base58 addresses start with T (34 chars); hex addresses start with 41 (42 chars).
```

Check: does the Hint add new information or just restate the Error? In the example above, the Error already says "Expected Base58 (T...) or Hex (41...)" — the Hint repeats that with slightly different wording. That's a restatement, not a distinct insight.

**Good pattern** (from `tx view <missing-hash>` reference):
```
Error: Transaction not found: "abc123..."
Hint:  If recently broadcast, wait 10-30 seconds for inclusion, then retry.
```

Here the Hint is a distinct actionable insight (wait + retry), not a restatement.

- [ ] **Step 3: Rewrite hints to carry distinct information**

For `addressErrorHint` in `src/utils/resolve-address.ts`:

```ts
export function addressErrorHint(err: unknown): string | undefined {
	if (!(err instanceof Error)) return undefined;
	const msg = err.message.toLowerCase();
	if (msg.includes("invalid tron address")) {
		// Distinct from the error: suggest where to FIND a valid address,
		// not just what a valid address looks like.
		return "Copy the address from tronscan.org or your wallet (top-left corner in TronLink).";
	}
	if (msg.includes("no address provided")) {
		// Distinct: the error already says "pass an address or set default";
		// the hint points at the specific config command + why it helps.
		return 'Run once: "trongrid config set default_address <your-addr>" — then all account commands default to it.';
	}
	return undefined;
}
```

For any inline hints in `src/commands/block/view.ts` and `src/commands/token/view.ts`, apply the same pattern: the Hint must give the user something new (where to find info, when to retry, which flag to try instead) — never just rephrase the symptom.

- [ ] **Step 4: Add literal-inequality assertions to tests**

For each rewritten hint, add a regression test that the hint literal is **not** equal to the error literal:

```ts
it("addressErrorHint returns distinct text from the error", () => {
  const err = new UsageError("Invalid TRON address format: \"FOO\"...");
  const hint = addressErrorHint(err);
  expect(hint).toBeDefined();
  expect(hint).not.toBe(err.message);
});
```

Add one such test per hint producer.

- [ ] **Step 5: Run suite + manual check**

Run: `bun test && bun run lint && bun run build`
Manual: trigger a known bad-address invocation and confirm the Error and Hint lines read as two distinct thoughts.

- [ ] **Step 6: Commit**

```bash
git add src/utils/resolve-address.ts src/commands/block/view.ts src/commands/token/view.ts tests/utils/resolve-address.test.ts
git commit -m "$(cat <<'EOF'
refactor: rebalance error vs hint across validators

Audit of hintForX helpers and inline hint strings in block view /
token view showed many Hint lines restating the Error symptom in
slightly different words (e.g. Error "Expected Base58 T..." +
Hint "Base58 addresses start with T"). Not useful.

Rule: Error states the symptom tersely; Hint adds a distinct
actionable insight (where to copy the address from, when to retry,
which flag to try instead). Regression tests lock the rule in with
a literal-inequality assertion per producer.

Closes Phase C trial walkthrough item #4.

Phase D P5.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P6a — Extract `src/output/columns.ts` atomic alignment primitives

**Files:**
- Create: `src/output/columns.ts`
- Create: `tests/output/columns.test.ts`

**Goal:** Ship Layer-1 semantic-agnostic column alignment primitives consumed later by `renderCenteredTransferList` (P6b), the three new D-main commands, and future Phase E / F / G list commands. The API deliberately contains no "counterparty" / "direction" / "address column" semantics — those belong to Layer-2 renderers (P6b). See memory `feedback_human_render_alignment` and `feedback_transfer_list_two_styles` for the rationale.

- [ ] **Step 1: Write failing unit tests for each primitive**

Create `tests/output/columns.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
  alignNumber,
  alignText,
  truncateAddress,
  computeColumnWidths,
  renderColumns,
} from "../../src/output/columns.js";

describe("alignNumber", () => {
  it("right-aligns numeric strings to a fixed width", () => {
    expect(alignNumber("1.234", 8)).toBe("   1.234");
    expect(alignNumber("500.00", 8)).toBe("  500.00");
  });
  it("leaves overlong values untruncated (caller's responsibility)", () => {
    expect(alignNumber("12345.678", 5)).toBe("12345.678");
  });
});

describe("alignText", () => {
  it("left-aligns by default", () => {
    expect(alignText("ENERGY", 9)).toBe("ENERGY   ");
  });
  it("right-aligns when requested", () => {
    expect(alignText("OK", 5, "right")).toBe("   OK");
  });
});

describe("truncateAddress", () => {
  it("returns 4+4 truncated form by default", () => {
    expect(truncateAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe("TR7N...Lj6t");
  });
  it("respects custom head/tail widths", () => {
    expect(truncateAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", 3, 3)).toBe("TR7...j6t");
  });
  it("returns address unchanged if shorter than head+tail+3", () => {
    expect(truncateAddress("TR7N")).toBe("TR7N");
  });
});

describe("computeColumnWidths", () => {
  it("returns max width per column", () => {
    const rows = [
      ["a", "bb", "ccc"],
      ["aaa", "b", "cc"],
    ];
    expect(computeColumnWidths(rows)).toEqual([3, 2, 3]);
  });
  it("handles empty rows", () => {
    expect(computeColumnWidths([])).toEqual([]);
  });
});

describe("renderColumns", () => {
  it("joins cells with 2-space separator by default", () => {
    const rows = [
      ["a  ", "bb", "ccc"],
      ["aaa", "b ", "cc "],
    ];
    const widths = [3, 2, 3];
    const lines = renderColumns(rows, widths);
    expect(lines).toEqual(["a    bb  ccc", "aaa  b   cc "]);
  });
  it("respects a custom separator", () => {
    const rows = [["a", "b"]];
    const widths = [1, 1];
    expect(renderColumns(rows, widths, " | ")).toEqual(["a | b"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/output/columns.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/output/columns.ts`**

```ts
/**
 * Atomic column-alignment primitives for human-mode list renders.
 *
 * Layer 1 of the three-layer output architecture (atomic → list-essence
 * → command). Deliberately semantic-agnostic: no "counterparty" or
 * "direction" notions — those belong to Layer-2 renderers in the
 * sibling files (e.g. src/output/transfers.ts).
 *
 * Alignment rules (from memory feedback_human_render_alignment):
 *   - Number: right-aligned to max width in batch (decimal points stack)
 *   - Unit: left-aligned, 1-space gap from number (adjacent)
 *   - Address: both-ends truncated form (4+4 default)
 *   - Inter-column separator: 2 spaces (distinguishes from in-column 1-space)
 */

/**
 * Right-align a numeric string to a fixed width with space padding.
 * Used for any column where the decimal point should stack vertically.
 * Overlong values are returned unchanged — caller is responsible for
 * ensuring the requested width fits the widest value (typically via
 * computeColumnWidths).
 */
export function alignNumber(value: string, width: number): string {
	if (value.length >= width) return value;
	return " ".repeat(width - value.length) + value;
}

/**
 * Align text to a fixed width. Default left-align suits categorical
 * columns (direction labels, resource types). Right-align is for any
 * numeric context that is not a magnitude (counts, indices).
 */
export function alignText(value: string, width: number, side: "left" | "right" = "left"): string {
	if (value.length >= width) return value;
	const pad = " ".repeat(width - value.length);
	return side === "right" ? pad + value : value + pad;
}

/**
 * Both-ends truncated address form: head chars, `...`, tail chars.
 * Default 4+4 produces an 11-char stable width (e.g. "TR7N...Lj6t").
 * Addresses shorter than head+tail+3 are returned unchanged (no ellipsis
 * needed).
 */
export function truncateAddress(addr: string, head = 4, tail = 4): string {
	if (addr.length <= head + tail + 3) return addr;
	return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

/**
 * Given a rectangular 2D array of cells, compute the max width of each
 * column. Cells are counted by their rendered length; callers should
 * pre-format (apply colors, truncation, etc.) and pass the final strings.
 */
export function computeColumnWidths(rows: string[][]): number[] {
	if (rows.length === 0) return [];
	const ncols = rows[0]?.length ?? 0;
	const widths = new Array<number>(ncols).fill(0);
	for (const row of rows) {
		for (let i = 0; i < ncols; i++) {
			const cell = row[i] ?? "";
			if (cell.length > widths[i]!) widths[i] = cell.length;
		}
	}
	return widths;
}

/**
 * Pad each cell to the corresponding column width, then join with the
 * inter-column separator. Returns one formatted line per input row.
 *
 * Default separator is 2 spaces per memory feedback_human_render_alignment
 * (distinguishes inter-column gap from in-column 1-space).
 */
export function renderColumns(
	rows: string[][],
	widths: number[],
	separator: string = "  ",
): string[] {
	return rows.map((row) =>
		row.map((cell, i) => alignText(cell, widths[i] ?? cell.length)).join(separator),
	);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test tests/output/columns.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/output/columns.ts tests/output/columns.test.ts
git commit -m "$(cat <<'EOF'
feat: extract columns.ts with atomic alignment primitives

Layer 1 of the three-layer output architecture (atomic -> list
essence -> command). Semantic-agnostic primitives for human-mode
column alignment:

  alignNumber(value, width)           right-align magnitude
  alignText(value, width, side)       left/right align categorical
  truncateAddress(addr, head, tail)   both-ends address form
  computeColumnWidths(rows)           max width per column
  renderColumns(rows, widths, sep)    assemble + join with 2-space gap

Extracted now because Phase D's three new list commands + Phase C's
existing renderTxs / renderTokenList all need the same alignment
discipline (per memory feedback_human_render_alignment), and Phase
E / F / G will add more consumers.

Deliberately contains no counterparty / direction semantics -
those belong to Layer 2 renderers in sibling files (see next commit
for src/output/transfers.ts and memory
feedback_transfer_list_two_styles for the design split).

Phase D P6a.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P6b — Extract `src/output/transfers.ts` + migrate `renderTxs` / `renderTokenList`

**Files:**
- Create: `src/output/transfers.ts`
- Create: `tests/output/transfers.test.ts`
- Modify: `src/commands/account/txs.ts` (`renderTxs`)
- Modify: `src/commands/account/tokens.ts` (`renderTokenList`)
- Modify: `tests/commands/account-txs.test.ts`, `tests/commands/account-tokens.test.ts`

**Goal:** Ship Layer-2 `renderCenteredTransferList` in a file deliberately named `transfers.ts` (not `centered-transfers.ts`) so Phase E can add the uncentered variant alongside without moving files. `renderTxs` and `renderTokenList` are **not** transfer lists (one is tx history, one is balance list) — they do **not** go through the Layer-2 helper; they migrate to use Layer-1 primitives directly. This task also folds in the Phase C trial #5 plural fix.

- [ ] **Step 1: Write failing test for `renderCenteredTransferList`**

Create `tests/output/transfers.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { renderCenteredTransferList, type CenteredTransferRow } from "../../src/output/transfers.js";

function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (msg: string) => lines.push(msg);
  try {
    fn();
  } finally {
    console.log = orig;
  }
  return lines;
}

describe("renderCenteredTransferList", () => {
  const sample: CenteredTransferRow[] = [
    {
      tx_id: "abc1234deadbeef0000000000000000000000000000000000000000000000f3e9",
      block_number: 70001,
      timestamp: 1744694400000,
      direction: "out",
      counterparty: "TQ4ge2gr7LvrKKeoQsrwxxxxxxxfyEV",
      token_address: "TR7NHqjeKQxGTCi8q8ZY4pL8USDTcontractAAA",
      token_symbol: "USDT",
      amount: "1000000",
      amount_unit: "raw",
      decimals: 6,
      amount_major: "1.000000",
    },
    {
      tx_id: "def456abba0000000000000000000000000000000000000000000000000a012c",
      block_number: 70000,
      timestamp: 1744694100000,
      direction: "in",
      counterparty: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjk8Py",
      token_address: "TR7NUSDCxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      token_symbol: "USDC",
      amount: "500000000",
      amount_unit: "raw",
      decimals: 6,
      amount_major: "500.000000",
    },
  ];

  it("renders header + aligned rows", () => {
    const lines = capture(() => renderCenteredTransferList(sample));
    expect(lines[0]).toContain("Found 2 transfers");
    // Two rows plus the header
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it("singularizes header for 1 row", () => {
    const lines = capture(() => renderCenteredTransferList([sample[0]!]));
    expect(lines[0]).toContain("Found 1 transfer");
    expect(lines[0]).not.toContain("transfers");
  });

  it("shows empty-state message for 0 rows", () => {
    const lines = capture(() => renderCenteredTransferList([]));
    expect(lines[0]).toContain("No transfers found");
  });

  it("right-aligns amounts so decimal points stack", () => {
    const lines = capture(() => renderCenteredTransferList(sample));
    // Locate the columns where "1.000000" and "500.000000" appear; they
    // should end at the same column index (same decimal position).
    const row1 = lines.find((l) => l.includes("1.000000"))!;
    const row2 = lines.find((l) => l.includes("500.000000"))!;
    const pos1 = row1.indexOf("1.000000") + "1.000000".length;
    const pos2 = row2.indexOf("500.000000") + "500.000000".length;
    expect(pos1).toBe(pos2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/output/transfers.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/output/transfers.ts`**

```ts
import { muted } from "./colors.js";
import {
	alignNumber,
	alignText,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "./columns.js";
import { formatTimestamp } from "./format.js";

/**
 * Row type for a **centered** transfer list — a list of token transfers
 * queried with an implicit subject account (e.g. `account transfers TR...`).
 *
 * **Do not reuse for uncentered transfer lists** (`token transfers`,
 * `tx transfers`, `block transfers` in future phases): those have a
 * different row shape without a `direction` field, because `from` and
 * `to` are peers there. See memory feedback_transfer_list_two_styles for
 * the design split.
 */
export interface CenteredTransferRow {
	tx_id: string;
	block_number: number;
	timestamp: number; // unix ms
	direction: "out" | "in";
	counterparty: string; // the "other" address (not the queried subject)
	token_address: string;
	token_symbol: string | null;
	amount: string;
	amount_unit: "raw";
	decimals: number;
	amount_major: string;
}

/**
 * Human-mode renderer for centered transfer lists. Composes column
 * primitives from `./columns.ts` to produce a vertically-aligned table.
 *
 * **Forward-pointing note:** Phase E will add `renderUncenteredTransferList`
 * alongside this export for `token transfers` / `tx transfers`. The file
 * is deliberately named `transfers.ts` (not `centered-transfers.ts`) so
 * the uncentered variant can live next to this one without moving files
 * or splitting the folder.
 */
export function renderCenteredTransferList(rows: CenteredTransferRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No transfers found."));
		return;
	}
	const headerNoun = rows.length === 1 ? "transfer" : "transfers";
	console.log(muted(`Found ${rows.length} ${headerNoun}:\n`));

	// Pre-format each cell as a string. Column order:
	//   time | direction | amount | unit | counterparty | tx_id
	// Apply raw text first; alignment is applied after width computation.
	const cells: string[][] = rows.map((r) => [
		formatTimestamp(r.timestamp), // always fixed-width "YYYY-MM-DD HH:MM:SS UTC"
		r.direction, // "out" / "in"
		r.amount_major,
		r.token_symbol ?? truncateAddress(r.token_address, 4, 4),
		r.direction === "out" ? "→" : "←",
		truncateAddress(r.counterparty, 4, 4),
		truncateAddress(r.tx_id, 4, 4),
	]);

	// Amounts right-aligned to max width in the batch.
	const amountCol = 2;
	const amountWidth = Math.max(...cells.map((c) => c[amountCol]!.length));
	for (const row of cells) {
		row[amountCol] = alignNumber(row[amountCol]!, amountWidth);
	}

	const widths = computeColumnWidths(cells);
	// direction column is already narrow (max 3 chars "out"); alignText
	// handles it. Arrow column is always 1 char. All others are left-align
	// by default which matches the centered rendering rules.
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `bun test tests/output/transfers.test.ts`
Expected: all PASS.

- [ ] **Step 5: Migrate `renderTxs` to use Layer-1 primitives (not Layer-2 — tx list is not transfer list)**

In `src/commands/account/txs.ts`, rewrite `renderTxs` to use `columns.ts` primitives and fix the plural header. `renderTxs` does **not** go through `src/output/transfers.ts` because an account transaction list is a different list essence (fee-bearing contract operations, not value-bearing token transfers).

```ts
import {
	alignNumber,
	alignText,
	computeColumnWidths,
	renderColumns,
	truncateAddress,
} from "../../output/columns.js";

// ...existing imports, fetchAccountTxs, sortTxs unchanged...

export function renderTxs(items: AccountTxRow[]): void {
	if (items.length === 0) {
		console.log(muted("No transactions found."));
		return;
	}
	const noun = items.length === 1 ? "transaction" : "transactions";
	console.log(muted(`Found ${items.length} ${noun}:\n`));

	const cells: string[][] = items.map((t) => [
		formatTimestamp(t.timestamp),
		truncateAddress(t.tx_id, 4, 4),
		t.contract_type,
		t.fee_trx, // right-aligned below
		"TRX",
	]);

	const feeCol = 3;
	const feeWidth = Math.max(...cells.map((c) => c[feeCol]!.length));
	for (const row of cells) {
		row[feeCol] = alignNumber(row[feeCol]!, feeWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}
```

Ensure `renderTxs` is still `export`ed (P7 covers the export explicitly; if the current state has `function renderTxs` without `export`, add it here — doesn't hurt to land early).

- [ ] **Step 6: Migrate `renderTokenList` to use Layer-1 primitives + plural fix**

In `src/commands/account/tokens.ts`, rewrite `renderTokenList`:

```ts
import { alignNumber, alignText, computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";

export function renderTokenList(tokens: TokenBalance[]): void {
	if (tokens.length === 0) {
		console.log(muted("No tokens found."));
		return;
	}
	const noun = tokens.length === 1 ? "token" : "tokens";
	console.log(muted(`Found ${tokens.length} ${noun}:\n`));

	const cells: string[][] = tokens.map((t) => [
		`[${t.type}]`,
		truncateAddress(t.contract_address, 4, 4),
		t.balance_major ?? t.balance,
		t.balance_major !== undefined ? muted(`(raw ${t.balance})`) : "",
	]);

	const balanceCol = 2;
	const balanceWidth = Math.max(...cells.map((c) => c[balanceCol]!.length));
	for (const row of cells) {
		row[balanceCol] = alignNumber(row[balanceCol]!, balanceWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}
```

- [ ] **Step 7: Update `account-txs` and `account-tokens` tests**

Both test files likely have snapshot assertions on human output. Update snapshots to match the new alignment. Add the n=0, n=1, n=2 plural coverage explicitly to lock the plural fix (trial #5 regression).

- [ ] **Step 8: Run full suite**

Run: `bun test && bun run lint && bun run build`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add src/output/transfers.ts tests/output/transfers.test.ts src/commands/account/txs.ts src/commands/account/tokens.ts tests/commands/account-txs.test.ts tests/commands/account-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat: extract transfers.ts Layer-2 + migrate renderTxs and renderTokenList

Adds src/output/transfers.ts with renderCenteredTransferList, the
Layer-2 renderer for account-scoped transfer lists (centered style
per memory feedback_transfer_list_two_styles). File is deliberately
named transfers.ts so Phase E can add renderUncenteredTransferList
alongside without moving files.

Migrates renderTxs and renderTokenList to use src/output/columns.ts
Layer-1 primitives directly (they are tx list and balance list,
not transfer lists - different list essences, so they do NOT go
through transfers.ts). Both renderers gain vertically-aligned
amount columns and both get the singular/plural header fix.

Closes Phase C trial walkthrough item #5.

Phase D P6b.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P7 — Export `renderTxs` + render snapshot test parity

**Files:**
- Modify: `src/commands/account/txs.ts` (add `export` keyword if missing after P6b)
- Modify: `tests/commands/account-txs.test.ts` (add render snapshot test)

**Goal:** Close the Phase C code-review minor finding that `renderTokenList` was exported + test-covered as a direct render snapshot, but `renderTxs` was file-private and had only JSON-path assertions. Parity.

- [ ] **Step 1: Verify `renderTxs` is exported**

After P6b, `renderTxs` should already be exported (P6b added `export` if it was missing). Verify:

```bash
rg "export function renderTxs" src/commands/account/txs.ts
```

Expected: 1 match. If not, add the `export` keyword.

- [ ] **Step 2: Add render snapshot test**

In `tests/commands/account-txs.test.ts`, mirror the `renderTokenList` direct-invocation test from `account-tokens.test.ts`:

```ts
import { renderTxs } from "../../src/commands/account/txs.js";

describe("renderTxs direct invocation", () => {
  it("renders empty state", () => {
    const lines = capture(() => renderTxs([]));
    expect(lines[0]).toContain("No transactions found");
  });

  it("renders single tx with singular header", () => {
    const lines = capture(() => renderTxs([/* one AccountTxRow */]));
    expect(lines[0]).toContain("Found 1 transaction");
  });

  it("renders multiple txs with aligned columns", () => {
    const lines = capture(() => renderTxs([/* multiple rows */]));
    // Snapshot the rendered output (inline, not a snapshot file)
    expect(lines.join("\n")).toMatchSnapshot();
  });
});
```

Fill in the row fixtures using realistic `AccountTxRow` values (copy from an existing integration test's mock).

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/account-txs.test.ts`
Expected: PASS (new snapshot file generated on first run).

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/txs.ts tests/commands/account-txs.test.ts
git commit -m "$(cat <<'EOF'
refactor: export renderTxs and add render snapshot test

Closes a Phase C code-review minor finding: renderTokenList was
exported and had a direct-invocation snapshot test, but renderTxs
was file-private with only JSON-path assertions. Parity now — both
renderers are exported, both have empty/singular/plural/aligned
snapshot coverage.

No behavior change.

Phase D P7.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P8 — Render full help when invoked without a subcommand

**Files:**
- Modify: `src/index.ts`
- Create: `tests/cli/bare-invoke.test.ts`

**Goal:** Currently `trongrid` (no args) prints commander's default "Options:" block only, while `trongrid --help` prints the full Options + Commands tree. Align both. Pick (a) from the spec — render full help for bare invoke (better for humans; agents already use `--help`).

- [ ] **Step 1: Write failing test for bare-invoke output parity**

Create `tests/cli/bare-invoke.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { execSync } from "node:child_process";

describe("trongrid bare invoke", () => {
  it("prints full help when invoked with no arguments", () => {
    const out = execSync("bun run dist/index.js", { encoding: "utf-8" });
    expect(out).toContain("Commands:");
    expect(out).toContain("account");
    expect(out).toContain("block");
  });

  it("bare output is equivalent to --help output", () => {
    const bare = execSync("bun run dist/index.js", { encoding: "utf-8" });
    const helpFlag = execSync("bun run dist/index.js --help", { encoding: "utf-8" });
    // Strip trailing whitespace on both for robust comparison
    expect(bare.trim()).toBe(helpFlag.trim());
  });
});
```

Note: this test runs the built binary. If the project doesn't have `bun run dist/index.js` as the invoke path, adapt — the intent is to exercise the real entry point.

- [ ] **Step 2: Run test to verify it fails (or the first assertion fails)**

Run: `bun run build && bun test tests/cli/bare-invoke.test.ts`
Expected: first test fails — current bare output doesn't include "Commands:".

- [ ] **Step 3: Register a root action on `program`**

In `src/index.ts`, just before `program.parse()`, add:

```ts
// Render full help when invoked with no subcommand. Without this,
// commander defaults to printing the Options block only, which is
// inconsistent with `trongrid --help` (which prints Options + Commands).
// Humans exploring the tool benefit from auto-discovery of the full
// command tree; agents already use --help explicitly and aren't affected.
// Closes Phase C trial walkthrough item #9.
program.action(() => {
	program.outputHelp();
});
```

- [ ] **Step 4: Rebuild and re-run test**

Run: `bun run build && bun test tests/cli/bare-invoke.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/cli/bare-invoke.test.ts
git commit -m "$(cat <<'EOF'
feat: render full help when invoked without a subcommand

Previously, bare 'trongrid' printed commander's Options block only
while 'trongrid --help' printed Options + Commands. Inconsistent
and actively hostile to first-time human users who typed the name
to see what it does.

Fix: register a root-command action that calls program.outputHelp().
Humans exploring the tool get auto-discovery of the full command
tree; agents already use --help explicitly and aren't affected.

Closes Phase C trial walkthrough item #9.

Phase D P8.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task P9 — `helpGroup` investigation + contingent impl

**Files:**
- Create: `docs/designs/notes/commander-helpgroup-investigation.md`
- (contingent) Modify: each sub-command registration file that has leaf commands to group

**Goal:** Phase C trial item #8 observed that `trongrid account --help` shows a flat Commands list while `trongrid --help` shows grouped categories ("Read commands:"). The `.helpGroup()` method is already used on sub-command *containers* (e.g. `account` parent at `src/commands/account/view.ts:46`), but leaf commands inside the parent have no grouping. The investigation asks: does `.helpGroup()` on leaves group them inside their parent's help output?

Per memory `feedback_commit_rhythm`, this investigation lands as a `docs:` commit regardless of outcome — git log reflects effort.

- [ ] **Step 1: Check commander.js documentation + source for `.helpGroup()` on leaves**

Quick research tasks:
- Read `node_modules/commander/lib/command.js` for `.helpGroup()` definition + where it's consulted in help rendering
- Check the commander.js changelog for the version that introduced `.helpGroup()`
- Look for open issues / PRs about leaf-level grouping: `gh search issues --repo tj/commander.js helpGroup`

Write findings directly into `docs/designs/notes/commander-helpgroup-investigation.md`.

- [ ] **Step 2: Write a throwaway experiment**

Create a tiny throwaway script (do not commit — delete after the experiment):

```ts
// tmp-helpgroup-test.ts
import { Command } from "commander";
const program = new Command();
const parent = program.command("parent");
parent.command("leaf1").helpGroup("Group A:").action(() => {});
parent.command("leaf2").helpGroup("Group B:").action(() => {});
parent.command("leaf3").helpGroup("Group A:").action(() => {});
program.parse(["node", "x", "parent", "--help"], { from: "node" });
```

Run: `bun run tmp-helpgroup-test.ts`

Observe: does the output show "Group A:" and "Group B:" as section headers with leaves underneath, or is it flat?

- [ ] **Step 3: Write the investigation doc**

Create `docs/designs/notes/commander-helpgroup-investigation.md` with:
- What the Phase C trial item #8 asked
- The commander.js version in use (check `package.json`)
- The experimental finding (supported / unsupported / partially supported with caveats)
- A link to the relevant commander.js source or issue
- The decision: apply or skip
- If skip: when to re-evaluate (when commander.js ships leaf grouping, track issue link)

- [ ] **Step 4: Commit the investigation (regardless of outcome)**

```bash
git add docs/designs/notes/commander-helpgroup-investigation.md
git commit -m "$(cat <<'EOF'
docs: investigation — commander.js helpGroup on sub-command leaves

Phase C trial walkthrough item #8 asked whether .helpGroup() applied
to leaf commands inside a sub-command container produces grouped
output the same way it does on top-level sub-command containers.

Findings: [PASTE ACTUAL OUTCOME HERE — "supported as of commander
v12.x, apply in follow-up commit" OR "unsupported as of commander
v12.x, track upstream at github.com/tj/commander.js#NNNN"]

Investigation logged per memory feedback_commit_rhythm — git log
reflects effort, not just code deltas.

Phase D P9.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

(Edit the findings section before committing. Do not commit the throwaway script.)

- [ ] **Step 5 (contingent): Apply `.helpGroup()` to leaves**

If Step 2 showed grouping works, apply `.helpGroup("Read commands:")` (or similar) to each leaf in each parent registration file: `registerAccountCommands`, `registerBlockCommands`, `registerTokenCommands`, `registerTxCommands`, `registerAuthCommands`, `registerConfigCommands`. Add one snapshot test per parent's `--help` output (e.g. `tests/cli/account-help.test.ts`) verifying the grouped structure.

Commit:
```bash
git add src/commands/ tests/cli/
git commit -m "feat: group leaf commands under helpGroup headers in each parent

Applies .helpGroup() to leaf commands inside account, block, token,
tx, auth, config sub-commands. trongrid account --help now shows
Read commands: grouping instead of a flat list. Snapshot tests lock
the structure in.

Closes Phase C trial walkthrough item #8 (investigation found
commander.js supports leaf grouping — see
docs/designs/notes/commander-helpgroup-investigation.md).

Phase D P9-impl.
"
```

If unsupported, skip this step. P9 is just the investigation doc.

---

### D-prep exit checklist

- [ ] 10 commits land (possibly 11 if P9-impl applies)
- [ ] `bun test` reports ~194 passing (+25 over 169)
- [ ] `bun run lint && bun run build` green
- [ ] `node dist/index.js account view NOT_AN_ADDRESS; echo $?` prints 2
- [ ] `node dist/index.js` renders full help including Commands section
- [ ] At least one command's `--fields` filter visibly works in human mode
- [ ] Open PR "Phase D-prep: plumbing fixes from Phase C trial walkthrough"

---

## D-main PR — New list commands (11 tasks)

The account parent is already registered in `src/commands/account/view.ts` as `registerAccountCommands(parent)`, and `src/index.ts` wires each new leaf command into the returned `account` via `register<Name>Command(account, program)`. D-main commands follow the same pattern.

### Task M1.1 — `account transfers` scaffold + types + first failing test

**Files:**
- Create: `src/commands/account/transfers.ts`
- Create: `tests/commands/account-transfers.test.ts`

**Goal:** Lay the file out with types (`AccountTransferRow`, `AccountTransfersResponse`), an empty `fetchAccountTransfers` stub, sort config declaration, and the first failing test that exercises the parse path end-to-end. No endpoint wiring yet — that's M1.2.

- [ ] **Step 1: Create `src/commands/account/transfers.ts` with types + stub**

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import type { CenteredTransferRow } from "../../output/transfers.js";
import { renderCenteredTransferList } from "../../output/transfers.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig } from "../../utils/sort.js";

/**
 * Unit shape per docs/designs/units.md S2 (TRC-10/20 scalable quantity).
 * Includes `direction: "out" | "in"` — this is a **centered** transfer
 * list (per memory feedback_transfer_list_two_styles); the direction is
 * computed at fetch time against the queried subject address so agents
 * don't have to compare.
 */
export interface AccountTransferRow extends CenteredTransferRow {
	// Centered-specific fields inherited from CenteredTransferRow
}

interface RawTransfer {
	transaction_id?: string;
	block_timestamp?: number;
	block_number?: number;
	from?: string;
	to?: string;
	type?: string;
	value?: string;
	token_info?: { symbol?: string; address?: string; decimals?: number };
}

interface AccountTransfersResponse {
	data?: RawTransfer[];
}

export async function fetchAccountTransfers(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<AccountTransferRow[]> {
	// Stub for M1.1; real implementation in M1.2.
	void client;
	void address;
	void opts;
	throw new Error("fetchAccountTransfers: not implemented (M1.1 scaffold)");
}

const TRANSFERS_SORT_CONFIG: SortConfig<AccountTransferRow> = {
	defaultField: "timestamp",
	fieldDirections: {
		timestamp: "desc",
		block_number: "desc",
		amount: "desc",
	},
	tieBreakField: "timestamp",
};

export function registerAccountTransfersCommand(account: Command, parent: Command): void {
	account
		.command("transfers")
		.description("List TRC-10/20 token transfers for an address")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account transfers TR...
  $ trongrid account transfers                            # uses default_address
  $ trongrid account transfers TR... --limit 50
  $ trongrid account transfers TR... --reverse            # oldest first
  $ trongrid account transfers TR... --sort-by amount     # largest transfer first
  $ trongrid account transfers TR... --after 2026-04-01   # since 2026-04-01
  $ trongrid account transfers TR... --before 2026-04-15 --after 2026-04-01

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, amount (all default desc)
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				// NOTE: --confirmed is accepted globally but has no effect here —
				// /v1/accounts/:address/transactions/trc20 has no /walletsolidity
				// mirror. Flag uniformity preserved; tracked as Phase D follow-up.
				const rows = await fetchAccountTransfers(client, resolved, {
					limit: Number.parseInt(opts.limit, 10),
					// minTimestamp / maxTimestamp come from M1.2's parseTimeRange.
				});
				const sorted = applySort(rows, TRANSFERS_SORT_CONFIG, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderCenteredTransferList, {
					json: opts.json,
					fields: parseFields(opts),
				});
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

- [ ] **Step 2: Wire the command in `src/index.ts`**

Add the import and the registration call:

```ts
import { registerAccountTransfersCommand } from "./commands/account/transfers.js";
// ...
registerAccountTransfersCommand(account, program);
```

- [ ] **Step 3: Write first failing test (parse path)**

Create `tests/commands/account-transfers.test.ts`. Use a mock client that returns a hand-crafted `AccountTransfersResponse` fixture; call `fetchAccountTransfers` directly; assert the returned `AccountTransferRow[]` has the expected fields.

Since `fetchAccountTransfers` is a stub in M1.1, the test is expected to fail with the stub's thrown error.

```ts
describe("fetchAccountTransfers", () => {
  it("parses TRC-20 transfer rows with direction=out when from matches queried address", async () => {
    const subject = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
    const mock = /* mock client returning one raw transfer from=subject */;
    const rows = await fetchAccountTransfers(mock, subject, { limit: 20 });
    expect(rows[0]!.direction).toBe("out");
    expect(rows[0]!.token_symbol).toBe("USDT");
    expect(rows[0]!.amount_major).toBe("1.000000");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test tests/commands/account-transfers.test.ts`
Expected: FAIL — stub throws.

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/transfers.ts tests/commands/account-transfers.test.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat: account transfers scaffold + AccountTransferRow type

Lays out src/commands/account/transfers.ts with the
AccountTransferRow type (extends CenteredTransferRow from
src/output/transfers.ts), the fetchAccountTransfers stub (real
impl lands in M1.2), TRANSFERS_SORT_CONFIG with tieBreakField,
and registerAccountTransfersCommand wired into src/index.ts.

First failing parse test in tests/commands/account-transfers.test.ts.

Phase D M1.1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M1.2 — `parseTimeRange` util + `--before` / `--after` global flags + real `fetchAccountTransfers`

**Files:**
- Create: `src/utils/time-range.ts`
- Create: `tests/utils/time-range.test.ts`
- Modify: `src/index.ts`
- Modify: `src/commands/account/transfers.ts` (real fetch body)
- Modify: `tests/commands/account-transfers.test.ts` (expand fetch tests)

**Goal:** Ship the `--before` / `--after` global pagination convention as a reusable utility, wire it into the global program options, and implement the real `fetchAccountTransfers` body that passes parsed timestamps to the TronGrid endpoint.

- [ ] **Step 1: Write failing tests for `parseTimeRange`**

Create `tests/utils/time-range.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseTimeRange } from "../../src/utils/time-range.js";
import { UsageError } from "../../src/output/format.js";

describe("parseTimeRange", () => {
  it("accepts unix seconds", () => {
    expect(parseTimeRange("1744694400", undefined)).toEqual({ maxTimestamp: 1744694400_000 });
    expect(parseTimeRange(undefined, "1744694400")).toEqual({ minTimestamp: 1744694400_000 });
  });

  it("accepts ISO-8601 datetime", () => {
    const iso = "2026-04-15T00:00:00Z";
    const expected = new Date(iso).getTime();
    expect(parseTimeRange(iso, undefined)).toEqual({ maxTimestamp: expected });
  });

  it("accepts ISO-8601 date-only (treated as UTC midnight)", () => {
    const expected = new Date("2026-04-15T00:00:00Z").getTime();
    expect(parseTimeRange("2026-04-15", undefined)).toEqual({ maxTimestamp: expected });
  });

  it("accepts both bounds", () => {
    const result = parseTimeRange("2026-04-15", "2026-04-01");
    expect(result.maxTimestamp).toBeGreaterThan(result.minTimestamp!);
  });

  it("throws UsageError on unparseable value", () => {
    expect(() => parseTimeRange("not-a-date", undefined)).toThrow(UsageError);
  });

  it("throws UsageError on inverted range (before < after)", () => {
    expect(() => parseTimeRange("2026-04-01", "2026-04-15")).toThrow(UsageError);
  });

  it("returns empty object when both bounds absent", () => {
    expect(parseTimeRange(undefined, undefined)).toEqual({});
  });

  it("rejects unix milliseconds (too large to be seconds)", () => {
    // 13-digit value would be ms; ambiguity with seconds — reject with hint.
    expect(() => parseTimeRange("1744694400000", undefined)).toThrow(UsageError);
  });
});
```

- [ ] **Step 2: Implement `src/utils/time-range.ts`**

```ts
import { UsageError } from "../output/format.js";

/**
 * Parse `--before` / `--after` CLI flags into a timestamp range in
 * unix milliseconds (TronGrid's `min_timestamp` / `max_timestamp`
 * query parameters use milliseconds).
 *
 * Accepted input forms:
 *   - Unix seconds: 1–12 digit decimal string (e.g. "1744694400")
 *   - ISO-8601 datetime: "2026-04-15T00:00:00Z" etc.
 *   - ISO-8601 date: "2026-04-15" (treated as UTC midnight)
 *
 * Deliberate rejections (with hints):
 *   - 13-digit unix values (would be milliseconds, ambiguous with seconds)
 *   - Unparseable strings
 *   - Inverted ranges (before < after)
 */
export function parseTimeRange(
	before: string | undefined,
	after: string | undefined,
): { minTimestamp?: number; maxTimestamp?: number } {
	const result: { minTimestamp?: number; maxTimestamp?: number } = {};
	if (before !== undefined) {
		result.maxTimestamp = parseOne(before, "--before");
	}
	if (after !== undefined) {
		result.minTimestamp = parseOne(after, "--after");
	}
	if (
		result.minTimestamp !== undefined &&
		result.maxTimestamp !== undefined &&
		result.minTimestamp >= result.maxTimestamp
	) {
		throw new UsageError(
			`Inverted time range: --after (${after}) must be earlier than --before (${before}).`,
		);
	}
	return result;
}

function parseOne(input: string, flagName: string): number {
	// Unix seconds: 1-12 decimal digits. 13+ digits would be milliseconds
	// or nonsense; reject both to avoid silent magnitude errors.
	if (/^\d{1,12}$/.test(input)) {
		return Number.parseInt(input, 10) * 1000;
	}
	if (/^\d{13,}$/.test(input)) {
		throw new UsageError(
			`${flagName} value "${input}" looks like unix milliseconds. Pass seconds (10 digits) or an ISO-8601 date like "2026-04-15" instead.`,
		);
	}
	// ISO-8601 (Date constructor handles both "2026-04-15" and full datetime)
	const ms = Date.parse(input);
	if (Number.isNaN(ms)) {
		throw new UsageError(
			`${flagName} value "${input}" is not a valid timestamp. Use unix seconds or ISO-8601 (e.g. "2026-04-15" or "2026-04-15T12:00:00Z").`,
		);
	}
	return ms;
}
```

- [ ] **Step 3: Run util tests**

Run: `bun test tests/utils/time-range.test.ts`
Expected: all PASS.

- [ ] **Step 4: Register global `--before` / `--after` flags + extend `GlobalOptions`**

In `src/index.ts`, add to the program options chain (place alphabetically or near `--limit`):

```ts
.option("--before <ts|date>", "only include items before this unix-seconds or ISO-8601 timestamp")
.option("--after <ts|date>", "only include items after this unix-seconds or ISO-8601 timestamp")
```

Extend `GlobalOptions`:

```ts
export interface GlobalOptions {
	// ...existing fields...
	before?: string;
	after?: string;
}
```

- [ ] **Step 5: Implement real `fetchAccountTransfers` body**

In `src/commands/account/transfers.ts`, replace the stub:

```ts
export async function fetchAccountTransfers(
	client: ApiClient,
	address: string,
	opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<AccountTransferRow[]> {
	const params = new URLSearchParams();
	params.set("limit", String(opts.limit));
	if (opts.minTimestamp !== undefined) params.set("min_timestamp", String(opts.minTimestamp));
	if (opts.maxTimestamp !== undefined) params.set("max_timestamp", String(opts.maxTimestamp));

	const path = `/v1/accounts/${address}/transactions/trc20?${params.toString()}`;
	const raw = await client.get<AccountTransfersResponse>(path);

	const rows: AccountTransferRow[] = [];
	for (const r of raw.data ?? []) {
		const isOut = r.from === address;
		const decimals = r.token_info?.decimals ?? 0;
		const amount = r.value ?? "0";
		rows.push({
			tx_id: r.transaction_id ?? "",
			block_number: r.block_number ?? 0,
			timestamp: r.block_timestamp ?? 0,
			direction: isOut ? "out" : "in",
			counterparty: isOut ? (r.to ?? "") : (r.from ?? ""),
			token_address: r.token_info?.address ?? "",
			token_symbol: r.token_info?.symbol ?? null,
			amount,
			amount_unit: "raw",
			decimals,
			amount_major: formatMajor(amount, decimals),
		});
	}
	return rows;
}
```

(Reuse `formatMajor` from `src/utils/tokens.ts` — it already exists and handles the string-math division.)

- [ ] **Step 6: Wire `parseTimeRange` into the action**

In `transfers.ts`'s `action` block (inside `registerAccountTransfersCommand`):

```ts
import { parseTimeRange } from "../../utils/time-range.js";
// ...
const range = parseTimeRange(opts.before, opts.after);
const rows = await fetchAccountTransfers(client, resolved, {
	limit: Number.parseInt(opts.limit, 10),
	minTimestamp: range.minTimestamp,
	maxTimestamp: range.maxTimestamp,
});
```

- [ ] **Step 7: Expand integration tests**

In `tests/commands/account-transfers.test.ts`, add cases for:
- Default-address fallback when no positional
- `--before` / `--after` passed through to the endpoint URL (assert on the mocked client's received path)
- Unparseable `--before` → exit 2
- Inverted range → exit 2

- [ ] **Step 8: Run full suite**

Run: `bun test && bun run lint && bun run build`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add src/utils/time-range.ts tests/utils/time-range.test.ts src/index.ts src/commands/account/transfers.ts tests/commands/account-transfers.test.ts
git commit -m "$(cat <<'EOF'
feat: parseTimeRange util + --before/--after global flags + fetchAccountTransfers

Ships the new pagination convention for list commands: timestamp-
range filtering via --before <ts|date> and --after <ts|date>. Both
flags accept unix seconds or ISO-8601 datetimes (full or date-only).
Inverted ranges and 13-digit unix-ms values throw UsageError (exit
code 2) with a specific hint rather than silently producing wrong
results.

fetchAccountTransfers now hits
/v1/accounts/:address/transactions/trc20 with min_timestamp /
max_timestamp parameters, computes direction against the subject
address, and emits AccountTransferRow rows with full S2 unit shape.

--before / --after are global per the Phase D pagination decision
(see docs/designs/phase-d.md section "Out of scope" - cursor paging
deliberately not exposed; range filtering covers the 95% case).

Phase D M1.2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M1.3 — `account transfers` register action + integration tests

**Files:**
- Modify: `src/commands/account/transfers.ts` (action body, if not already complete after M1.2)
- Modify: `tests/commands/account-transfers.test.ts`

**Goal:** Close the Phase C 3-commit rhythm on `account transfers` with the full integration test suite (sort / reverse / filter / json / fields / default-address / empty / tie-break).

- [ ] **Step 1: Flesh out integration tests**

Expected cases in `tests/commands/account-transfers.test.ts`:
1. default sort = `timestamp desc` with tie-break
2. `--sort-by amount` → largest first
3. `--sort-by block_number`
4. `--reverse` flips direction
5. `--before <iso>` + `--after <iso>` narrows the query
6. default-address fallback when no positional
7. empty response → "No transfers found."
8. `--json` returns array with S2 shape + `direction` field
9. `--json --fields from,to,amount` filters JSON
10. `--fields` in human mode filters displayed columns (requires P1 / P2)
11. tie-break ordering when `--sort-by amount` with equal amounts
12. `--sort-by unknown_field` → UsageError exit 2

- [ ] **Step 2: Run the full `account transfers` test file**

Run: `bun test tests/commands/account-transfers.test.ts`
Expected: all 12 PASS.

- [ ] **Step 3: Run full suite**

Run: `bun test && bun run lint && bun run build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/transfers.ts tests/commands/account-transfers.test.ts
git commit -m "$(cat <<'EOF'
feat: register account transfers with centered render + integration tests

Closes the account transfers 3-commit rhythm. Integration test
suite covers sort (default / --sort-by / --reverse / tie-break),
range filter (--before / --after), default-address fallback,
--json + --fields in both modes, empty response, and usage-error
exit code on unknown sort field.

Phase D M1.3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M2.1 — `account delegations` scaffold + `DelegationRow` type + first failing test

**Files:**
- Create: `src/commands/account/delegations.ts`
- Create: `tests/commands/account-delegations.test.ts`

**Goal:** Same shape as M1.1 — types, stub, sort config, command registration, first failing test.

- [ ] **Step 1: Create `src/commands/account/delegations.ts`**

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { alignNumber, alignText, computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";
import { formatTimestamp, printListResult, reportErrorAndExit, sunToTrx } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { applySort, type SortConfig } from "../../utils/sort.js";

/**
 * Stake 2.0 delegation row. Unit shape per docs/designs/units.md S1
 * (TRX quantity): amount + amount_unit: "sun" + decimals: 6 + amount_trx.
 *
 * `direction` discriminates incoming vs outgoing delegations. Flattened
 * to a single Row[] per memory feedback_transfer_list_two_styles — a
 * centered list with direction field, sortable across both directions
 * by amount desc. Human render groups into two sections (out / in)
 * with empty-section suppression; JSON stays as a flat array.
 */
export interface DelegationRow {
	direction: "out" | "in";
	from: string;
	to: string;
	resource: "ENERGY" | "BANDWIDTH";
	amount: number;
	amount_unit: "sun";
	decimals: 6;
	amount_trx: string;
	expire_time: number;
	expire_time_iso: string;
	lock: boolean;
}

export async function fetchAccountDelegations(
	client: ApiClient,
	address: string,
): Promise<DelegationRow[]> {
	// Stub for M2.1; real impl in M2.2.
	void client;
	void address;
	throw new Error("fetchAccountDelegations: not implemented (M2.1 scaffold)");
}

const DELEGATIONS_SORT_CONFIG: SortConfig<DelegationRow> = {
	defaultField: "amount",
	fieldDirections: {
		amount: "desc",
		expire_time: "asc",
	},
	tieBreakField: "expire_time",
};

export function renderDelegations(rows: DelegationRow[]): void {
	if (rows.length === 0) {
		console.log(muted("No delegations found."));
		return;
	}
	const out = rows.filter((r) => r.direction === "out");
	const inc = rows.filter((r) => r.direction === "in");
	if (out.length > 0) renderSection("Delegated out", out);
	if (out.length > 0 && inc.length > 0) console.log("");
	if (inc.length > 0) renderSection("Delegated in", inc);
}

function renderSection(label: string, rows: DelegationRow[]): void {
	console.log(muted(`${label} (${rows.length}):`));
	const cells: string[][] = rows.map((r) => [
		r.amount_trx,
		"TRX",
		r.resource,
		r.direction === "out" ? "→" : "←",
		truncateAddress(r.direction === "out" ? r.to : r.from, 4, 4),
		`expires ${formatTimestamp(r.expire_time * 1000)}`,
		r.lock ? muted("(locked)") : "",
	]);

	const amountCol = 0;
	const amountWidth = Math.max(...cells.map((c) => c[amountCol]!.length));
	for (const row of cells) {
		row[amountCol] = alignNumber(row[amountCol]!, amountWidth);
	}

	const widths = computeColumnWidths(cells);
	const lines = renderColumns(cells, widths);
	for (const line of lines) {
		console.log(`  ${line}`);
	}
}

export function registerAccountDelegationsCommand(account: Command, parent: Command): void {
	account
		.command("delegations")
		.description("List Stake 2.0 resource delegations (out + in)")
		.argument("[address]", "TRON address (defaults to config default_address)")
		.addHelpText(
			"after",
			`
Examples:
  $ trongrid account delegations TR...
  $ trongrid account delegations                    # uses default_address
  $ trongrid account delegations TR... --sort-by expire_time
  $ trongrid account delegations TR... --json

Sort:
  default — amount desc (largest position first)
  fields  — amount, expire_time
`,
		)
		.action(async (address: string | undefined) => {
			const { getClient, parseFields } = await import("../../index.js");
			const opts = parent.opts<GlobalOptions>();
			try {
				const resolved = resolveAddress(address);
				const client = getClient(opts);
				const rows = await fetchAccountDelegations(client, resolved);
				const sorted = applySort(rows, DELEGATIONS_SORT_CONFIG, {
					sortBy: opts.sortBy,
					reverse: opts.reverse,
				});
				printListResult(sorted, renderDelegations, {
					json: opts.json,
					fields: parseFields(opts),
				});
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

- [ ] **Step 2: Wire in `src/index.ts`**

```ts
import { registerAccountDelegationsCommand } from "./commands/account/delegations.js";
// ...
registerAccountDelegationsCommand(account, program);
```

- [ ] **Step 3: Write first failing test**

```ts
describe("fetchAccountDelegations", () => {
  it("parses both out and in delegations", async () => {
    const mock = /* mock returning both out and in index entries */;
    const rows = await fetchAccountDelegations(mock, "TR7NHqj...");
    expect(rows.some((r) => r.direction === "out")).toBe(true);
    expect(rows.some((r) => r.direction === "in")).toBe(true);
  });
});
```

- [ ] **Step 4: Run test — verify fails (stub throws)**

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/delegations.ts tests/commands/account-delegations.test.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat: account delegations scaffold + DelegationRow type

Lays out src/commands/account/delegations.ts with the DelegationRow
type (S1 unit shape + direction + expire_time dual field), stub
fetchAccountDelegations (real impl in M2.2), renderDelegations
with two-section human output, DELEGATIONS_SORT_CONFIG with tie-
break, and registration wired in src/index.ts.

Phase D M2.1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M2.2 — `fetchAccountDelegations` parallel index resolution

**Files:**
- Modify: `src/commands/account/delegations.ts`
- Modify: `tests/commands/account-delegations.test.ts`

**Goal:** Implement the real fetch: parallel out-index + in-index calls, then per-entry resolution, flatten to `DelegationRow[]`.

- [ ] **Step 1: Implement real `fetchAccountDelegations`**

TRON Stake 2.0 endpoints:
- `/wallet/getdelegatedresourceaccountindexv2` with `{ value: address }` returns `{ toAccounts: [...], fromAccounts: [...] }`
- `/wallet/getdelegatedresourcev2` with `{ fromAddress, toAddress }` returns per-pair details (multiple resource entries)

```ts
interface IndexV2Response {
	toAccounts?: string[]; // addresses this account has delegated TO
	fromAccounts?: string[]; // addresses that have delegated TO this account
}

interface DelegatedResourceV2Response {
	delegatedResource?: Array<{
		from?: string;
		to?: string;
		frozen_balance_for_bandwidth?: number;
		frozen_balance_for_energy?: number;
		expire_time_for_bandwidth?: number;
		expire_time_for_energy?: number;
	}>;
}

export async function fetchAccountDelegations(
	client: ApiClient,
	address: string,
): Promise<DelegationRow[]> {
	const index = await client.post<IndexV2Response>(
		"/wallet/getdelegatedresourceaccountindexv2",
		{ value: address, visible: true },
	);

	// For each counterparty, fetch the detailed delegation record in parallel.
	const outPairs = (index.toAccounts ?? []).map((to) => ({ from: address, to }));
	const inPairs = (index.fromAccounts ?? []).map((from) => ({ from, to: address }));

	const allPairs = [...outPairs, ...inPairs];
	const results = await Promise.all(
		allPairs.map(async (pair) => {
			const detail = await client.post<DelegatedResourceV2Response>(
				"/wallet/getdelegatedresourcev2",
				{ fromAddress: pair.from, toAddress: pair.to, visible: true },
			);
			return { pair, detail };
		}),
	);

	const rows: DelegationRow[] = [];
	for (const { pair, detail } of results) {
		const isOut = pair.from === address;
		for (const d of detail.delegatedResource ?? []) {
			// Bandwidth entry
			if (d.frozen_balance_for_bandwidth && d.frozen_balance_for_bandwidth > 0) {
				rows.push(makeRow(pair, "BANDWIDTH", d.frozen_balance_for_bandwidth, d.expire_time_for_bandwidth ?? 0, isOut));
			}
			// Energy entry
			if (d.frozen_balance_for_energy && d.frozen_balance_for_energy > 0) {
				rows.push(makeRow(pair, "ENERGY", d.frozen_balance_for_energy, d.expire_time_for_energy ?? 0, isOut));
			}
		}
	}
	return rows;
}

function makeRow(
	pair: { from: string; to: string },
	resource: "BANDWIDTH" | "ENERGY",
	frozen: number,
	expireMs: number,
	isOut: boolean,
): DelegationRow {
	const expireSec = Math.floor(expireMs / 1000);
	const now = Math.floor(Date.now() / 1000);
	return {
		direction: isOut ? "out" : "in",
		from: pair.from,
		to: pair.to,
		resource,
		amount: frozen,
		amount_unit: "sun",
		decimals: 6,
		amount_trx: sunToTrx(frozen),
		expire_time: expireSec,
		expire_time_iso: new Date(expireMs).toISOString(),
		lock: expireSec > now,
	};
}
```

- [ ] **Step 2: Expand fetch tests**

Cover: out-only, in-only, both, empty, sort tie-break, default-sort ordering across directions.

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/account-delegations.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/delegations.ts tests/commands/account-delegations.test.ts
git commit -m "$(cat <<'EOF'
feat: fetchAccountDelegations parallel index resolution

Implements Stake 2.0 delegation fetch: one index call
(getdelegatedresourceaccountindexv2) then parallel per-counterparty
detail calls (getdelegatedresourcev2). Flattens the nested
(counterparty -> [bandwidth, energy]) structure into a single
DelegationRow[] with a direction field so applySort can sort
across both in and out in one pass.

lock flag set when expire_time > now (still under lock-up);
otherwise false (free to undelegate).

Fetch tests cover out-only / in-only / both / empty.

Phase D M2.2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M2.3 — `account delegations` register + integration tests

**Files:**
- Modify: `tests/commands/account-delegations.test.ts`

**Goal:** Full integration suite (action wiring is already in place from M2.1; this task is test expansion + polishing the renderer output).

- [ ] **Step 1: Integration test cases**

Mirror the M1.3 list, minus the time-range cases:
1. default sort amount desc across out+in
2. `--sort-by expire_time`
3. `--reverse`
4. tie-break behavior
5. human render: two sections with empty suppression (snapshot)
6. `--json` stays flat array with `direction`
7. default-address fallback
8. empty response → "No delegations found."
9. `--sort-by unknown_field` → exit 2

- [ ] **Step 2: Run + lint + build**

Run: `bun test && bun run lint && bun run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add tests/commands/account-delegations.test.ts
git commit -m "$(cat <<'EOF'
feat: register account delegations with two-section render + integration tests

Closes the account delegations 3-commit rhythm. Integration test
suite covers sort (default / --sort-by / --reverse / tie-break),
two-section human render with empty-side suppression, --json stays
as a flat Row[] array (direction discriminator), default-address
fallback, and UsageError exit on unknown sort field.

Phase D M2.3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M3.1 — `account permissions` scaffold + structured types + first failing test

**Files:**
- Create: `src/commands/account/permissions.ts`
- Create: `tests/commands/account-permissions.test.ts`

**Goal:** The sole Phase D command that diverges from the `Row[]` pattern. Structured JSON shape `{ address, owner, active, witness? }`, no `applySort`, `--sort-by`/`--reverse` throw `UsageError`.

- [ ] **Step 1: Create `src/commands/account/permissions.ts`**

```ts
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { alignText, computeColumnWidths, renderColumns, truncateAddress } from "../../output/columns.js";
import { UsageError, formatJson, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";

/**
 * TRON permission model. This command deviates intentionally from the
 * Phase D list-command pattern because permissions are grouped by role
 * (owner / active[] / witness?), not a flat homogeneous list. Forcing
 * them through applySort would require flattening to key rows, which
 * loses the permission-as-unit structure that multi-sig audit workflows
 * depend on.
 *
 * JSON shape per a deliberate exception to docs/designs/units.md (no S-
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
	type: string; // "Owner" | "Active" | "Witness"
	id?: number; // index for active permissions
	permission_name: string;
	threshold: number;
	operations?: string; // bitmask hex
	keys: PermissionKey[];
}

export interface AccountPermissions {
	address: string;
	owner: PermissionBlock;
	active: PermissionBlock[];
	witness: PermissionBlock | null;
}

interface RawKey { address?: string; weight?: number }
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
	// Stub for M3.1; real impl in M3.2.
	void client;
	void address;
	throw new Error("fetchAccountPermissions: not implemented (M3.1 scaffold)");
}

export function renderPermissions(data: AccountPermissions): void {
	const addressNote = data.witness ? "SR account" : "normal account";
	console.log(muted(`Address: ${data.address} (${addressNote})\n`));

	renderBlock("Owner permission", data.owner);
	for (let i = 0; i < data.active.length; i++) {
		console.log("");
		const block = data.active[i]!;
		renderBlock(`Active permission #${i} (${block.permission_name})`, block);
	}
	if (data.witness) {
		console.log("");
		renderBlock("Witness permission", data.witness);
	}
}

function renderBlock(label: string, block: PermissionBlock): void {
	console.log(muted(`${label}:`));
	console.log(`  threshold: ${block.threshold}`);
	console.log(`  keys:`);
	// keys already sorted by weight desc in fetchAccountPermissions
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
				if (opts.sortBy !== undefined || opts.reverse) {
					throw new UsageError(
						"--sort-by / --reverse are not supported on account permissions: permissions are structured, not a flat list. Use --json | jq to reorder.",
					);
				}
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
```

- [ ] **Step 2: Wire in `src/index.ts`**

```ts
import { registerAccountPermissionsCommand } from "./commands/account/permissions.js";
registerAccountPermissionsCommand(account, program);
```

- [ ] **Step 3: Write first failing test**

In `tests/commands/account-permissions.test.ts`:

```ts
describe("fetchAccountPermissions", () => {
  it("returns structured owner + active + witness shape", async () => {
    const mock = /* returns a raw /wallet/getaccount response with all three */;
    const result = await fetchAccountPermissions(mock, "TR7N...");
    expect(result.owner.type).toBe("Owner");
    expect(result.active.length).toBeGreaterThan(0);
    expect(result.witness).not.toBeNull();
  });
});
```

- [ ] **Step 4: Run test — verify fails (stub throws)**

- [ ] **Step 5: Commit**

```bash
git add src/commands/account/permissions.ts tests/commands/account-permissions.test.ts src/index.ts
git commit -m "$(cat <<'EOF'
feat: account permissions scaffold + structured types

Lays out src/commands/account/permissions.ts as the one Phase D
command that deviates from the Row[] list pattern. Structured JSON
shape { address, owner, active[], witness? } — matches the natural
TRON permission model where owner / active / witness are grouped
by role, not a flat homogeneous list.

--sort-by / --reverse are explicitly rejected with UsageError at
the action level. Rationale in memory feedback_human_render_alignment
and the file-header doc comment.

Stub fetchAccountPermissions (real impl in M3.2), renderPermissions
with section-per-role human output, registerAccountPermissionsCommand
wired in src/index.ts.

Phase D M3.1.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M3.2 — `fetchAccountPermissions` reusing `/wallet/getaccount`

**Files:**
- Modify: `src/commands/account/permissions.ts`
- Modify: `tests/commands/account-permissions.test.ts`

**Goal:** Real fetch body. Reuses the same `/wallet/getaccount` endpoint that `account view` already hits, parsing the `owner_permission` / `active_permission` / `witness_permission` fields that `account view` currently ignores.

- [ ] **Step 1: Implement real fetch body**

```ts
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
```

- [ ] **Step 2: Expand fetch tests**

Cases:
- Single-key owner (normal account)
- Multi-key owner (2-of-3 multi-sig)
- Multiple `active_permission` entries
- Witness present (SR account) + absent
- Not-activated account → Error (not UsageError — this is a runtime condition, not a bad flag)

- [ ] **Step 3: Run**

Run: `bun test tests/commands/account-permissions.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/permissions.ts tests/commands/account-permissions.test.ts
git commit -m "$(cat <<'EOF'
feat: fetchAccountPermissions reusing getaccount endpoint

Real fetch body. Reuses /wallet/getaccount (same endpoint as
account view) and parses the owner_permission / active_permission[]
/ witness_permission fields that account view currently ignores.

Keys inside each permission block are sorted by weight desc in the
fetch layer (not via applySort — this command does not support
sort flags), so multi-sig audits read top-weighted keys first.

Not-activated accounts throw a runtime Error (exit code 1), not
UsageError (exit code 2) — the user's invocation was well-formed;
the condition is a blockchain-state fact.

Fetch tests cover single-key / multi-sig owner, multi-active,
witness present / absent, not-activated.

Phase D M3.2.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M3.3 — `account permissions` integration tests

**Files:**
- Modify: `tests/commands/account-permissions.test.ts`

**Goal:** Close the 3-commit rhythm with the full integration suite.

- [ ] **Step 1: Integration test cases**

1. Single-key owner, no active beyond owner, no witness → snapshot of minimal render
2. Multi-sig (2-of-3) owner → renders threshold 2 + 3 weight rows
3. Multi-permission active → "Active permission #0" / "#1" / ... sections
4. Witness present → additional "Witness permission:" section
5. Witness absent → "(no witness permission)" OR just no witness section (pick the one the renderer emits)
6. `--json` returns `{ owner, active, witness? }` shape, **not** an array
7. `--json --fields owner,witness` filters top-level keys
8. `--sort-by weight` → exit 2 with UsageError + distinct hint
9. `--reverse` → exit 2 with UsageError
10. default-address fallback

- [ ] **Step 2: Run full suite**

Run: `bun test && bun run lint && bun run build`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add tests/commands/account-permissions.test.ts
git commit -m "$(cat <<'EOF'
feat: register account permissions with structured render + integration tests

Closes the account permissions 3-commit rhythm. Integration test
suite covers single-key / multi-sig owner, multi-active, witness
present / absent, JSON stays structured (not array), --sort-by /
--reverse rejected with UsageError exit 2, default-address fallback.

Phase D M3.3.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M5a — Update `status.md` with Phase D close state

**Files:**
- Modify: `docs/plans/status.md`

**Goal:** Rolling session doc reflects Phase D as merged; active phase becomes Phase E.

- [ ] **Step 1: Update state table**

In `docs/plans/status.md`, update:
- Header date
- Main tip commit (the new merge commit hash)
- Tests count (~226)
- Active phase: Phase E
- Phase D target → Phase D ✅
- Add a "Phase D — ✅ merged" block to the Current phase progress section

- [ ] **Step 2: Update decision ledger**

Append any Phase D decisions that should not be re-litigated:
- Pagination convention (`--before`/`--after` only, no cursor) — closed
- Two-PR split discipline — closed
- `account permissions` structured (not list) — closed

- [ ] **Step 3: Commit**

```bash
git add docs/plans/status.md
git commit -m "$(cat <<'EOF'
docs: update status.md with Phase D close state

Active phase Phase D -> Phase E. Phase D marked merged in the
current-phase progress section. Decision ledger gains the Phase D
resolutions: pagination convention closed, two-PR split closed,
account permissions structured deviation closed.

Test count update: 169 baseline -> ~226 passing.

Phase D M5a.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task M5b — Update `roadmap.md` Phase D checklist to complete

**Files:**
- Modify: `docs/roadmap.md`

**Goal:** All Phase D items checked; heading gains ✅.

- [ ] **Step 1: Check all Phase D items**

In `docs/roadmap.md`, change every `- [ ]` in the Phase D section to `- [x]`. The deferred `account approvals` item stays as a forward-pointer (not a Phase D item anymore, but keep the reference).

- [ ] **Step 2: Mark section heading**

```
## Phase D — Account list family + Phase-C trial plumbing ✅ (pre-publish, untagged)
```

- [ ] **Step 3: Update the Overview block at the top of roadmap.md**

```
Phase A–D  (pre-publish, merged)       Architecture + early command surface
Phase E–H  (pre-publish, in flight)    Command surface fill-out
Phase I    (FIRST npm publish, v0.1.0) Distribution begins
Phase J–O  (expand)                    Auth UX, distribution, gaps, advanced
```

- [ ] **Step 4: Commit**

```bash
git add docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: mark Phase D complete in roadmap

All Phase D checklist items checked. Section heading gains the
shipped marker. Overview block moves Phase D from "in flight" to
"merged".

Phase D M5b.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### D-main exit checklist

- [ ] 11 commits land (on top of D-prep's 10)
- [ ] `bun test` reports ~226 passing
- [ ] `bun run lint && bun run build` green
- [ ] Manual smoke: `node dist/index.js account transfers` (with default_address set)
- [ ] Manual smoke: `node dist/index.js account delegations TR... --sort-by expire_time`
- [ ] Manual smoke: `node dist/index.js account permissions TR... --json` returns `{ owner, active, witness? }`
- [ ] Manual smoke: `node dist/index.js account permissions TR... --sort-by weight; echo $?` prints 2
- [ ] Open PR "Phase D-main: account transfers / delegations / permissions"
- [ ] PR review + merge

---

## Phase D overall exit criteria

- [ ] Both D-prep and D-main PRs merged to `main`
- [ ] Cumulative test count ~226+ passing
- [ ] `docs/plans/status.md` reflects Phase D as ✅; active phase = Phase E
- [ ] `docs/roadmap.md` Phase D section all `- [x]` + heading marked ✅
- [ ] No new production dependencies (still 1 — `commander`)
- [ ] `git log --oneline main..HEAD` (pre-merge) shows ~21 atomic commits with distinct Conventional Commits subjects, no `wip:` / `fixup!`
- [ ] `account approvals` deferral tracked in `roadmap.md` + memory `project_tron_eco_positioning`

---

## Self-review

Plan coverage vs spec:

- ✅ D-prep 9 items (P1–P9) all have tasks; P6 split into P6a/P6b as decided in brainstorming
- ✅ D-main 3 commands × 3 commits = 9 code tasks (M1.1–M3.3), plus M5a/M5b docs = 11 total
- ✅ Memory-driven decisions referenced in relevant tasks (P6a/P6b reference `feedback_human_render_alignment` and `feedback_transfer_list_two_styles`; all docs commits reference `feedback_commit_rhythm`)
- ✅ Deferred `account approvals` explicitly noted in exit criteria, not silently dropped
- ✅ M4 consistency pass dropped (already shipped), documented in scope-correction note in spec
- ✅ Every task has a commit step with HEREDOC message
- ✅ Every task has test + run + pass/fail check steps
- ✅ No "TBD" / "TODO" / "implement later" placeholders in step bodies
- ✅ File paths are exact; code blocks contain actual runnable code
- ✅ Type names consistent across tasks (`CenteredTransferRow` declared in P6b, referenced in M1.1)

Known tradeoffs:

- Some code blocks show the intended shape but omit full error handling around edge cases (e.g. missing `token_info` in raw response). Execution subagents should treat the shown code as a baseline and add defensive handling where it matches the project's "trust internal boundaries, validate external" convention in `AGENTS.md`.
- Step 7 of P2 and Step 7 of P6b say "update snapshots if needed". A subagent should check whether the existing test files use snapshot format or inline assertions and adjust accordingly — don't introduce snapshots where they don't exist.

---

Plan complete. Next: commit this file, then offer execution choice.
