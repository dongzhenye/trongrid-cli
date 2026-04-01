# Product Design

## Background

TronGrid is the primary API gateway for the TRON blockchain, serving DApp developers, wallet providers, data analysts, and AI agents. Despite having a comprehensive REST API with 160+ endpoints, TronGrid lacks a dedicated CLI — users must rely on curl, Postman, or custom scripts to interact with the API.

**trongrid-cli** is the first CLI tool built specifically for TronGrid. It provides a human-friendly terminal interface and structured JSON output for AI agents, following the same dual-mode pattern proven by [`gh`](https://github.com/cli/cli) (GitHub CLI).

### Why CLI in the Age of AI Agents

MCP (Model Context Protocol) servers and Skills provide structured agent interfaces, but CLI tools offer unique advantages that make them essential — not redundant — alongside MCP:

| Advantage | CLI | MCP |
|-----------|-----|-----|
| **Universality** | Works with ANY agent — Claude Code, Codex, Gemini CLI, Cursor, Windsurf, OpenClaw — via Bash. Zero config. | Requires per-agent configuration and server setup |
| **Token efficiency** | `--json --fields` returns only requested data. No protocol overhead. | Tool definitions (name, description, schema) consume context tokens on every invocation |
| **Hot reloading** | `npm update -g` takes effect on next Bash call within the same session | Requires server reconnection / session restart |
| **Composability** | Unix pipe: `trongrid account view TXxx --json \| jq .balance` | Output trapped inside JSON-RPC protocol layer |
| **Dual-use** | Humans and agents share the same tool, same docs, same maintenance | Agent-only — no human can invoke MCP directly |
| **No protocol overhead** | Spawn process, read stdout, done | JSON-RPC connection, capability negotiation, structured invocations |

> "Ship a CLI with `--output json` as step 1. Expose MCP surface as step 7."
> — Justin Poehnelt, Senior DevRel at Google ([source](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/))

### CLI and MCP: Parallel Paths, Not Layers

CLI and MCP are **parallel paths to the same API**, not layers stacked on top of each other. Neither depends on the other. This is a deliberate product decision, not just an architecture choice:

- **For users**: Pick the interface that fits your workflow. Terminal user? CLI. Building an agent with tool-calling? MCP. Writing Skills that orchestrate multi-step analysis? MCP + Skills. No lock-in, no forced migration.
- **For agents**: CLI is the higher-frequency path in practice — every agent session has a shell, and `--json` output is consumed directly with zero setup. MCP requires configuration but offers richer capability discovery for complex workflows.
- **For maintainability**: Each surface has a single responsibility. CLI handles human + agent terminal access. MCP handles structured tool-calling. Skills orchestrate MCP tools into workflows. No cross-dependency means each can evolve independently.

This mirrors GitHub's approach: `gh` CLI and `github-mcp-server` are independent projects, both calling GitHub's API directly. Claude Code uses `gh` via Bash, not through MCP. See [Architecture](./architecture.md#ecosystem-position) for the full system diagram.

### References

- [You Need to Rewrite Your CLI for AI Agents](https://justin.poehnelt.com/posts/rewrite-your-cli-for-ai-agents/) — Justin Poehnelt (Google), 7 design principles for agent-friendly CLIs
- [CLI Guidelines](https://clig.dev/) — Authoritative CLI design reference (human-first, composability, consistency)
- [Building Great CLIs in 2025: Node.js vs Go vs Rust](https://medium.com/@no-non-sense-guy/building-great-clis-in-2025-node-js-vs-go-vs-rust-e8e4bf7ee10e) — Decision framework for CLI language selection
- [AI CLI Tools Comparison](https://mer.vin/2025/12/ai-cli-tools-comparison-why-openai-switched-to-rust-while-claude-code-stays-with-typescript/) — Why Anthropic chose TypeScript for Claude Code

## Target Users

| User Type | Scenario | Environment |
|-----------|----------|-------------|
| TRON DApp developers | Debug contracts, query on-chain data | macOS/Linux, Node.js (TronWeb) |
| Token/DeFi analysts | Track holdings, monitor transfers | macOS/Linux, Node.js |
| AI Agent users | Invoke via pipe in coding assistants | Host environment |
| DevOps/CI | Monitoring scripts, automation | Linux server |

**AI agents with shell access** (non-exhaustive):

| Agent | Shell Tool | How CLI is Used |
|-------|-----------|-----------------|
| Claude Code | Bash tool | `trongrid ... --json` via pipe |
| Codex CLI | Shell execution | Direct command invocation |
| Gemini CLI | Shell tool | Direct command invocation |
| Cursor | Terminal | Bash commands in agent mode |
| Windsurf | Terminal | Bash commands in agent mode |
| OpenClaw | Shell plugin | Bash commands via plugin |

TronGrid users cluster around **JavaScript/Node.js** (TronWeb is the dominant SDK, 11.5K repos depend on it) and **Java** (Tronj). ~75% of users already have Node.js, making npm the zero-friction distribution path.

## Design Philosophy

### Needs-Driven, Not API-Driven

CLI commands are designed from **user scenarios forward**, not by wrapping existing API endpoints backward. The existing API has organic growth over years — commands that "should exist but don't" are documented as feature requests, not silently dropped.

Principles:
1. **Missing** → document as feature request
2. **Inadequate** → note desired parameter/filter improvements
3. **Unused** → leave idle, don't force into CLI
4. Maintain a living gap analysis for continuous iteration

### Human-First, Agent-Ready

Default output is human-readable (formatted, colored, unit-converted). `--json` flag for structured output at zero marginal cost for agents. This follows `gh` CLI's proven model — Claude Code uses `gh` directly via Bash with `--json`, not through MCP.

### Entity-Driven Command Structure

Top-level commands map to **blockchain entities** that users already know as nouns. The test: "Does this concept have independent attributes, or is it just a relationship/action on another entity?"

A concept can exist at **two levels simultaneously** — global (top-level) and per-account (under `account`) — if it has both network-wide and account-specific attributes. Example: `energy price` (global) and `account resources` (per-account energy).

## User Scenarios & Gap Analysis

### Account

| # | User Need | Command | API | Status |
|---|-----------|---------|-----|--------|
| 1 | Check TRX balance and activation | `account view` | getAccount + getAccountInfo | Ready |
| 2 | List all token balances | `account tokens` | getTrc20Balance + getAssetIssueByAccount | Ready |
| 3 | Transaction history (all types) | `account txs` | getAccountTransactions | Ready |
| 4 | Token transfer history | `account transfers` | getAccountTrc20Transactions | Ready |
| 5 | Energy/bandwidth/staking status | `account resources` | getAccountResource + getAccountNet | Ready |
| 6 | Multi-sig permissions | `account permissions` | getAccount (permission fields) | Ready |
| 7 | Resource delegations to/from | `account delegations` | getDelegatedResourceV2 + index | Ready |
| 8 | Address tags (exchange, scam) | — | **No API** | Gap: needs off-chain DB |

### Transaction

| # | User Need | Command | API | Status |
|---|-----------|---------|-----|--------|
| 1 | Lookup by hash | `tx view` | getTransactionById + getTransactionInfoById | Ready |
| 2 | Decode contract call | `tx decode` | getTransactionById + ABI | Client-side |
| 3 | Internal transactions | `tx internals` | getInternalTransactionsByTxId | Ready |
| 4 | Token transfers triggered | `tx transfers` | getEventsByTransactionId | Ready |
| 5 | Broadcast signed tx | `tx broadcast` | broadcastTransaction / broadcastHex | Ready |
| 6 | Pending pool status | `tx pending` | getPendingSize + getTransactionListFromPending | Ready |

### Block

| # | User Need | Command | API | Status |
|---|-----------|---------|-----|--------|
| 1 | Latest block | `block latest` | getNowBlock | Ready |
| 2 | Block by number/hash | `block view` | getBlockByNum / getBlockById | Ready |
| 3 | Block statistics | `block stats` | getBlockStatistics | Ready |
| 4 | Block range query | `block range` | getBlockByLimitNext | Ready |
| 5 | Events in block | `block events` | getEventsByBlockNumber | Ready |

### Token

| # | User Need | Command | API | Status |
|---|-----------|---------|-----|--------|
| 1 | Token metadata | `token view` | getTrc20Info / getAssetIssueById | Ready |
| 2 | Top holders | `token holders` | getTrc20TokenHolders | Ready |
| 3 | Transfer history | `token transfers` | getAccountTrc20Transactions | Needs filter |
| 4 | Balance check | `token balance` | getTrc20Balance | Ready |
| 5 | Approval/allowance | `token allowance` | triggerConstantContract | Client-side |
| 6 | Token price | — | **No API** | Gap: needs oracle/DEX |

### Contract

| # | User Need | Command | API | Status |
|---|-----------|---------|-----|--------|
| 1 | ABI + bytecode | `contract view` | getContract / getContractInfo | Ready |
| 2 | Read-only call | `contract call` | triggerConstantContract | Ready |
| 3 | Energy estimation | `contract estimate` | estimateEnergy | Ready |
| 4 | Event logs | `contract events` | getEventsByContractAddress | Ready |
| 5 | Transaction history | `contract history` | getContractTransactions | Ready |
| 6 | Creator + creation tx | — | **No API** | Gap: traceable but no direct endpoint |

### SR, Proposal, Param, Energy, Bandwidth, Network

| Resource | Commands | All Ready? |
|----------|----------|-----------|
| `sr` | list, view | Yes |
| `proposal` | list, view | Yes |
| `param` | list, view | Yes |
| `energy` | price, calc | price=ready, calc=client-side |
| `bandwidth` | price | Yes |
| `network` | status, maintenance, burn | Yes |

### Gap Summary

| Gap | Type | Priority | Notes |
|-----|------|----------|-------|
| Token price feed | New API | P1 | High-frequency need; integrate DEX/oracle |
| Address tagging | New API | P2 | Requires off-chain database |
| Contract creator | New API | P2 | On-chain traceable but no direct endpoint |
| Token transfers by contract | Filter enhancement | P1 | Existing API filters by address, not contract |
| OAuth/device flow login | Auth enhancement | P0 | Post-v1 priority |

These gaps are tracked for continuous iteration.
