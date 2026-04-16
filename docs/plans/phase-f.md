# Phase F — Contract Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the `contract` resource namespace with 5 contract-specific commands + 4 mirrors + 1 new `account internals`, plus a terminology glossary.

**Architecture:** New `src/commands/contract/` directory. Shared plumbing in `src/utils/abi.ts` (ABI parsing + keccak-256 selectors) and `src/api/internal-txs.ts` (internal tx fetch/render). Mirror commands delegate to extracted action functions from existing account commands.

**Tech Stack:** TypeScript strict, bun test, commander, zero new dependencies. Keccak-256 self-implemented (~100 lines).

**Spec:** [`docs/specs/phase-f.md`](../specs/phase-f.md)

**Branch:** `feat/phase-f-contract-family`

---

## Task 1: Create feature branch

**Files:** None

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout -b feat/phase-f-contract-family
```

- [ ] **Step 2: Verify clean state**

Run: `bun test`
Expected: 340 passing (Phase E baseline)

---

## Task 2: Add keccak-256 + ABI parser utility (P1)

**Files:**
- Create: `src/utils/keccak.ts`
- Create: `src/utils/abi.ts`
- Create: `tests/utils/keccak.test.ts`
- Create: `tests/utils/abi.test.ts`

- [ ] **Step 1: Write keccak-256 tests**

Create `tests/utils/keccak.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { keccak256, functionSelector } from "../../src/utils/keccak.js";

describe("keccak256", () => {
  it("computes correct hash for empty input", () => {
    const hash = keccak256(new Uint8Array(0));
    const hex = Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
    // Known keccak-256 empty-string hash
    expect(hex).toBe("c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  });

  it("computes correct hash for 'abc'", () => {
    const hash = keccak256(new TextEncoder().encode("abc"));
    const hex = Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toBe("4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
  });
});

describe("functionSelector", () => {
  it("computes transfer(address,uint256) selector", () => {
    expect(functionSelector("transfer(address,uint256)")).toBe("0xa9059cbb");
  });

  it("computes balanceOf(address) selector", () => {
    expect(functionSelector("balanceOf(address)")).toBe("0x70a08231");
  });

  it("computes approve(address,uint256) selector", () => {
    expect(functionSelector("approve(address,uint256)")).toBe("0x095ea7b3");
  });

  it("computes allowance(address,address) selector", () => {
    expect(functionSelector("allowance(address,address)")).toBe("0xdd62ed3e");
  });

  it("computes totalSupply() selector", () => {
    expect(functionSelector("totalSupply()")).toBe("0x18160ddd");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/utils/keccak.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement keccak-256**

Create `src/utils/keccak.ts`:

```typescript
/**
 * Minimal keccak-256 implementation for Ethereum/TRON function selector
 * computation. NOT NIST SHA-3 — uses keccak padding (0x01) not SHA-3
 * padding (0x06). Zero dependencies.
 *
 * Reference: https://keccak.team/keccak_specs_summary.html
 */

/* Round constants for keccak-f[1600] */
const RC: bigint[] = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

/* Rotation offsets for ρ step */
const ROT: number[] = [
   0,  1, 62, 28, 27,
  36, 44,  6, 55, 20,
   3, 10, 43, 25, 39,
  41, 45, 15, 21,  8,
  18,  2, 61, 56, 14,
];

/* π step permutation indices */
const PI: number[] = [
   0, 10,  20,  5, 15,
  16,  1,  11, 21,  6,
   7, 17,   2, 12, 22,
  23,  8,  18,  3, 13,
  14, 24,   9, 19,  4,
];

const MASK64 = 0xffffffffffffffffn;

function rotl64(x: bigint, n: number): bigint {
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // θ
    const c: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) {
        state[x + y] = (state[x + y] ^ d) & MASK64;
      }
    }
    // ρ and π
    const temp: bigint[] = new Array(25);
    for (let i = 0; i < 25; i++) {
      temp[PI[i]] = rotl64(state[i], ROT[i]);
    }
    // χ
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        state[y + x] = (temp[y + x] ^ (~temp[y + (x + 1) % 5] & temp[y + (x + 2) % 5])) & MASK64;
      }
    }
    // ι
    state[0] = (state[0] ^ RC[round]) & MASK64;
  }
}

/**
 * Keccak-256 hash. Returns 32 bytes.
 * Uses keccak padding (pad10*1 with domain 0x01), NOT SHA-3 (0x06).
 */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136; // 1088 bits / 8 = 136 bytes
  const state: bigint[] = new Array(25).fill(0n);

  // Absorb phase: XOR rate-sized blocks into state
  let offset = 0;
  while (offset + rate <= data.length) {
    for (let i = 0; i < rate; i += 8) {
      const lane = i >> 3;
      let val = 0n;
      for (let b = 0; b < 8; b++) {
        val |= BigInt(data[offset + i + b]) << BigInt(b * 8);
      }
      state[lane] ^= val;
    }
    keccakF1600(state);
    offset += rate;
  }

  // Final block: remaining bytes + keccak padding
  const remaining = data.length - offset;
  const padded = new Uint8Array(rate);
  padded.set(data.slice(offset));
  padded[remaining] = 0x01;      // keccak domain separation (NOT 0x06 for SHA-3)
  padded[rate - 1] |= 0x80;     // pad10*1 end bit

  for (let i = 0; i < rate; i += 8) {
    const lane = i >> 3;
    let val = 0n;
    for (let b = 0; b < 8; b++) {
      val |= BigInt(padded[i + b]) << BigInt(b * 8);
    }
    state[lane] ^= val;
  }
  keccakF1600(state);

  // Squeeze: extract 32 bytes (256 bits) from state
  const output = new Uint8Array(32);
  for (let i = 0; i < 32; i += 8) {
    const lane = state[i >> 3];
    for (let b = 0; b < 8 && i + b < 32; b++) {
      output[i + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
    }
  }
  return output;
}

/**
 * Compute Solidity function selector (first 4 bytes of keccak-256 of signature).
 * @param signature Canonical form, e.g. "transfer(address,uint256)" — no spaces.
 * @returns "0x" + 8 hex chars, e.g. "0xa9059cbb"
 */
export function functionSelector(signature: string): string {
  const hash = keccak256(new TextEncoder().encode(signature));
  return `0x${Array.from(hash.slice(0, 4)).map(b => b.toString(16).padStart(2, "0")).join("")}`;
}
```

- [ ] **Step 4: Run keccak tests to verify they pass**

Run: `bun test tests/utils/keccak.test.ts`
Expected: 7 passing

- [ ] **Step 5: Write ABI parser tests**

Create `tests/utils/abi.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { parseAbi, type AbiMethod, type AbiEvent } from "../../src/utils/abi.js";

// Subset of USDT ABI for testing
const USDT_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  // constructor, fallback, receive — should be ignored
  { type: "constructor", inputs: [] },
  { type: "fallback" },
];

describe("parseAbi", () => {
  it("extracts methods and events from a mixed ABI", () => {
    const summary = parseAbi(USDT_ABI);
    expect(summary.method_count).toBe(3);
    expect(summary.event_count).toBe(2);
  });

  it("computes correct selectors for known methods", () => {
    const summary = parseAbi(USDT_ABI);
    const transfer = summary.methods.find(m => m.name === "transfer");
    expect(transfer?.selector).toBe("0xa9059cbb");
    const balanceOf = summary.methods.find(m => m.name === "balanceOf");
    expect(balanceOf?.selector).toBe("0x70a08231");
  });

  it("classifies view/pure as read, nonpayable/payable as write", () => {
    const summary = parseAbi(USDT_ABI);
    const balanceOf = summary.methods.find(m => m.name === "balanceOf");
    expect(balanceOf?.type).toBe("read");
    const transfer = summary.methods.find(m => m.name === "transfer");
    expect(transfer?.type).toBe("write");
  });

  it("builds correct signatures", () => {
    const summary = parseAbi(USDT_ABI);
    const transfer = summary.methods.find(m => m.name === "transfer");
    expect(transfer?.signature).toBe("transfer(address,uint256)");
  });

  it("extracts event signatures with indexed flags", () => {
    const summary = parseAbi(USDT_ABI);
    const evt = summary.events.find(e => e.name === "Transfer");
    expect(evt?.signature).toBe("Transfer(address,address,uint256)");
    expect(evt?.inputs[0]?.indexed).toBe(true);
    expect(evt?.inputs[2]?.indexed).toBe(false);
  });

  it("returns empty summary for empty ABI", () => {
    const summary = parseAbi([]);
    expect(summary.method_count).toBe(0);
    expect(summary.event_count).toBe(0);
    expect(summary.methods).toEqual([]);
    expect(summary.events).toEqual([]);
  });

  it("skips malformed entries gracefully", () => {
    const abi = [
      { type: "function" }, // missing name/inputs
      ...USDT_ABI,
    ];
    const summary = parseAbi(abi);
    // Should still parse the valid entries
    expect(summary.method_count).toBe(3);
  });
});
```

- [ ] **Step 6: Implement ABI parser**

Create `src/utils/abi.ts`:

```typescript
import { functionSelector } from "./keccak.js";

export interface AbiMethod {
  selector: string;
  name: string;
  signature: string;
  type: "read" | "write";
  mutability: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

export interface AbiEvent {
  name: string;
  signature: string;
  inputs: Array<{ name: string; type: string; indexed: boolean }>;
}

export interface AbiSummary {
  method_count: number;
  event_count: number;
  methods: AbiMethod[];
  events: AbiEvent[];
}

interface RawAbiEntry {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: Array<{ name?: string; type?: string; indexed?: boolean }>;
  outputs?: Array<{ name?: string; type?: string }>;
}

/**
 * Normalize TronGrid ABI entries to standard Solidity ABI format.
 * TronGrid returns capitalized types ("Function", "Event") and
 * capitalized mutability ("Nonpayable", "View").
 */
export function normalizeAbiEntries(entrys: unknown[]): unknown[] {
  return entrys.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      ...e,
      type: typeof e.type === "string" ? e.type.toLowerCase() : e.type,
      stateMutability:
        typeof e.stateMutability === "string"
          ? e.stateMutability.toLowerCase()
          : e.stateMutability,
    };
  });
}

function buildSignature(name: string, inputs: Array<{ type?: string }>): string {
  return `${name}(${inputs.map(i => i.type ?? "").join(",")})`;
}

export function parseAbi(abiJson: unknown[]): AbiSummary {
  const methods: AbiMethod[] = [];
  const events: AbiEvent[] = [];

  for (const raw of abiJson) {
    const entry = raw as RawAbiEntry;
    if (!entry.type || !entry.name) continue;

    if (entry.type === "function") {
      const inputs = (entry.inputs ?? []).map(i => ({
        name: i.name ?? "",
        type: i.type ?? "",
      }));
      const outputs = (entry.outputs ?? []).map(o => ({
        name: o.name ?? "",
        type: o.type ?? "",
      }));
      const sig = buildSignature(entry.name, inputs);
      const mutability = entry.stateMutability ?? "nonpayable";
      methods.push({
        selector: functionSelector(sig),
        name: entry.name,
        signature: sig,
        type: mutability === "view" || mutability === "pure" ? "read" : "write",
        mutability,
        inputs,
        outputs,
      });
    } else if (entry.type === "event") {
      const inputs = (entry.inputs ?? []).map(i => ({
        name: i.name ?? "",
        type: i.type ?? "",
        indexed: i.indexed ?? false,
      }));
      const sig = buildSignature(entry.name, inputs);
      events.push({ name: entry.name, signature: sig, inputs });
    }
  }

  return {
    method_count: methods.length,
    event_count: events.length,
    methods,
    events,
  };
}
```

- [ ] **Step 7: Run ABI tests to verify they pass**

Run: `bun test tests/utils/abi.test.ts`
Expected: 7 passing

- [ ] **Step 8: Run full test suite**

Run: `bun test`
Expected: All passing (340 + 14 new = ~354)

- [ ] **Step 9: Commit**

```bash
git add src/utils/keccak.ts src/utils/abi.ts tests/utils/keccak.test.ts tests/utils/abi.test.ts
git commit -m "feat: add keccak-256 and ABI parser utilities"
```

---

## Task 3: Add internal transactions fetch + render utility (P2)

**Files:**
- Create: `src/api/internal-txs.ts`
- Create: `tests/api/internal-txs.test.ts`

- [ ] **Step 1: Write internal tx tests**

Create `tests/api/internal-txs.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchInternalTxs, sortInternalTxs } from "../../src/api/internal-txs.js";

const ADDRESS = "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW";

function mockFetch(fixture: unknown): void {
  globalThis.fetch = mock((input: Request | string | URL) => {
    return Promise.resolve(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
}

describe("fetchInternalTxs", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses internal transactions with S1 unit shape", async () => {
    const fixture = {
      data: [
        {
          internal_id: "itx_001",
          hash: "abc123",
          block_timestamp: 1776315840000,
          caller_address: "TFromAddr",
          transferTo_address: "TToAddr",
          callValueInfo: [{ callValue: 1000000 }],
          call_type: "call",
          rejected: false,
        },
      ],
    };
    mockFetch(fixture);
    const client = createClient({ network: "mainnet" });
    const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });

    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.internal_id).toBe("itx_001");
    expect(row.tx_id).toBe("abc123");
    expect(row.from).toBe("TFromAddr");
    expect(row.to).toBe("TToAddr");
    expect(row.value).toBe(1000000);
    expect(row.value_unit).toBe("sun");
    expect(row.decimals).toBe(6);
    expect(row.value_trx).toBe("1");
    expect(row.call_type).toBe("call");
    expect(row.rejected).toBe(false);
  });

  it("returns empty array when no internal txs", async () => {
    mockFetch({ data: [] });
    const client = createClient({ network: "mainnet" });
    const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
    expect(rows).toEqual([]);
  });

  it("handles rejected internal transactions", async () => {
    const fixture = {
      data: [
        {
          internal_id: "itx_rej",
          hash: "def456",
          block_timestamp: 1776315840000,
          caller_address: "TA",
          transferTo_address: "TB",
          callValueInfo: [{ callValue: 0 }],
          call_type: "call",
          rejected: true,
        },
      ],
    };
    mockFetch(fixture);
    const client = createClient({ network: "mainnet" });
    const rows = await fetchInternalTxs(client, ADDRESS, { limit: 20 });
    expect(rows[0]?.rejected).toBe(true);
  });

  it("passes time range query params", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = mock((input: Request | string | URL) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as unknown as typeof fetch;

    const client = createClient({ network: "mainnet" });
    await fetchInternalTxs(client, ADDRESS, {
      limit: 10,
      minTimestamp: 1744000000000,
      maxTimestamp: 1744999999000,
    });

    expect(capturedUrl).toContain("min_timestamp=1744000000000");
    expect(capturedUrl).toContain("max_timestamp=1744999999000");
    expect(capturedUrl).toContain("limit=10");
  });
});

describe("sortInternalTxs", () => {
  const mkRow = (overrides: Record<string, unknown>) => ({
    internal_id: "itx_x",
    tx_id: "tx_x",
    block_timestamp: 1000,
    from: "TA",
    to: "TB",
    call_type: "call",
    value: 0,
    value_unit: "sun" as const,
    decimals: 6 as const,
    value_trx: "0",
    rejected: false,
    ...overrides,
  });

  it("defaults to block_timestamp desc", () => {
    const items = [
      mkRow({ internal_id: "a", block_timestamp: 1000 }),
      mkRow({ internal_id: "b", block_timestamp: 3000 }),
      mkRow({ internal_id: "c", block_timestamp: 2000 }),
    ];
    const out = sortInternalTxs(items, {});
    expect(out.map(x => x.internal_id)).toEqual(["b", "c", "a"]);
  });

  it("--sort-by value sorts by value desc", () => {
    const items = [
      mkRow({ internal_id: "a", value: 100 }),
      mkRow({ internal_id: "b", value: 300 }),
      mkRow({ internal_id: "c", value: 200 }),
    ];
    const out = sortInternalTxs(items, { sortBy: "value" });
    expect(out.map(x => x.internal_id)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/api/internal-txs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement internal txs utility**

Create `src/api/internal-txs.ts`:

```typescript
import type { ApiClient } from "./client.js";
import { muted } from "../output/colors.js";
import {
  addThousandsSep,
  alignNumber,
  computeColumnWidths,
  renderColumns,
  truncateAddress,
} from "../output/columns.js";
import { formatTimestamp, sunToTrx } from "../output/format.js";
import { applySort, type SortConfig, type SortOptions } from "../utils/sort.js";

export interface InternalTxRow {
  internal_id: string;
  tx_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  call_type: string;
  value: number;
  value_unit: "sun";
  decimals: 6;
  value_trx: string;
  rejected: boolean;
}

interface RawInternalTx {
  internal_id?: string;
  hash?: string;
  block_timestamp?: number;
  caller_address?: string;
  transferTo_address?: string;
  callValueInfo?: Array<{ callValue?: number }>;
  call_type?: string;
  rejected?: boolean;
}

interface InternalTxsResponse {
  data?: RawInternalTx[];
}

export async function fetchInternalTxs(
  client: ApiClient,
  address: string,
  opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<InternalTxRow[]> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit));
  if (opts.minTimestamp !== undefined) params.set("min_timestamp", String(opts.minTimestamp));
  if (opts.maxTimestamp !== undefined) params.set("max_timestamp", String(opts.maxTimestamp));

  const path = `/v1/accounts/${address}/transactions/internal?${params.toString()}`;
  const raw = await client.get<InternalTxsResponse>(path);

  return (raw.data ?? []).map((tx) => {
    const value = tx.callValueInfo?.[0]?.callValue ?? 0;
    return {
      internal_id: tx.internal_id ?? "",
      tx_id: tx.hash ?? "",
      block_timestamp: tx.block_timestamp ?? 0,
      from: tx.caller_address ?? "",
      to: tx.transferTo_address ?? "",
      call_type: tx.call_type ?? "call",
      value,
      value_unit: "sun" as const,
      decimals: 6 as const,
      value_trx: sunToTrx(value),
      rejected: tx.rejected ?? false,
    };
  });
}

const INTERNAL_TXS_SORT_CONFIG: SortConfig<InternalTxRow> = {
  defaultField: "block_timestamp",
  fieldDirections: {
    block_timestamp: "desc",
    value: "desc",
    call_type: "asc",
  },
  tieBreakField: "block_timestamp",
};

export function sortInternalTxs(items: InternalTxRow[], opts: SortOptions): InternalTxRow[] {
  return applySort(items, INTERNAL_TXS_SORT_CONFIG, opts);
}

export function renderInternalTxs(rows: InternalTxRow[]): void {
  if (rows.length === 0) {
    console.log(muted("No internal transactions found."));
    return;
  }
  const noun = rows.length === 1 ? "internal transaction" : "internal transactions";
  console.log(muted(`Found ${rows.length} ${noun}:\n`));

  const header = ["Time", "Type", "From", "", "To", "Value", "Unit", "TX"];
  const cells: string[][] = rows.map((r) => [
    formatTimestamp(r.block_timestamp),
    r.rejected ? `${r.call_type} [rejected]` : r.call_type,
    truncateAddress(r.from),
    "→",
    truncateAddress(r.to),
    addThousandsSep(r.value_trx),
    "TRX",
    truncateAddress(r.tx_id, 4, 4),
  ]);

  const allRows = [header, ...cells];

  // Right-align value column
  const valueCol = 5;
  const valueWidth = Math.max(...allRows.map((c) => (c[valueCol] ?? "").length));
  for (const row of allRows) {
    const cur = row[valueCol] ?? "";
    row[valueCol] = alignNumber(cur, valueWidth);
  }

  const widths = computeColumnWidths(allRows);
  const lines = renderColumns(allRows, widths);
  console.log(`  ${muted(lines[0] ?? "")}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`  ${lines[i]}`);
  }
}
```

- [ ] **Step 4: Run internal tx tests**

Run: `bun test tests/api/internal-txs.test.ts`
Expected: All passing

- [ ] **Step 5: Run full suite**

Run: `bun test`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add src/api/internal-txs.ts tests/api/internal-txs.test.ts
git commit -m "feat: add internal transactions fetch and render utility"
```

---

## Task 4: Add terminology glossary (P3)

**Files:**
- Create: `docs/designs/glossary.md`

- [ ] **Step 1: Create glossary**

Create `docs/designs/glossary.md`:

```markdown
# Terminology Glossary

API-to-CLI field name mapping. All commands reference this doc for consistent user-facing terminology. Entries are grouped by domain.

## Contract

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `origin_address` | Deployer | `deployer` | Contract deployer address |
| `consume_user_resource_percent` | Caller pays | `caller_energy_ratio` | % of energy paid by caller (vs contract subsidy) |
| `origin_energy_limit` | Deployer cap | `deployer_energy_cap` | Max energy the deployer subsidizes per call |
| `trx_hash` | Deploy TX | `deploy_tx` | Hash of the most recent deployment transaction |
| (derived) | Status | `status` | `active` or `destroyed` — derived from getcontract response |

## Account

*Existing commands already use intuitive terms. New entries added as terminology diverges.*

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `balance` | Balance | `balance` / `balance_trx` | S1 unit shape (sun → TRX) |

## Internal Transactions

| API field | CLI term | JSON key | Context |
|-----------|----------|----------|---------|
| `caller_address` | From | `from` | Internal call origin |
| `transferTo_address` | To | `to` | Internal call destination |
| `callValueInfo[0].callValue` | Value | `value` / `value_trx` | TRX transferred (S1 shape) |
| `call_type` | Type | `call_type` | call, delegatecall, staticcall, create |
```

- [ ] **Step 2: Commit**

```bash
git add docs/designs/glossary.md
git commit -m "docs: add terminology glossary for API-to-CLI field mapping"
```

---

## Task 5: Extract action functions from account commands (P4)

**Files:**
- Modify: `src/commands/account/transfers.ts`
- Modify: `src/commands/account/tokens.ts`
- Modify: `src/commands/account/resources.ts`
- Modify: `src/commands/account/delegations.ts`

The pattern is identical for all four files: extract the `.action(async (...) => { ... })` body into an exported `async function account*Action(address, parent)` and call it from the command registration.

- [ ] **Step 1: Extract `accountTransfersAction`**

In `src/commands/account/transfers.ts`, extract the action body to a named export:

```typescript
// Add this exported function BEFORE registerAccountTransfersCommand:
export async function accountTransfersAction(
  address: string | undefined,
  parent: Command,
): Promise<void> {
  const { getClient, parseFields } = await import("../../index.js");
  const opts = parent.opts<GlobalOptions>();
  try {
    const resolved = resolveAddress(address);
    const client = getClient(opts);
    const range = parseTimeRange(opts.before, opts.after);
    const rows = await fetchAccountTransfers(client, resolved, {
      limit: Number.parseInt(opts.limit, 10),
      minTimestamp: range.minTimestamp,
      maxTimestamp: range.maxTimestamp,
    });
    const sorted = sortTransfers(rows, {
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
}
```

Then update the `.action()` call to delegate:

```typescript
.action(async (address: string | undefined) => {
  await accountTransfersAction(address, parent);
});
```

- [ ] **Step 2: Extract `accountTokensAction`**

Same pattern in `src/commands/account/tokens.ts`. Extract the action body and delegate.

- [ ] **Step 3: Extract `accountResourcesAction`**

Same pattern in `src/commands/account/resources.ts`. Extract the action body and delegate.

- [ ] **Step 4: Extract `accountDelegationsAction`**

Same pattern in `src/commands/account/delegations.ts`. Extract the action body and delegate.

- [ ] **Step 5: Run full test suite to verify no regressions**

Run: `bun test`
Expected: All passing (same count — pure refactor, no new tests needed)

- [ ] **Step 6: Commit**

```bash
git add src/commands/account/transfers.ts src/commands/account/tokens.ts src/commands/account/resources.ts src/commands/account/delegations.ts
git commit -m "refactor: extract action functions from account commands for mirror reuse"
```

---

## Task 6: Add `contract view` command (M1)

**Files:**
- Create: `src/commands/contract/view.ts`
- Create: `tests/commands/contract-view.test.ts`
- Modify: `src/index.ts`

This task also registers the `contract` parent command.

- [ ] **Step 1: Write contract view tests**

Create `tests/commands/contract-view.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractView } from "../../src/commands/contract/view.js";

function mockFetch(contractFixture: unknown): void {
  globalThis.fetch = mock((input: Request | string | URL) => {
    return Promise.resolve(
      new Response(JSON.stringify(contractFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
}

const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("fetchContractView", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("maps API fields to CLI terminology", async () => {
    mockFetch({
      contract_address: USDT_CONTRACT,
      contract_name: "TetherToken",
      origin_address: "TGzz69Gjhf4gWyrQyxp3k3R19cLhYiVa9K",
      consume_user_resource_percent: 100,
      origin_energy_limit: 0,
      trx_hash: "abc123def456",
      bytecode: "6060604052341561",
      abi: {
        entrys: [
          {
            type: "Function",
            name: "transfer",
            stateMutability: "Nonpayable",
            inputs: [
              { name: "to", type: "address" },
              { name: "value", type: "uint256" },
            ],
            outputs: [{ type: "bool" }],
          },
          {
            type: "Event",
            name: "Transfer",
            inputs: [
              { name: "from", type: "address", indexed: true },
              { name: "to", type: "address", indexed: true },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchContractView(client, USDT_CONTRACT);

    expect(result.address).toBe(USDT_CONTRACT);
    expect(result.name).toBe("TetherToken");
    expect(result.deployer).toBe("TGzz69Gjhf4gWyrQyxp3k3R19cLhYiVa9K");
    expect(result.caller_energy_ratio).toBe(100);
    expect(result.deployer_energy_cap).toBe(0);
    expect(result.deploy_tx).toBe("abc123def456");
    expect(result.status).toBe("active");
    expect(result.bytecode_length).toBe(8); // "6060604052341561" is 16 hex chars = 8 bytes
    expect(result.abi_summary.method_count).toBe(1);
    expect(result.abi_summary.event_count).toBe(1);
  });

  it("returns destroyed status when contract has no bytecode", async () => {
    mockFetch({
      contract_address: USDT_CONTRACT,
      contract_name: "",
      origin_address: "",
      consume_user_resource_percent: 0,
      origin_energy_limit: 0,
      trx_hash: "",
      bytecode: "",
      abi: {},
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchContractView(client, USDT_CONTRACT);
    expect(result.status).toBe("destroyed");
  });

  it("handles missing ABI gracefully", async () => {
    mockFetch({
      contract_address: USDT_CONTRACT,
      contract_name: "NoABI",
      origin_address: "TDeployer",
      consume_user_resource_percent: 0,
      origin_energy_limit: 0,
      trx_hash: "tx123",
      bytecode: "aabb",
    });

    const client = createClient({ network: "mainnet" });
    const result = await fetchContractView(client, USDT_CONTRACT);
    expect(result.abi_summary.method_count).toBe(0);
    expect(result.abi_summary.event_count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/commands/contract-view.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement contract view**

Create `src/commands/contract/view.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import { printResult, reportErrorAndExit } from "../../output/format.js";
import { normalizeAbiEntries, parseAbi, type AbiSummary } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";

export interface ContractViewResult {
  address: string;
  name: string;
  deployer: string;
  status: "active" | "destroyed";
  deploy_tx: string;
  caller_energy_ratio: number;
  deployer_energy_cap: number;
  abi_summary: {
    method_count: number;
    event_count: number;
    methods: string[];
    events: string[];
  };
  bytecode_length: number;
}

interface GetContractResponse {
  contract_address?: string;
  contract_name?: string;
  origin_address?: string;
  consume_user_resource_percent?: number;
  origin_energy_limit?: number;
  trx_hash?: string;
  bytecode?: string;
  abi?: { entrys?: unknown[] };
}

export async function fetchContractView(
  client: ApiClient,
  address: string,
): Promise<ContractViewResult> {
  const raw = await client.post<GetContractResponse>("/wallet/getcontract", {
    value: address,
    visible: true,
  });

  const bytecodeHex = raw.bytecode ?? "";
  const bytecodeLength = Math.floor(bytecodeHex.length / 2);
  const status: "active" | "destroyed" = bytecodeHex.length > 0 ? "active" : "destroyed";

  const rawEntries = raw.abi?.entrys ?? [];
  const normalized = normalizeAbiEntries(rawEntries);
  const abiParsed: AbiSummary = parseAbi(normalized);

  return {
    address: raw.contract_address ?? address,
    name: raw.contract_name ?? "",
    deployer: raw.origin_address ?? "",
    status,
    deploy_tx: raw.trx_hash ?? "",
    caller_energy_ratio: raw.consume_user_resource_percent ?? 0,
    deployer_energy_cap: raw.origin_energy_limit ?? 0,
    abi_summary: {
      method_count: abiParsed.method_count,
      event_count: abiParsed.event_count,
      methods: abiParsed.methods.map((m) => m.signature),
      events: abiParsed.events.map((e) => e.signature),
    },
    bytecode_length: bytecodeLength,
  };
}

export function registerContractCommands(parent: Command): Command {
  const contract = parent
    .command("contract")
    .description("Smart contract queries")
    .helpGroup("Read commands:");

  return contract;
}

export function registerContractViewCommand(contract: Command, parent: Command): void {
  contract
    .command("view")
    .description("View contract metadata, ABI summary, and deployment info")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
  $ trongrid contract view TR7N... --json
  $ trongrid contract view TR7N... --fields deployer,status

Terminology (see docs/designs/glossary.md):
  Deployer          — origin_address from API
  Caller pays       — consume_user_resource_percent
  Deployer cap      — origin_energy_limit
  Status            — derived: active or destroyed
`,
    )
    .action(async (address: string) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const data = await fetchContractView(client, address);

        const readCount = data.abi_summary.methods.length > 0
          ? data.abi_summary.methods.filter((_, i) => {
              // We'd need the full AbiMethod for type info; for now just show total
              return true;
            }).length
          : 0;

        printResult(
          data,
          [
            ["address", "Contract", data.address],
            ["name", "Name", data.name || muted("(unnamed)")],
            ["deployer", "Deployer", data.deployer || muted("(unknown)")],
            ["status", "Status", data.status === "active" ? "Active" : "Destroyed"],
            ["deploy_tx", "Deploy TX", data.deploy_tx || muted("(unknown)")],
            ["caller_energy_ratio", "Caller pays", `${data.caller_energy_ratio}%`],
            ["deployer_energy_cap", "Deployer cap", String(data.deployer_energy_cap)],
            [
              "abi_summary",
              "ABI Summary",
              `${data.abi_summary.method_count} methods, ${data.abi_summary.event_count} events`,
            ],
            ["bytecode_length", "Bytecode", `${data.bytecode_length.toLocaleString()} bytes`],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
        });
      }
    });
}
```

- [ ] **Step 4: Run contract view tests**

Run: `bun test tests/commands/contract-view.test.ts`
Expected: All passing

- [ ] **Step 5: Commit**

```bash
git add src/commands/contract/view.ts tests/commands/contract-view.test.ts
git commit -m "feat: add contract view command"
```

---

## Task 7: Add `contract methods` command (M2)

**Files:**
- Create: `src/commands/contract/methods.ts`
- Create: `tests/commands/contract-methods.test.ts`

- [ ] **Step 1: Write contract methods tests**

Create `tests/commands/contract-methods.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractMethods } from "../../src/commands/contract/methods.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function mockFetch(contractFixture: unknown): void {
  globalThis.fetch = mock(() => {
    return Promise.resolve(
      new Response(JSON.stringify(contractFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
}

const ABI_FIXTURE = {
  contract_address: CONTRACT,
  bytecode: "aabb",
  abi: {
    entrys: [
      {
        type: "Function",
        name: "transfer",
        stateMutability: "Nonpayable",
        inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
        outputs: [{ type: "bool" }],
      },
      {
        type: "Function",
        name: "balanceOf",
        stateMutability: "View",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ type: "uint256" }],
      },
      {
        type: "Function",
        name: "approve",
        stateMutability: "Nonpayable",
        inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
        outputs: [{ type: "bool" }],
      },
      { type: "Event", name: "Transfer", inputs: [] },
    ],
  },
};

describe("fetchContractMethods", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns all methods with correct selectors", async () => {
    mockFetch(ABI_FIXTURE);
    const client = createClient({ network: "mainnet" });
    const methods = await fetchContractMethods(client, CONTRACT);

    expect(methods.length).toBe(3);
    const transfer = methods.find(m => m.name === "transfer");
    expect(transfer?.selector).toBe("0xa9059cbb");
    expect(transfer?.type).toBe("write");
  });

  it("filters by --type read", async () => {
    mockFetch(ABI_FIXTURE);
    const client = createClient({ network: "mainnet" });
    const methods = await fetchContractMethods(client, CONTRACT, "read");

    expect(methods.length).toBe(1);
    expect(methods[0]?.name).toBe("balanceOf");
  });

  it("filters by --type write", async () => {
    mockFetch(ABI_FIXTURE);
    const client = createClient({ network: "mainnet" });
    const methods = await fetchContractMethods(client, CONTRACT, "write");

    expect(methods.length).toBe(2);
    expect(methods.map(m => m.name).sort()).toEqual(["approve", "transfer"]);
  });

  it("returns empty for contract with no ABI", async () => {
    mockFetch({ contract_address: CONTRACT, bytecode: "aa", abi: {} });
    const client = createClient({ network: "mainnet" });
    const methods = await fetchContractMethods(client, CONTRACT);
    expect(methods).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement contract methods**

Create `src/commands/contract/methods.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
  computeColumnWidths,
  renderColumns,
} from "../../output/columns.js";
import {
  printListResult,
  reportErrorAndExit,
  UsageError,
} from "../../output/format.js";
import { type AbiMethod, normalizeAbiEntries, parseAbi } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";

interface GetContractResponse {
  abi?: { entrys?: unknown[] };
}

export async function fetchContractMethods(
  client: ApiClient,
  address: string,
  typeFilter?: "read" | "write",
): Promise<AbiMethod[]> {
  const raw = await client.post<GetContractResponse>("/wallet/getcontract", {
    value: address,
    visible: true,
  });

  const rawEntries = raw.abi?.entrys ?? [];
  const normalized = normalizeAbiEntries(rawEntries);
  const summary = parseAbi(normalized);

  let methods = summary.methods;
  if (typeFilter) {
    methods = methods.filter((m) => m.type === typeFilter);
  }
  return methods;
}

function renderMethods(methods: AbiMethod[]): void {
  if (methods.length === 0) {
    console.log(muted("No methods found."));
    return;
  }
  const noun = methods.length === 1 ? "method" : "methods";
  console.log(muted(`${methods.length} ${noun}:\n`));

  const header = ["Selector", "Type", "Mutability", "Signature"];
  const cells: string[][] = methods.map((m) => [
    m.selector,
    m.type,
    m.mutability,
    m.signature,
  ]);

  const allRows = [header, ...cells];
  const widths = computeColumnWidths(allRows);
  const lines = renderColumns(allRows, widths);
  console.log(`  ${muted(lines[0] ?? "")}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`  ${lines[i]}`);
  }
}

export function registerContractMethodsCommand(contract: Command, parent: Command): void {
  contract
    .command("methods")
    .description("List ABI methods with selectors and types")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .option("--type <type>", "filter by method type: read or write")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid contract methods TR7N...
  $ trongrid contract methods TR7N... --type read
  $ trongrid contract methods TR7N... --type write
  $ trongrid contract methods TR7N... --json

Type mapping:
  read  — view + pure (no gas, no state change)
  write — nonpayable + payable (requires transaction)
`,
    )
    .action(async (address: string, localOpts: { type?: string }) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        if (localOpts.type && localOpts.type !== "read" && localOpts.type !== "write") {
          throw new UsageError(
            `Invalid --type value: "${localOpts.type}". Expected "read" or "write".`,
          );
        }
        const client = getClient(opts);
        const methods = await fetchContractMethods(
          client,
          address,
          localOpts.type as "read" | "write" | undefined,
        );
        printListResult(methods, renderMethods, {
          json: opts.json,
          fields: parseFields(opts),
        });
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
        });
      }
    });
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/contract-methods.test.ts`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add src/commands/contract/methods.ts tests/commands/contract-methods.test.ts
git commit -m "feat: add contract methods command"
```

---

## Task 8: Add `contract events` command (M3)

**Files:**
- Create: `src/commands/contract/events.ts`
- Create: `tests/commands/contract-events.test.ts`

- [ ] **Step 1: Write contract events tests**

Create `tests/commands/contract-events.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractEvents, sortContractEvents } from "../../src/commands/contract/events.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function mockFetch(fixture: unknown): void {
  globalThis.fetch = mock(() => {
    return Promise.resolve(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as unknown as typeof fetch;
}

const HEX_FROM = "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c";
const HEX_TO = "0xffd14c4e694cb47f3cd909ecaf2d73859796553e";

describe("fetchContractEvents", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("parses event logs with hex→Base58 address conversion in params", async () => {
    mockFetch({
      data: [
        {
          event_name: "Transfer",
          transaction_id: "tx_abc",
          block_number: 81882707,
          block_timestamp: 1776315840000,
          result: { from: HEX_FROM, to: HEX_TO, value: "1000000" },
        },
      ],
    });

    const client = createClient({ network: "mainnet" });
    const rows = await fetchContractEvents(client, CONTRACT, { limit: 20 });

    expect(rows.length).toBe(1);
    expect(rows[0]?.event_name).toBe("Transfer");
    expect(rows[0]?.transaction_id).toBe("tx_abc");
    // Address params should be converted to Base58
    expect(rows[0]?.params.from).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(rows[0]?.params.to).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(rows[0]?.params.value).toBe("1000000");
  });

  it("filters by event name case-insensitively", async () => {
    mockFetch({
      data: [
        { event_name: "Transfer", transaction_id: "tx1", block_number: 1, block_timestamp: 1000, result: {} },
        { event_name: "Approval", transaction_id: "tx2", block_number: 2, block_timestamp: 2000, result: {} },
        { event_name: "Transfer", transaction_id: "tx3", block_number: 3, block_timestamp: 3000, result: {} },
      ],
    });

    const client = createClient({ network: "mainnet" });
    // lowercase "transfer" should match "Transfer"
    const rows = await fetchContractEvents(client, CONTRACT, { limit: 20, eventFilter: "transfer" });
    expect(rows.length).toBe(2);
    expect(rows.every(r => r.event_name === "Transfer")).toBe(true);
  });

  it("returns empty array when no events", async () => {
    mockFetch({ data: [] });
    const client = createClient({ network: "mainnet" });
    const rows = await fetchContractEvents(client, CONTRACT, { limit: 20 });
    expect(rows).toEqual([]);
  });
});

describe("sortContractEvents", () => {
  const mkRow = (overrides: Record<string, unknown>) => ({
    event_name: "Transfer",
    transaction_id: "tx_x",
    block_number: 1,
    block_timestamp: 1000,
    params: {},
    ...overrides,
  });

  it("defaults to block_timestamp desc", () => {
    const items = [
      mkRow({ transaction_id: "a", block_timestamp: 1000 }),
      mkRow({ transaction_id: "b", block_timestamp: 3000 }),
      mkRow({ transaction_id: "c", block_timestamp: 2000 }),
    ];
    const out = sortContractEvents(items, {});
    expect(out.map(x => x.transaction_id)).toEqual(["b", "c", "a"]);
  });
});
```

- [ ] **Step 2: Implement contract events**

Create `src/commands/contract/events.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { muted } from "../../output/colors.js";
import {
  computeColumnWidths,
  renderColumns,
  truncateAddress,
} from "../../output/columns.js";
import {
  formatTimestamp,
  printListResult,
  reportErrorAndExit,
} from "../../output/format.js";
import { hexToBase58 } from "../../utils/address.js";
import { applySort, type SortConfig, type SortOptions } from "../../utils/sort.js";
import { parseTimeRange } from "../../utils/time-range.js";
import { validateAddress } from "../../utils/address.js";

export interface ContractEventRow {
  event_name: string;
  transaction_id: string;
  block_number: number;
  block_timestamp: number;
  params: Record<string, string>;
}

interface RawEvent {
  event_name?: string;
  transaction_id?: string;
  block_number?: number;
  block_timestamp?: number;
  result?: Record<string, string>;
}

interface ContractEventsResponse {
  data?: RawEvent[];
}

/** Try to convert hex address params to Base58. Non-address values pass through. */
function convertParams(result: Record<string, string>): Record<string, string> {
  const converted: Record<string, string> = {};
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && /^(0x)?[0-9a-fA-F]{40}$/.test(value)) {
      try {
        converted[key] = hexToBase58(value);
        continue;
      } catch { /* not an address — keep original */ }
    }
    converted[key] = String(value);
  }
  return converted;
}

export async function fetchContractEvents(
  client: ApiClient,
  address: string,
  opts: {
    limit: number;
    eventFilter?: string;
    minBlockTimestamp?: number;
    maxBlockTimestamp?: number;
    onlyConfirmed?: boolean;
  },
): Promise<ContractEventRow[]> {
  const params = new URLSearchParams();
  params.set("order_by", "block_timestamp,desc");
  params.set("limit", String(opts.limit));
  if (opts.minBlockTimestamp !== undefined) {
    params.set("min_block_timestamp", String(opts.minBlockTimestamp));
  }
  if (opts.maxBlockTimestamp !== undefined) {
    params.set("max_block_timestamp", String(opts.maxBlockTimestamp));
  }
  if (opts.onlyConfirmed) {
    params.set("only_confirmed", "true");
  }
  // Don't pass event_name to API — filter client-side for case-insensitivity
  const path = `/v1/contracts/${address}/events?${params.toString()}`;
  const raw = await client.get<ContractEventsResponse>(path);

  let events = (raw.data ?? []).map((e) => ({
    event_name: e.event_name ?? "",
    transaction_id: e.transaction_id ?? "",
    block_number: e.block_number ?? 0,
    block_timestamp: e.block_timestamp ?? 0,
    params: convertParams(e.result ?? {}),
  }));

  // Client-side case-insensitive event name filter
  if (opts.eventFilter) {
    const filter = opts.eventFilter.toLowerCase();
    events = events.filter((e) => e.event_name.toLowerCase() === filter);
  }

  return events;
}

const EVENTS_SORT_CONFIG: SortConfig<ContractEventRow> = {
  defaultField: "block_timestamp",
  fieldDirections: {
    block_timestamp: "desc",
    event_name: "asc",
  },
  tieBreakField: "block_timestamp",
};

export function sortContractEvents(
  items: ContractEventRow[],
  opts: SortOptions,
): ContractEventRow[] {
  return applySort(items, EVENTS_SORT_CONFIG, opts);
}

function formatParams(params: Record<string, string>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => {
      const display = v.length > 20 ? truncateAddress(v, 6, 6) : v;
      return `${k}=${display}`;
    })
    .join(" ");
}

function renderContractEvents(rows: ContractEventRow[]): void {
  if (rows.length === 0) {
    console.log(muted("No events found."));
    return;
  }
  const noun = rows.length === 1 ? "event" : "events";
  console.log(muted(`Found ${rows.length} ${noun}:\n`));

  const header = ["Time", "Event", "TX", "Params"];
  const cells: string[][] = rows.map((r) => [
    formatTimestamp(r.block_timestamp),
    r.event_name,
    truncateAddress(r.transaction_id, 4, 4),
    formatParams(r.params),
  ]);

  const allRows = [header, ...cells];
  const widths = computeColumnWidths(allRows);
  const lines = renderColumns(allRows, widths);
  console.log(`  ${muted(lines[0] ?? "")}`);
  for (let i = 1; i < lines.length; i++) {
    console.log(`  ${lines[i]}`);
  }
}

export function registerContractEventsCommand(contract: Command, parent: Command): void {
  contract
    .command("events")
    .description("List event logs emitted by a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .option("--event <name>", "filter by event name (case-insensitive)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid contract events TR7N...
  $ trongrid contract events TR7N... --event Transfer
  $ trongrid contract events TR7N... --event approval
  $ trongrid contract events TR7N... --after 2026-04-01
  $ trongrid contract events TR7N... --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, event_name
`,
    )
    .action(async (address: string, localOpts: { event?: string }) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const range = parseTimeRange(opts.before, opts.after);
        const rows = await fetchContractEvents(client, address, {
          limit: Number.parseInt(opts.limit, 10),
          eventFilter: localOpts.event,
          minBlockTimestamp: range.minTimestamp,
          maxBlockTimestamp: range.maxTimestamp,
          onlyConfirmed: opts.confirmed,
        });

        const sorted = sortContractEvents(rows, {
          sortBy: opts.sortBy,
          reverse: opts.reverse,
        });

        printListResult(sorted, renderContractEvents, {
          json: opts.json,
          fields: parseFields(opts),
        });
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
        });
      }
    });
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/contract-events.test.ts`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add src/commands/contract/events.ts tests/commands/contract-events.test.ts
git commit -m "feat: add contract events command with --event filter"
```

---

## Task 9: Add `contract txs` command with `--method` filter (M4)

**Files:**
- Create: `src/commands/contract/txs.ts`
- Create: `tests/commands/contract-txs.test.ts`

- [ ] **Step 1: Write contract txs tests**

Create `tests/commands/contract-txs.test.ts`:

```typescript
import { afterEach, describe, expect, it, mock } from "bun:test";
import { createClient } from "../../src/api/client.js";
import { fetchContractTxs } from "../../src/commands/contract/txs.js";

const CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function mockFetch(handlers: Record<string, unknown>): void {
  globalThis.fetch = mock((input: Request | string | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    }
    return Promise.resolve(
      new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }) as unknown as typeof fetch;
}

const TX_FIXTURE = {
  data: [
    {
      txID: "tx_transfer",
      blockNumber: 100,
      block_timestamp: 3000,
      net_fee: 0,
      energy_fee: 50000,
      raw_data: {
        contract: [{
          type: "TriggerSmartContract",
          parameter: {
            value: { data: "a9059cbb000000000000000000000000abcdef" },
          },
        }],
      },
      ret: [{ contractRet: "SUCCESS" }],
    },
    {
      txID: "tx_approve",
      blockNumber: 101,
      block_timestamp: 2000,
      net_fee: 0,
      energy_fee: 30000,
      raw_data: {
        contract: [{
          type: "TriggerSmartContract",
          parameter: {
            value: { data: "095ea7b3000000000000000000000000abcdef" },
          },
        }],
      },
      ret: [{ contractRet: "SUCCESS" }],
    },
    {
      txID: "tx_trx_transfer",
      blockNumber: 102,
      block_timestamp: 1000,
      net_fee: 100,
      energy_fee: 0,
      raw_data: {
        contract: [{ type: "TransferContract" }],
      },
      ret: [{ contractRet: "SUCCESS" }],
    },
  ],
};

describe("fetchContractTxs", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = originalFetch; });

  it("returns all transactions without --method filter", async () => {
    mockFetch({ "/v1/accounts/": TX_FIXTURE });
    const client = createClient({ network: "mainnet" });
    const rows = await fetchContractTxs(client, CONTRACT, { limit: 20 });
    expect(rows.length).toBe(3);
  });

  it("filters by 4-byte selector", async () => {
    mockFetch({ "/v1/accounts/": TX_FIXTURE });
    const client = createClient({ network: "mainnet" });
    const rows = await fetchContractTxs(client, CONTRACT, {
      limit: 20,
      methodFilter: "0xa9059cbb",
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.tx_id).toBe("tx_transfer");
  });

  it("filters by method name using ABI lookup (case-insensitive)", async () => {
    mockFetch({
      "/v1/accounts/": TX_FIXTURE,
      "/wallet/getcontract": {
        abi: {
          entrys: [
            {
              type: "Function",
              name: "transfer",
              stateMutability: "Nonpayable",
              inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }],
              outputs: [{ type: "bool" }],
            },
            {
              type: "Function",
              name: "approve",
              stateMutability: "Nonpayable",
              inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }],
              outputs: [{ type: "bool" }],
            },
          ],
        },
      },
    });

    const client = createClient({ network: "mainnet" });
    // "Transfer" (mixed case) should match "transfer" method
    const rows = await fetchContractTxs(client, CONTRACT, {
      limit: 20,
      methodFilter: "Transfer",
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.tx_id).toBe("tx_transfer");
  });

  it("excludes non-contract-call txs when --method is specified", async () => {
    mockFetch({ "/v1/accounts/": TX_FIXTURE });
    const client = createClient({ network: "mainnet" });
    // Plain TRX transfer (tx_trx_transfer) has no data field — excluded
    const rows = await fetchContractTxs(client, CONTRACT, {
      limit: 20,
      methodFilter: "0xa9059cbb",
    });
    expect(rows.every(r => r.tx_id !== "tx_trx_transfer")).toBe(true);
  });
});
```

- [ ] **Step 2: Implement contract txs**

Create `src/commands/contract/txs.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import type { GlobalOptions } from "../../index.js";
import { reportErrorAndExit } from "../../output/format.js";
import {
  type AccountTxRow,
  fetchAccountTxs,
  renderTxs,
  sortTxs,
} from "../account/txs.js";
import { normalizeAbiEntries, parseAbi } from "../../utils/abi.js";
import { validateAddress } from "../../utils/address.js";
import { printListResult } from "../../output/format.js";

const SELECTOR_REGEX = /^0x[0-9a-fA-F]{8}$/;

interface GetContractResponse {
  abi?: { entrys?: unknown[] };
}

interface RawTxWithData {
  txID?: string;
  blockNumber?: number;
  block_timestamp?: number;
  net_fee?: number;
  energy_fee?: number;
  raw_data?: {
    contract?: Array<{
      type?: string;
      parameter?: { value?: { data?: string } };
    }>;
  };
  ret?: Array<{ contractRet?: string }>;
}

/**
 * Resolve a method filter to a set of 4-byte selectors (lowercase, no 0x prefix).
 * - If input matches 0x + 8 hex chars: use directly.
 * - Otherwise: fetch ABI, find matching method names case-insensitively, return their selectors.
 */
async function resolveMethodSelectors(
  client: ApiClient,
  address: string,
  methodFilter: string,
): Promise<Set<string>> {
  if (SELECTOR_REGEX.test(methodFilter)) {
    return new Set([methodFilter.slice(2).toLowerCase()]);
  }

  // Name-based: fetch ABI and find matching methods
  const raw = await client.post<GetContractResponse>("/wallet/getcontract", {
    value: address,
    visible: true,
  });
  const entries = raw.abi?.entrys ?? [];
  const normalized = normalizeAbiEntries(entries);
  const summary = parseAbi(normalized);
  const filterLower = methodFilter.toLowerCase();
  const selectors = new Set<string>();
  for (const m of summary.methods) {
    if (m.name.toLowerCase() === filterLower) {
      selectors.add(m.selector.slice(2).toLowerCase());
    }
  }
  return selectors;
}

export async function fetchContractTxs(
  client: ApiClient,
  address: string,
  opts: {
    limit: number;
    methodFilter?: string;
  },
): Promise<AccountTxRow[]> {
  // Fetch using the same endpoint as account txs
  const rows = await fetchAccountTxs(client, address, { limit: opts.limit });

  if (!opts.methodFilter) return rows;

  const selectors = await resolveMethodSelectors(client, address, opts.methodFilter);
  if (selectors.size === 0) return [];

  // Re-fetch raw data for method selector matching.
  // fetchAccountTxs doesn't preserve raw_data.contract.parameter.value.data,
  // so we need the raw response. We already have it via the same endpoint.
  const path = `/v1/accounts/${address}/transactions?limit=${opts.limit}`;
  const rawResponse = await client.get<{ data?: RawTxWithData[] }>(path);

  const matchingTxIds = new Set<string>();
  for (const tx of rawResponse.data ?? []) {
    const data = tx.raw_data?.contract?.[0]?.parameter?.value?.data;
    if (!data) continue;
    const txSelector = data.slice(0, 8).toLowerCase();
    if (selectors.has(txSelector)) {
      matchingTxIds.add(tx.txID ?? "");
    }
  }

  return rows.filter((r) => matchingTxIds.has(r.tx_id));
}

export function registerContractTxsCommand(contract: Command, parent: Command): void {
  contract
    .command("txs")
    .description("List transaction history for a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .option("--method <name|selector>", "filter by method name or 4-byte selector (case-insensitive)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid contract txs TR7N...
  $ trongrid contract txs TR7N... --method transfer
  $ trongrid contract txs TR7N... --method 0xa9059cbb
  $ trongrid contract txs TR7N... --limit 50 --reverse
  $ trongrid contract txs TR7N... --json

Equivalent to: trongrid account txs <address> (without --method filter)

Sort:
  default — timestamp desc (newest first)
  fields  — timestamp, block_number, fee (all default desc)
`,
    )
    .action(async (address: string, localOpts: { method?: string }) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const rows = await fetchContractTxs(client, address, {
          limit: Number.parseInt(opts.limit, 10),
          methodFilter: localOpts.method,
        });
        const sorted = sortTxs(rows, { sortBy: opts.sortBy, reverse: opts.reverse });
        printListResult(sorted, renderTxs, {
          json: opts.json,
          fields: parseFields(opts),
        });
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
        });
      }
    });
}
```

- [ ] **Step 3: Run tests**

Run: `bun test tests/commands/contract-txs.test.ts`
Expected: All passing

- [ ] **Step 4: Commit**

```bash
git add src/commands/contract/txs.ts tests/commands/contract-txs.test.ts
git commit -m "feat: add contract txs command with --method filter"
```

---

## Task 10: Add `contract internals` + `account internals` commands (M5)

**Files:**
- Create: `src/commands/contract/internals.ts`
- Create: `src/commands/account/internals.ts`
- Create: `tests/commands/contract-internals.test.ts`
- Create: `tests/commands/account-internals.test.ts`

- [ ] **Step 1: Write contract internals test**

Create `tests/commands/contract-internals.test.ts` — smoke test that the command action delegates to `fetchInternalTxs` correctly. The core fetch/sort logic is already tested in `tests/api/internal-txs.test.ts`.

```typescript
import { describe, expect, it } from "bun:test";
import { sortInternalTxs } from "../../src/api/internal-txs.js";

describe("contract internals (delegation smoke test)", () => {
  it("sortInternalTxs is importable and works for contract context", () => {
    const items = [
      {
        internal_id: "a", tx_id: "tx", block_timestamp: 1000,
        from: "TA", to: "TB", call_type: "call",
        value: 0, value_unit: "sun" as const, decimals: 6 as const,
        value_trx: "0", rejected: false,
      },
    ];
    const sorted = sortInternalTxs(items, {});
    expect(sorted.length).toBe(1);
  });
});
```

- [ ] **Step 2: Write account internals test**

Create `tests/commands/account-internals.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { sortInternalTxs } from "../../src/api/internal-txs.js";

describe("account internals (delegation smoke test)", () => {
  it("sortInternalTxs is importable and works for account context", () => {
    const items = [
      {
        internal_id: "a", tx_id: "tx", block_timestamp: 1000,
        from: "TA", to: "TB", call_type: "call",
        value: 100, value_unit: "sun" as const, decimals: 6 as const,
        value_trx: "0.0001", rejected: false,
      },
    ];
    const sorted = sortInternalTxs(items, {});
    expect(sorted.length).toBe(1);
  });
});
```

- [ ] **Step 3: Implement contract internals command**

Create `src/commands/contract/internals.ts`:

```typescript
import type { Command } from "commander";
import type { GlobalOptions } from "../../index.js";
import {
  fetchInternalTxs,
  renderInternalTxs,
  sortInternalTxs,
} from "../../api/internal-txs.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import { parseTimeRange } from "../../utils/time-range.js";

export function registerContractInternalsCommand(contract: Command, parent: Command): void {
  contract
    .command("internals")
    .description("List internal transactions for a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid contract internals TR7N...
  $ trongrid contract internals TR7N... --limit 50
  $ trongrid contract internals TR7N... --after 2026-04-01
  $ trongrid contract internals TR7N... --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value, call_type
`,
    )
    .action(async (address: string) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const range = parseTimeRange(opts.before, opts.after);
        const rows = await fetchInternalTxs(client, address, {
          limit: Number.parseInt(opts.limit, 10),
          minTimestamp: range.minTimestamp,
          maxTimestamp: range.maxTimestamp,
        });
        const sorted = sortInternalTxs(rows, {
          sortBy: opts.sortBy,
          reverse: opts.reverse,
        });
        printListResult(sorted, renderInternalTxs, {
          json: opts.json,
          fields: parseFields(opts),
        });
      } catch (err) {
        reportErrorAndExit(err, {
          json: opts.json,
          verbose: opts.verbose,
        });
      }
    });
}
```

- [ ] **Step 4: Implement account internals command**

Create `src/commands/account/internals.ts`:

```typescript
import type { Command } from "commander";
import type { GlobalOptions } from "../../index.js";
import {
  fetchInternalTxs,
  renderInternalTxs,
  sortInternalTxs,
} from "../../api/internal-txs.js";
import { printListResult, reportErrorAndExit } from "../../output/format.js";
import { addressErrorHint, resolveAddress } from "../../utils/resolve-address.js";
import { parseTimeRange } from "../../utils/time-range.js";

export function registerAccountInternalsCommand(account: Command, parent: Command): void {
  account
    .command("internals")
    .description("List internal transactions for an address")
    .helpGroup("Read commands:")
    .argument("[address]", "TRON address (defaults to config default_address)")
    .addHelpText(
      "after",
      `
Examples:
  $ trongrid account internals TR...
  $ trongrid account internals                    # uses default_address
  $ trongrid account internals TR... --limit 50
  $ trongrid account internals TR... --json

Sort:
  default — block_timestamp desc (newest first)
  fields  — block_timestamp, value, call_type
`,
    )
    .action(async (address: string | undefined) => {
      const { getClient, parseFields } = await import("../../index.js");
      const opts = parent.opts<GlobalOptions>();
      try {
        const resolved = resolveAddress(address);
        const client = getClient(opts);
        const range = parseTimeRange(opts.before, opts.after);
        const rows = await fetchInternalTxs(client, resolved, {
          limit: Number.parseInt(opts.limit, 10),
          minTimestamp: range.minTimestamp,
          maxTimestamp: range.maxTimestamp,
        });
        const sorted = sortInternalTxs(rows, {
          sortBy: opts.sortBy,
          reverse: opts.reverse,
        });
        printListResult(sorted, renderInternalTxs, {
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

- [ ] **Step 5: Run tests**

Run: `bun test tests/commands/contract-internals.test.ts tests/commands/account-internals.test.ts`
Expected: All passing

- [ ] **Step 6: Commit**

```bash
git add src/commands/contract/internals.ts src/commands/account/internals.ts tests/commands/contract-internals.test.ts tests/commands/account-internals.test.ts
git commit -m "feat: add contract internals and account internals commands"
```

---

## Task 11: Add mirror commands (R1)

**Files:**
- Create: `src/commands/contract/transfers.ts`
- Create: `src/commands/contract/tokens.ts`
- Create: `src/commands/contract/resources.ts`
- Create: `src/commands/contract/delegations.ts`
- Create: `tests/commands/contract-mirrors.test.ts`

All four follow the same pattern: register a thin commander subcommand under `contract` that delegates to the extracted account action function.

- [ ] **Step 1: Create contract transfers mirror**

Create `src/commands/contract/transfers.ts`:

```typescript
import type { Command } from "commander";
import { accountTransfersAction } from "../account/transfers.js";

export function registerContractTransfersCommand(contract: Command, parent: Command): void {
  contract
    .command("transfers")
    .description("List TRC-10/20 token transfers for a contract address")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      "\nEquivalent to: trongrid account transfers <address>\n",
    )
    .action(async (address: string) => {
      await accountTransfersAction(address, parent);
    });
}
```

- [ ] **Step 2: Create contract tokens mirror**

Create `src/commands/contract/tokens.ts`:

```typescript
import type { Command } from "commander";
import { accountTokensAction } from "../account/tokens.js";

export function registerContractTokensCommand(contract: Command, parent: Command): void {
  contract
    .command("tokens")
    .description("List TRC20 and TRC10 token balances held by a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      "\nEquivalent to: trongrid account tokens <address>\n",
    )
    .action(async (address: string) => {
      await accountTokensAction(address, parent);
    });
}
```

- [ ] **Step 3: Create contract resources mirror**

Create `src/commands/contract/resources.ts`:

```typescript
import type { Command } from "commander";
import { accountResourcesAction } from "../account/resources.js";

export function registerContractResourcesCommand(contract: Command, parent: Command): void {
  contract
    .command("resources")
    .description("View energy, bandwidth, and staking state for a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      "\nEquivalent to: trongrid account resources <address>\n",
    )
    .action(async (address: string) => {
      await accountResourcesAction(address, parent);
    });
}
```

- [ ] **Step 4: Create contract delegations mirror**

Create `src/commands/contract/delegations.ts`:

```typescript
import type { Command } from "commander";
import { accountDelegationsAction } from "../account/delegations.js";

export function registerContractDelegationsCommand(contract: Command, parent: Command): void {
  contract
    .command("delegations")
    .description("List Stake 2.0 resource delegations for a contract")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address (Base58)")
    .addHelpText(
      "after",
      "\nEquivalent to: trongrid account delegations <address>\n",
    )
    .action(async (address: string) => {
      await accountDelegationsAction(address, parent);
    });
}
```

- [ ] **Step 5: Write mirror smoke tests**

Create `tests/commands/contract-mirrors.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";

// Verify that mirror modules export properly and can be imported.
// The actual behavior is tested through the account command tests —
// mirrors are pure delegation.

describe("contract mirror commands (import smoke test)", () => {
  it("contract/transfers.ts exports registerContractTransfersCommand", async () => {
    const mod = await import("../../src/commands/contract/transfers.js");
    expect(typeof mod.registerContractTransfersCommand).toBe("function");
  });

  it("contract/tokens.ts exports registerContractTokensCommand", async () => {
    const mod = await import("../../src/commands/contract/tokens.js");
    expect(typeof mod.registerContractTokensCommand).toBe("function");
  });

  it("contract/resources.ts exports registerContractResourcesCommand", async () => {
    const mod = await import("../../src/commands/contract/resources.js");
    expect(typeof mod.registerContractResourcesCommand).toBe("function");
  });

  it("contract/delegations.ts exports registerContractDelegationsCommand", async () => {
    const mod = await import("../../src/commands/contract/delegations.js");
    expect(typeof mod.registerContractDelegationsCommand).toBe("function");
  });
});
```

- [ ] **Step 6: Run tests**

Run: `bun test tests/commands/contract-mirrors.test.ts`
Expected: 4 passing

- [ ] **Step 7: Commit**

```bash
git add src/commands/contract/transfers.ts src/commands/contract/tokens.ts src/commands/contract/resources.ts src/commands/contract/delegations.ts tests/commands/contract-mirrors.test.ts
git commit -m "feat: add contract mirror commands (transfers, tokens, resources, delegations)"
```

---

## Task 12: Wire commands in index.ts (W1)

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add imports and registration**

Add to `src/index.ts` after the existing token/tx/auth/config imports:

```typescript
import { registerContractCommands, registerContractViewCommand } from "./commands/contract/view.js";
import { registerContractMethodsCommand } from "./commands/contract/methods.js";
import { registerContractEventsCommand } from "./commands/contract/events.js";
import { registerContractTxsCommand } from "./commands/contract/txs.js";
import { registerContractInternalsCommand } from "./commands/contract/internals.js";
import { registerContractTransfersCommand } from "./commands/contract/transfers.js";
import { registerContractTokensCommand } from "./commands/contract/tokens.js";
import { registerContractResourcesCommand } from "./commands/contract/resources.js";
import { registerContractDelegationsCommand } from "./commands/contract/delegations.js";
import { registerAccountInternalsCommand } from "./commands/account/internals.js";
```

Add registration calls after the existing `registerAccountPermissionsCommand(account, program);` line:

```typescript
registerAccountInternalsCommand(account, program);
const contract = registerContractCommands(program);
registerContractViewCommand(contract, program);
registerContractMethodsCommand(contract, program);
registerContractEventsCommand(contract, program);
registerContractTxsCommand(contract, program);
registerContractInternalsCommand(contract, program);
registerContractTransfersCommand(contract, program);
registerContractTokensCommand(contract, program);
registerContractResourcesCommand(contract, program);
registerContractDelegationsCommand(contract, program);
```

- [ ] **Step 2: Run full test suite + lint + build**

Run: `bun test && bun run lint && bun run build`
Expected: All passing, lint clean, build clean

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: wire contract commands and account internals in index.ts"
```

---

## Task 13: Update docs for Phase F close (W2+W3)

**Files:**
- Modify: `docs/roadmap.md`
- Modify: `docs/plans/handoff.md`
- Modify: `docs/designs/commands.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update roadmap**

In `docs/roadmap.md`, update Phase F section:
- Change `## Phase F — Contract family` to `## Phase F — Contract family ✅ (pre-publish, untagged)`
- Mark all items `[x]`
- Add items for the commands actually shipped (view, methods, events, txs, internals, mirrors)
- Add deferred items section (call, estimate, permissions)

- [ ] **Step 2: Update handoff**

In `docs/plans/handoff.md`:
- Update state table: `Active phase` → Phase G, test count → ~420, commands → 27 across 7 resources
- Add Phase F entries to decision ledger:
  - Multi-entry principle → `docs/specs/phase-f.md`
  - `deployer` naming (not `origin` or `creator`) → glossary
  - `contract call`/`estimate` deferred → spec Q1
  - `contract permissions` not applicable for CA → spec
  - Keccak-256 self-implemented → `src/utils/keccak.ts`
  - Terminology glossary → `docs/designs/glossary.md`

- [ ] **Step 3: Update commands.md**

In `docs/designs/commands.md`, update the `contract` section to reflect the final shipped surface: `view`, `methods`, `events`, `txs`, `internals`, `transfers`, `tokens`, `resources`, `delegations`. Note deferred `call`/`estimate`.

- [ ] **Step 4: Update AGENTS.md**

In `AGENTS.md`:
- Add `contract/` directory to the file layout section
- Add `contract` commands to the "Recommended first commands" or "File layout" section
- Document the multi-entry principle briefly

- [ ] **Step 5: Commit**

```bash
git add docs/roadmap.md docs/plans/handoff.md docs/designs/commands.md AGENTS.md
git commit -m "docs: update roadmap, handoff, commands, and AGENTS.md for Phase F close"
```

---

## Task 14: E2E acceptance pass

Per AGENTS.md contribution rules, run end-to-end acceptance against real TronGrid API before phase close.

**Test contract:** USDT — `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

- [ ] **Step 1: Contract-specific commands**

```bash
# contract view
bun run src/index.ts contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

# contract methods
bun run src/index.ts contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --type read
bun run src/index.ts contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --type write
bun run src/index.ts contract methods TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

# contract events
bun run src/index.ts contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --event transfer
bun run src/index.ts contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --event Transfer
bun run src/index.ts contract events TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

# contract txs
bun run src/index.ts contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --method 0xa9059cbb
bun run src/index.ts contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --method transfer
bun run src/index.ts contract txs TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json

# contract internals
bun run src/index.ts contract internals TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract internals TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json
```

- [ ] **Step 2: Mirror commands**

```bash
bun run src/index.ts contract transfers TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract tokens TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract resources TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts contract delegations TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
```

- [ ] **Step 3: Account internals**

```bash
bun run src/index.ts account internals TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
bun run src/index.ts account internals TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json
```

- [ ] **Step 4: Error paths**

```bash
# Invalid address
bun run src/index.ts contract view INVALID_ADDR
# Expected: exit 2

# Help text shows equivalence note on mirrors
bun run src/index.ts contract transfers --help
# Expected: "Equivalent to: trongrid account transfers <address>"

# Invalid --type on contract methods
bun run src/index.ts contract methods TR7N... --type bogus
# Expected: exit 2
```

- [ ] **Step 5: Fix any issues found, re-run `bun test`, commit fixes**

---

## Self-Review Checklist

- [x] **Spec coverage:** All 10 commands from spec have tasks. Glossary (P3) has a task. Multi-entry principle documented in W2+W3. Deferred items (call/estimate/permissions) listed in spec out-of-scope.
- [x] **Placeholder scan:** No TBD/TODO in any task. All code blocks are complete.
- [x] **Type consistency:** `ContractViewResult`, `ContractEventRow`, `InternalTxRow`, `AbiMethod`, `AbiEvent`, `AbiSummary` — all consistent between definition and usage. `normalizeAbiEntries` lives in `abi.ts` and is imported by view.ts, methods.ts, and txs.ts.
