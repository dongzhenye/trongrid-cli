# Phase F — Contract family

> **For agentic workers:** this document is the Phase F **spec** (brainstorming output, human-facing) — it defines goal, architecture, file map, task outline, and exit criteria. Its sibling **plan** (step-level implementation detail, agent-facing) lives at [`../plans/phase-f.md`](../plans/phase-f.md) and is produced from this spec by the `superpowers:writing-plans` skill.
>
> **Phase F ships as a single PR** on branch `feat/phase-f-contract-family`, structured in three logical sections: F-prep (shared plumbing), F-main (contract-specific commands), F-mirror (contract-namespace mirrors of account commands).

**Goal.** Introduce the `contract` resource namespace with five contract-specific commands (`view`, `methods`, `events`, `txs`, `internals`) plus four mirror commands that delegate to existing `account` logic (`transfers`, `tokens`, `resources`, `delegations`). Add `account internals` as a new account-side command sharing implementation with `contract internals`. Establish terminology glossary for cross-command consistency.

## Design principle: multi-entry (Multi-entry principle)

A contract address is a strict subset of an account address on TRON. Users and agents should be able to reach information via whichever namespace feels intuitive — `contract txs <addr>` or `account txs <addr>` both work. This is not redundancy; it is zero-friction discoverability. The implementation shares logic — only the command registration is duplicated.

**Rule:** when the same data is queryable via both an `account` and a `contract` entry point, both entry points must exist. Help text on mirror commands explicitly notes the equivalence (e.g., `Equivalent to: trongrid account transfers <address>`). This principle is documented here and in `docs/product.md` for future reference.

## Command overview (10 commands)

### Contract-specific (5)

| Command | Description | API |
|---------|-------------|-----|
| `contract view <address>` | Contract metadata: deployer, status, energy model, ABI/bytecode summary, deploy tx | `POST /wallet/getcontract` |
| `contract methods <address>` | ABI method listing: signature, type (read/write), mutability, selector | Parsed from `getcontract` ABI |
| `contract events <address>` | Event logs (all types), `--event <name>` filter (case-insensitive) | `GET /v1/contracts/{addr}/events` |
| `contract txs <address>` | Transaction history, `--method <name\|selector>` filter (case-insensitive) | `GET /v1/accounts/{addr}/transactions` |
| `contract internals <address>` | Internal transactions | `GET /v1/accounts/{addr}/transactions/internal` (to verify) |

### Mirror commands (4)

| Command | Delegates to | Help note |
|---------|-------------|-----------|
| `contract transfers <address>` | `account transfers` logic | `Equivalent to: trongrid account transfers <address>` |
| `contract tokens <address>` | `account tokens` logic | `Equivalent to: trongrid account tokens <address>` |
| `contract resources <address>` | `account resources` logic | `Equivalent to: trongrid account resources <address>` |
| `contract delegations <address>` | `account delegations` logic | `Equivalent to: trongrid account delegations <address>` |

### Account addition (1)

| Command | Description | API |
|---------|-------------|-----|
| `account internals <address>` | Internal transactions (shared impl with `contract internals`) | Same endpoint |

## Architecture

### New utility: ABI parser (`src/utils/abi.ts`)

Parses the ABI JSON from `getcontract` into structured method/event descriptors. No encoding/decoding — just structural parsing for `contract view` summary and `contract methods` listing.

```typescript
export interface AbiMethod {
  selector: string;         // 4-byte hex, e.g. "0xa9059cbb"
  name: string;
  signature: string;        // e.g. "transfer(address,uint256)"
  type: "read" | "write";   // read = view|pure, write = nonpayable|payable
  mutability: string;       // "view" | "pure" | "nonpayable" | "payable"
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

export interface AbiEvent {
  name: string;
  signature: string;        // e.g. "Transfer(address,address,uint256)"
  inputs: Array<{ name: string; type: string; indexed: boolean }>;
}

export interface AbiSummary {
  method_count: number;
  event_count: number;
  methods: AbiMethod[];
  events: AbiEvent[];
}

export function parseAbi(abiJson: unknown[]): AbiSummary;
```

**Selector computation:** `keccak256(signature).slice(0, 4)`. Solidity uses keccak-256 (the original Keccak submission, NOT the NIST-standardized SHA-3 — the padding differs). Node.js `node:crypto` does NOT support keccak-256 natively (`'sha3-256'` is NIST SHA-3, which produces different hashes).

**Pragmatic approach:** Implement a minimal keccak-256 hash function (~80 lines of sponge construction, well-documented algorithm). Zero dependencies. Validate against known selectors in tests (e.g., `transfer(address,uint256)` → `0xa9059cbb`, `balanceOf(address)` → `0x70a08231`). This is a one-time implementation cost that also enables future `contract call` ABI encoding.

### New utility: internal transaction types (`src/api/internal-txs.ts`)

Shared fetch logic for `account internals` and `contract internals`.

```typescript
export interface InternalTxRow {
  internal_id: string;      // internal tx identifier
  tx_id: string;            // parent transaction hash
  block_timestamp: number;  // unix ms
  from: string;
  to: string;
  call_type: string;        // "call" | "delegatecall" | "staticcall" | "create" | ...
  value: number;            // TRX in sun
  value_unit: "sun";
  decimals: 6;
  value_trx: string;        // formatted TRX (S1 shape)
  rejected: boolean;
}

export async function fetchInternalTxs(
  client: ApiClient,
  address: string,
  opts: { limit: number; minTimestamp?: number; maxTimestamp?: number },
): Promise<InternalTxRow[]>;
```

**Unit shape:** S1 (TRX amounts — sun, decimals 6) per `docs/designs/units.md`. Internal transactions transfer TRX only (no token transfers — those appear as events).

### Terminology glossary (`docs/designs/glossary.md`)

Maps TronGrid API field names to user-facing CLI display terms. All commands reference this doc for consistent terminology.

Initial entries (contract-related):

| API field | CLI term | Context |
|-----------|----------|---------|
| `origin_address` | `deployer` | Contract deployer address |
| `consume_user_resource_percent` | `caller_energy_ratio` | % of energy paid by caller vs contract |
| `origin_energy_limit` | `deployer_energy_cap` | Max energy the deployer will subsidize per call |
| `contract_state` (derived) | `status` | `active` or `destroyed` |
| `trx_hash` | `deploy_tx` | Transaction hash of the most recent deployment |

This doc grows incrementally across phases. Existing commands can retroactively adopt these terms in follow-up phases.

### Mirror command pattern

Mirror commands register a new commander subcommand under the `contract` parent but delegate to the existing account command's action logic. To avoid coupling to the `register*Command` function's internal structure, extract the **action body** into a reusable function:

```typescript
// In src/commands/account/transfers.ts — extract:
export async function accountTransfersAction(
  address: string | undefined,
  parent: Command,
): Promise<void> { /* existing action body */ }

// In src/commands/contract/transfers.ts — delegate:
export function registerContractTransfersCommand(contract: Command, parent: Command): void {
  contract
    .command("transfers")
    .description("List TRC-10/20 token transfers for a contract address")
    .helpGroup("Read commands:")
    .argument("<address>", "Contract address")
    .addHelpText("after", "\nEquivalent to: trongrid account transfers <address>\n")
    .action(async (address: string) => {
      await accountTransfersAction(address, parent);
    });
}
```

Note: mirror commands use `<address>` (required), not `[address]` (optional with default). Contract addresses are specific lookup targets — `default_address` fallback is an account-session convenience that doesn't apply.

## Commands (F-main)

### `contract view <address>`

**Endpoint:** `POST /wallet/getcontract` with `{ value: address, visible: true }`.

**Data shape:**

```typescript
interface ContractViewResult {
  address: string;
  name: string;
  deployer: string;           // mapped from origin_address
  status: "active" | "destroyed";  // derived
  deploy_tx: string;          // mapped from trx_hash
  caller_energy_ratio: number;  // mapped from consume_user_resource_percent
  deployer_energy_cap: number;  // mapped from origin_energy_limit
  abi_summary: {
    method_count: number;
    event_count: number;
    methods: string[];         // signatures only, e.g. ["transfer(address,uint256)", ...]
    events: string[];          // signatures only, e.g. ["Transfer(address,address,uint256)", ...]
  };
  bytecode_length: number;
}
```

ABI and bytecode are **not** included in full — both human and JSON output show summaries only. Rationale: full ABI can be thousands of lines (context-hostile for agents); full bytecode is opaque binary. Users needing the raw ABI should call the TronGrid API directly.

**Human output:**

```
Contract  TXFMh...Ljdi
Name      TetherToken
Deployer  TGzz6...9Kdr
Status    Active
Deploy TX abc1...ef23

Energy Model
  Caller pays       100%
  Deployer cap      0

ABI Summary
  6 methods (4 write, 2 read), 2 events
```

**JSON:** Single object, `ContractViewResult` shape. Rendered via `printResult`.

**Status derivation:** If `getcontract` returns empty/null response or the bytecode field is empty for a previously-known contract address, `status` = `"destroyed"`. Otherwise `"active"`. Exact field to check will be verified during implementation.

### `contract methods <address>`

**Endpoint:** Same as `contract view` — `POST /wallet/getcontract`. Parses ABI only.

**Data shape:** `AbiMethod[]` (from `parseAbi`).

**Flags:**

| Flag | Description |
|------|-------------|
| `--type read\|write` | Filter by method type. `read` = view + pure, `write` = nonpayable + payable |

**Human output:**

```
Methods (8)

  Selector     Type    Mutability   Signature
  0x70a08231   read    view         balanceOf(address)
  0xdd62ed3e   read    view         allowance(address,address)
  0xa9059cbb   write   nonpayable   transfer(address,uint256)
  0x095ea7b3   write   nonpayable   approve(address,uint256)
  0x42966c68   write   nonpayable   burn(uint256)
  0x40c10f19   write   nonpayable   mint(address,uint256)
  0x23b872dd   write   nonpayable   transferFrom(address,address,uint256)
  0x8456cb59   write   nonpayable   pause()
```

Column headers shown (same pattern as uncentered transfer list). Selector always visible — it is the true method identifier and disambiguates overloaded method names.

**JSON:** Array of `AbiMethod` objects with `selector`, `name`, `signature`, `type`, `mutability`, `inputs`, `outputs`.

**Default sort:** Declaration order from ABI (no sort). `--sort-by` supports `name`, `type`. `--reverse` flips. No `--limit` (ABI is finite, typically < 100 methods).

### `contract events <address>`

**Endpoint:** `GET /v1/contracts/{addr}/events`

Query params: `order_by=block_timestamp,desc`, `limit=N`. When `--event` is provided, the API's `event_name` param is used for server-side filtering. If the server returns zero results and the input is not PascalCase, retry without `event_name` and filter client-side case-insensitively, showing a hint about Solidity PascalCase convention.

**Flags:**

| Flag | Description |
|------|-------------|
| `--event <name>` | Filter by event name, case-insensitive |

**Data shape:**

```typescript
export interface ContractEventRow {
  event_name: string;
  transaction_id: string;
  block_number: number;
  block_timestamp: number;     // unix ms
  params: Record<string, string>;  // decoded event parameters
}
```

**Human output:**

```
Events for TXFMh...Ljdi (20)

  Time                  Event       TX            Params
  2026-04-16 12:34:56   Transfer    abc1...ef23   from=TKHu...Fs to=TWd4...wb value=1000000
  2026-04-16 12:33:10   Approval    def4...5678   owner=TKHu...Fs spender=TDqS...97 value=0
  ...
```

Params column: key=value pairs from the event's `result` field, truncated if too long. Addresses in params are converted from hex to Base58 (reusing `hexToBase58`).

**JSON:** Array of `ContractEventRow`. `params` is a flat key-value object with string values.

**Default sort:** `block_timestamp` desc (newest first). `--sort-by` supports `block_timestamp`, `event_name`. `--before`/`--after` mapped to `min_block_timestamp`/`max_block_timestamp`. `--confirmed` → `only_confirmed=true`.

### `contract txs <address>`

**Endpoint:** `GET /v1/accounts/{addr}/transactions` — same as `account txs`.

Reuses `fetchAccountTxs` from `src/commands/account/txs.ts` for the base fetch. Adds `--method` filtering as a contract-specific enhancement.

**Flags:**

| Flag | Description |
|------|-------------|
| `--method <name\|selector>` | Filter by method name or 4-byte selector, case-insensitive |

**`--method` implementation:**

1. If input matches `0x[0-9a-fA-F]{8}` — treat as a 4-byte selector, filter transactions by matching the first 4 bytes of `raw_data.contract[0].parameter.value.data`.
2. Otherwise — treat as a method name. Fetch the contract ABI via `getcontract`, find all methods whose name matches case-insensitively, collect their selectors, filter transactions by matching any of those selectors.
3. Transactions without call data (e.g., TRX transfers) are excluded when `--method` is specified.

**Human/JSON output:** Same shape as `account txs` (`AccountTxRow[]`). The renderer is reused.

**Default sort:** Same as `account txs` — `timestamp` desc.

### `contract internals <address>` / `account internals <address>`

**Endpoint:** `GET /v1/accounts/{addr}/transactions/internal` (to verify exact path and response structure during implementation).

**Shared implementation** in `src/api/internal-txs.ts`. Both commands register their own commander subcommand but call the same `fetchInternalTxs` + `renderInternalTxs` functions.

**Human output:**

```
Internal transactions (20)

  Time                  Type    From          To            Value         TX
  2026-04-16 12:34:56   call    TKHu...QgFs   TWd4...5jwb   1,000.00 TRX  abc1...ef23
  2026-04-16 12:33:10   create  TDqS...d197   TNew...addr       0.00 TRX  def4...5678
  ...
```

Rejected internal transactions are shown with a `[rejected]` marker after the type.

**JSON:** Array of `InternalTxRow` with S1 unit shape for value (sun → TRX).

**Default sort:** `block_timestamp` desc. `--sort-by` supports `block_timestamp`, `value`, `call_type`. `--before`/`--after` supported.

## File map

### F-prep (shared plumbing)

| File | Change | Item |
|------|--------|------|
| **`src/utils/abi.ts`** | **new** — `parseAbi`, `AbiMethod`, `AbiEvent`, `AbiSummary`, keccak-256 selector computation | P1 |
| `tests/utils/abi.test.ts` | **new** — parse USDT ABI fixture, selector validation, empty ABI, malformed entries | P1 |
| **`src/api/internal-txs.ts`** | **new** — `fetchInternalTxs`, `InternalTxRow`, `renderInternalTxs`, sort config | P2 |
| `tests/api/internal-txs.test.ts` | **new** — fetch + parse, sort, rejected marker, empty, S1 unit shape | P2 |
| **`docs/designs/glossary.md`** | **new** — API-to-CLI terminology mapping (initial contract entries) | P3 |
| `src/commands/account/transfers.ts` | Extract `accountTransfersAction` for mirror reuse | P4 |
| `src/commands/account/tokens.ts` | Extract `accountTokensAction` for mirror reuse | P4 |
| `src/commands/account/resources.ts` | Extract `accountResourcesAction` for mirror reuse | P4 |
| `src/commands/account/delegations.ts` | Extract `accountDelegationsAction` for mirror reuse | P4 |

### F-main (contract-specific commands)

| File | Change | Task |
|------|--------|------|
| **`src/commands/contract/view.ts`** | **new** — `ContractViewResult`, `fetchContractView`, `registerContractCommands` (parent), `registerContractViewCommand` | M1 |
| `tests/commands/contract-view.test.ts` | **new** — fetch + parse, status derivation, ABI summary, energy model fields, deployer mapping, JSON shape | M1 |
| **`src/commands/contract/methods.ts`** | **new** — `registerContractMethodsCommand`, `--type` filter, human table with selector/type/mutability/signature | M2 |
| `tests/commands/contract-methods.test.ts` | **new** — filter by read/write, selector display, empty ABI, overloaded methods, JSON shape | M2 |
| **`src/commands/contract/events.ts`** | **new** — `ContractEventRow`, `fetchContractEvents`, `renderContractEvents`, `--event` filter | M3 |
| `tests/commands/contract-events.test.ts` | **new** — event parsing, hex→Base58 params, `--event` filter case-insensitive, empty, `--before`/`--after`, JSON | M3 |
| **`src/commands/contract/txs.ts`** | **new** — `registerContractTxsCommand`, `--method` filter (name + selector), ABI-based name→selector resolution | M4 |
| `tests/commands/contract-txs.test.ts` | **new** — method filter by selector, by name, case-insensitive, no-match, reuses `AccountTxRow` shape | M4 |
| **`src/commands/contract/internals.ts`** | **new** — `registerContractInternalsCommand`, delegates to `fetchInternalTxs` | M5 |
| **`src/commands/account/internals.ts`** | **new** — `registerAccountInternalsCommand`, delegates to `fetchInternalTxs` | M5 |
| `tests/commands/contract-internals.test.ts` | **new** — basic fetch, rejected marker, S1 unit shape | M5 |
| `tests/commands/account-internals.test.ts` | **new** — mirrors contract-internals tests | M5 |

### F-mirror (contract-namespace mirrors)

| File | Change | Task |
|------|--------|------|
| **`src/commands/contract/transfers.ts`** | **new** — delegates to `accountTransfersAction` | R1 |
| **`src/commands/contract/tokens.ts`** | **new** — delegates to `accountTokensAction` | R1 |
| **`src/commands/contract/resources.ts`** | **new** — delegates to `accountResourcesAction` | R1 |
| **`src/commands/contract/delegations.ts`** | **new** — delegates to `accountDelegationsAction` | R1 |
| `tests/commands/contract-transfers.test.ts` | **new** — smoke test verifying delegation works | R1 |

### Wiring + docs

| File | Change | Task |
|------|--------|------|
| `src/index.ts` | Register `contract` parent + all 9 contract subcommands + `account internals` | W1 |
| `AGENTS.md` | Add `contract` section to file layout; document multi-entry principle | W2 |
| `docs/roadmap.md` | Phase F items all `- [x]`; heading marked ✅; add deferred items | W3 |
| `docs/plans/handoff.md` | Update state table, decision ledger (multi-entry principle, deployer naming, deferred call/estimate), test count | W3 |
| `docs/designs/commands.md` | Update `contract` section with final command list; note deferred `call`/`estimate` | W3 |

## Task outline

### F-prep (4 commits)

- **P1** — `feat: add ABI parser utility with method/event extraction`
  `src/utils/abi.ts` + tests. Parses ABI JSON into `AbiSummary`. Computes 4-byte selectors via keccak-256. Validates against known selectors in tests.

- **P2** — `feat: add internal transactions fetch + render utility`
  `src/api/internal-txs.ts` + tests. Shared by both `account internals` and `contract internals`.

- **P3** — `docs: add terminology glossary for API-to-CLI field mapping`
  `docs/designs/glossary.md`. Initial entries for contract-related fields.

- **P4** — `refactor: extract action functions from account commands for mirror reuse`
  Extract `accountTransfersAction`, `accountTokensAction`, `accountResourcesAction`, `accountDelegationsAction` from their respective files. No behavior change — pure extract.

### F-main (5 commits)

- **M1** — `feat: add contract view command`
  Contract metadata with deployer, status, energy model, ABI summary, bytecode length, deploy tx. Also registers the `contract` parent command.

- **M2** — `feat: add contract methods command`
  ABI method listing with selector, type, mutability, signature. `--type read|write` filter.

- **M3** — `feat: add contract events command`
  General event logs with `--event` filter (case-insensitive). Hex→Base58 conversion for address params.

- **M4** — `feat: add contract txs command with --method filter`
  Transaction history with `--method` filter supporting method name and 4-byte selector. Case-insensitive. Reuses `fetchAccountTxs` + adds filtering layer.

- **M5** — `feat: add contract internals and account internals commands`
  Both commands in one commit — they share `fetchInternalTxs`. Tests for both.

### F-mirror (1 commit)

- **R1** — `feat: add contract mirror commands (transfers, tokens, resources, delegations)`
  Four thin delegation commands. Each registers under `contract` and calls the extracted account action function. Smoke tests.

### Wiring + docs (2 commits)

- **W1** — `refactor: wire contract commands and account internals in index.ts`
  Register `contract` parent + 9 subcommands + `account internals`.

- **W2+W3** — `docs: update roadmap, handoff, commands, and AGENTS.md for Phase F close`
  Phase F items marked ✅. Decision ledger updated. Commands reference updated. Multi-entry principle documented.

## Exit criteria

- [ ] All commits landed on `feat/phase-f-contract-family`
- [ ] `bun test` green (expected ~420 passing; +80 over Phase E baseline of 340)
- [ ] `bun run lint` + `bun run build` clean
- [ ] `trongrid contract view <known-contract>` shows deployer, status, energy model, ABI summary
- [ ] `trongrid contract methods <known-contract>` lists methods with selectors, types, mutability
- [ ] `trongrid contract methods <known-contract> --type read` filters to read-only methods
- [ ] `trongrid contract events <known-contract>` shows recent event logs
- [ ] `trongrid contract events <known-contract> --event transfer` matches `Transfer` (case-insensitive)
- [ ] `trongrid contract txs <known-contract>` shows transaction history
- [ ] `trongrid contract txs <known-contract> --method 0xa9059cbb` filters by selector
- [ ] `trongrid contract txs <known-contract> --method transfer` filters by method name
- [ ] `trongrid contract internals <known-contract>` shows internal transactions
- [ ] `trongrid account internals <known-address>` shows internal transactions (same data, different entry point)
- [ ] `trongrid contract transfers <known-contract>` works and shows equivalence hint in help
- [ ] `trongrid contract tokens <known-contract>` works as mirror
- [ ] `trongrid contract resources <known-contract>` works as mirror
- [ ] `trongrid contract delegations <known-contract>` works as mirror
- [ ] `--json` output on all new commands matches documented shapes
- [ ] Human-mode output vertically aligned per `feedback_human_render_alignment`
- [ ] `docs/designs/glossary.md` exists with contract terminology
- [ ] No new production dependencies (still 1 — `commander`)
- [ ] PR opened: "Phase F: contract family"
- [ ] E2E acceptance pass completed per AGENTS.md contribution rules

## Out of scope (tracked for later phases)

- `contract call <address> <method> [args]` — requires general-purpose ABI encoder. Deferred to post-positioning-decision phase. See Q1 in brainstorming.
- `contract estimate <address> <method> [args]` — same blocker as `call`.
- `contract permissions <address>` — contract accounts have no practical multi-sig management scenario on TRON. EOA-only feature.
- Column headers for pre-Phase-E list commands — tracked in Phase D deferred items.
- Thousands separators for pre-Phase-E human output — tracked in Phase D deferred items.
- `--method` filter on `account txs` — could be useful but is a Phase F+ enhancement; `contract txs --method` covers the primary use case.
