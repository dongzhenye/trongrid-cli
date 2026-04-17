<!-- lifecycle: living -->
# Competitor Parity Matrix

> Living comparison of `trongrid-cli`, the official TronGrid MCP, and the community TronScan MCP. Updated as competitors evolve and new commands ship.

## Why this exists

Multiple tools query TRON blockchain data. This doc helps users (human + AI) pick the right one — not by ranking, but by showing what each covers. For TRON ecosystem context and tool conventions, see [`docs/research/mcp-skills.md`](../research/mcp-skills.md).

## Subjects

| Subject | Type | Surface | Auth |
|---------|------|---------|------|
| **`trongrid-cli`** (this) | npm CLI | 31 commands across 7 resources (account, block, contract, token, tx, auth, config) | Optional `TRON-PRO-API-KEY` |
| TronGrid MCP | MCP server (official) | 164 tools across 4 namespaces (TronGrid REST, FullNode Wallet, FullNode WalletSolidity, FullNode JSON-RPC) | Same |
| TronScan MCP | MCP server (community) | ~119 tools, flat namespace, 10 doc categories | Optional |

## Per-resource command coverage

Legend: ✓ supported · — not supported · ◐ supported with caveats (see notes)

### Account

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Account info / balance | `account view <addr>` | `getAccount` | `getAccountDetail` |
| Account resources (energy/bandwidth) | `account resources <addr>` | `getAccountResource` | ◐ embedded in detail |
| Token balances list | `account tokens <addr>` | ◐ via separate calls | ✓ |
| TRX/TRC-20 transactions | `account txs <addr>` | `getAccountTransactions` | ✓ |
| TRC-10/20 transfer history | `account transfers <addr>` | ◐ via TRC-20 endpoint | ✓ |
| Internal transactions | `account internals <addr>` | ◐ embedded in tx response | ✓ |
| Stake 2.0 delegations | `account delegations <addr>` | `getDelegatedResource*` | ◐ via stake API |
| Multi-sig permissions | `account permissions <addr>` | ◐ via getAccount.active_permission | — |
| Approvals (TRC-20 allowances) | — (deferred, positioning-blocked) | — | ✓ |

### Block

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Latest block | `block latest [--confirmed]` | `getNowBlock` / `getNowBlockSolidity` | `getLatestBlock` |
| Block by number or hash | `block view <num\|hash>` | `getBlockBy*` | `getBlockDetail` |

### Contract

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Contract info / ABI | `contract view <addr>` | `getContract` | `getContractDetail` |
| Methods list | `contract methods <addr>` | ◐ via ABI | ✓ |
| Event logs | `contract events <addr>` | `getContractEvents` | ✓ |
| Tx history (with `--method` filter) | `contract txs <addr>` | ◐ via account txs | ✓ |
| Internal txs | `contract internals <addr>` | ◐ embedded | ✓ |
| Mirror commands (transfers/tokens/resources/delegations) | ✓ | — (separate calls) | ◐ |
| Call (read) | — (deferred, needs ABI encoder) | `triggerConstantContract` | ✓ |
| Call (write) | — (deferred, write-side phase) | `triggerSmartContract` | — |

### Token

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Token info | `token view <id\|addr\|symbol>` | ◐ via TRC-10/20 endpoints | `getTrc20TokenDetail` |
| Top holders | `token holders <token>` | ✓ | ✓ |
| Transfer history | `token transfers <token>` | ✓ | ✓ |
| Per-account balance | `token balance <token> [addr]` | ◐ via account tokens | ◐ |
| Allowance (read) | `token allowance <token> <owner> <spender>` | ✓ via constant call | — |
| Price feed | — (deferred, needs price API) | — | ✓ |

### Transaction

| Operation | trongrid-cli | TronGrid MCP | TronScan MCP |
|-----------|:------------:|:------------:|:------------:|
| Tx detail | `tx view <hash>` | `getTransactionInfo` / `getTransactionById` | `getTransactionInfo` |
| Broadcast | — (deferred, write-side) | `broadcastTransaction` | — |

### Governance + stats (none — Phase H)

`sr`, `proposal`, `param`, `energy`, `bandwidth`, `network status` commands ship in v0.2.0 (Phase H).

## Endpoint mapping

For audit / scope verification — which TronGrid REST endpoint each `trongrid-cli` command uses.

| Command | Endpoint(s) |
|---------|-------------|
| `account view` | `POST /wallet/getaccount` |
| `account resources` | `POST /wallet/getaccountresource` |
| `account tokens` | `GET /v1/accounts/{addr}` (token list embedded in account object) |
| `account txs` | `GET /v1/accounts/{addr}/transactions` |
| `account transfers` | `GET /v1/accounts/{addr}/transactions/trc20` |
| `account internals` | `GET /v1/accounts/{addr}/transactions` (internal_transactions[] field) |
| `account delegations` | `POST /wallet/getdelegatedresourceaccountindexv2` + `POST /wallet/getdelegatedresourcev2` |
| `account permissions` | `POST /wallet/getaccount` (`.active_permission`, `.owner_permission`) |
| `block latest` | `POST /wallet/getnowblock` (or `POST /walletsolidity/getnowblock` with `--confirmed`) |
| `block view` | `POST /wallet/getblockbynum` / `POST /wallet/getblockbyid` |
| `contract view` | `POST /wallet/getcontract` |
| `contract methods` | derived from `POST /wallet/getcontract` ABI |
| `contract events` | `GET /v1/contracts/{addr}/events` |
| `contract txs` | `GET /v1/accounts/{addr}/transactions` (filtered to contract) |
| `contract internals` | `GET /v1/accounts/{addr}/transactions` (internal_transactions[] field) |
| `contract tokens` | delegates to `account tokens` → `GET /v1/accounts/{addr}` |
| `contract transfers` | delegates to `account transfers` → `GET /v1/accounts/{addr}/transactions/trc20` |
| `contract delegations` | delegates to `account delegations` → same dual-post as above |
| `contract resources` | delegates to `account resources` → `POST /wallet/getaccountresource` |
| `token view` (TRC-20) | `POST /wallet/triggerconstantcontract` (name, symbol, decimals, totalSupply selectors) |
| `token view` (TRC-10) | `POST /wallet/getassetissuebyid` |
| `token holders` | `GET /v1/contracts/{addr}/tokens` |
| `token transfers` | `GET /v1/contracts/{addr}/events` (Transfer event filter applied client-side) |
| `token balance` (TRX) | `GET /v1/accounts/{address}` |
| `token balance` (TRC-20) | `GET /v1/accounts/{address}/trc20/balance` |
| `token allowance` | `POST /wallet/triggerconstantcontract` (`allowance(address,address)` selector) |
| `tx view` | `POST /wallet/gettransactionbyid` + `POST /wallet/gettransactioninfobyid` |

## Strengths and gaps

### `trongrid-cli`

**Strengths:**
- Stable shell-based interface — works with every coding agent, every OS, and every human terminal (no separate MCP protocol layer to install)
- Unit-shape contract: paired raw + major-unit fields (`balance` + `balance_trx`, `value` + `value_major`) prevent decimal-conversion bugs in agent code
- `--json` + `--fields` projection for structured output without `jq` post-processing
- Subject-address muting in transfer lists for visual clarity

**Gaps (vs the MCPs):**
- No write-side support yet (`broadcast`, freeze/unfreeze, vote) — Phase I
- No governance / stats commands yet — Phase H
- No on-chain ABI encoder yet — `contract call` deferred until needed
- No price feed integration — depends on price-feed API choice

### TronGrid MCP

**Strengths:** Largest surface (164 tools); covers FullNode JSON-RPC for direct EVM-compatible queries.

**Gaps:** MCP-only (requires Claude Desktop, Cursor, etc. with MCP support); raw integer fields without paired major-unit conversion; error envelopes leak upstream strings.

### TronScan MCP

**Strengths:** TronScan-specific data (verified token labels, account tags, contract verification status); 10 doc categories with skill-per-task organization.

**Gaps:** MCP-only; sort syntax (`sort: "-field"`) and filter enums (`show=1|2|3|4`) require lookup; no FullNode coverage.

## Update cadence

This doc updates whenever:
- A new `trongrid-cli` command ships (per phase)
- A competitor announces new tools
- A reader reports a stale or wrong row

Last reviewed: 2026-04-17 (Phase G first publish).
