# Architecture

## Ecosystem Position

```
TronGrid REST API / FullNode API
         ↑                ↑
    MCP Server          CLI (this project)
   (mcp.trongrid.io)   (trongrid-cli)
         ↑                ↑
      Skills          Bash / pipe
   (orchestrate        (human + agent
    MCP tools)          direct invocation)
         ↑                ↑
         └── Plugin (future unified entry) ──┘
```

**Principle**: MCP + Skills = structured agent path (tool-calling protocol). CLI + pipe = universal agent path (stdin/stdout protocol). Two parallel paths, no cross-dependency, shared underlying API.

### Q1: Why build a CLI when MCP and Skills already exist?

CLI offers unique advantages that MCP cannot replace — see [Product Design: Why CLI in the Age of AI Agents](./product.md#why-cli-in-the-age-of-ai-agents) for the full comparison. In summary:

- **Universality**: CLI works with every agent that has shell access (Claude Code, Codex, Gemini CLI, Cursor, Windsurf, OpenClaw) — zero config. MCP requires per-agent setup.
- **Token efficiency**: `--json --fields` returns only requested data with no protocol overhead. MCP tool definitions consume context tokens on every invocation.
- **Hot reloading**: `npm update -g` takes effect immediately within a session. MCP servers require reconnection.
- **Composability**: CLI output pipes to `jq`, `grep`, other CLIs, or back into the agent. MCP output is trapped in JSON-RPC.
- **Dual-use**: Humans and agents share the same tool. MCP is agent-only.

CLI and MCP serve different strengths. CLI is the higher-frequency path for agents in practice — every agent session has a shell, and `--json` output is consumed directly. MCP excels at structured, multi-step workflows with capability discovery.

### Q2: Should Skills use MCP only, or both MCP and CLI?

**Decision**: Skills use MCP tools exclusively. CLI is independent.

- **Skills → MCP → API**: Skills orchestrate MCP tool calls, never bypass MCP to call API directly. MCP handles auth, validation, error handling once. Skills stay simple — they only concern themselves with tool names and orchestration logic.
- **CLI → API**: CLI calls TronGrid API directly. Independent of MCP/Skills. Its agent value comes through `--json` + Bash pipe, not through Skills.

**Rationale**: If Skills used both MCP and CLI, they would need to handle two invocation methods, increasing complexity for no benefit. Each surface has one responsibility:

| Surface | Responsibility | Invocation |
|---------|---------------|------------|
| CLI | Human + agent terminal access | Bash / pipe / `--json` |
| MCP | Structured tool-calling for agents | JSON-RPC protocol |
| Skills | Workflow orchestration | Composes MCP tools |

**Evidence**: This mirrors GitHub's architecture — `gh` CLI and `github-mcp-server` are independent projects, both calling GitHub's API directly. Claude Code uses `gh` via Bash, not through MCP. The two surfaces never cross.

## Tech Stack Decisions

### Language: TypeScript

**Decision**: TypeScript, targeting Node.js 22+ (current LTS).

**Quantitative basis** — user environment coverage:

| Install Channel | User Coverage | Notes |
|-----------------|--------------|-------|
| npm/npx | ~75% | TronWeb users already have Node.js |
| Homebrew | ~43% | macOS users (Phase 3) |
| Binary download | ~100% | Universal fallback (Phase 3) |

TronGrid's user base clusters around JavaScript (TronWeb, 11.5K dependent repos). npm/npx is the zero-friction path for the majority.

For a visual, interactive analysis of how programming language choice affects distribution coverage across operating systems, see [**cli-coverage**](https://cli-coverage.vercel.app) — a tool built during this project's design phase to quantify the language × channel × OS tradeoff.

**Industry comparison** (CLI tools with similar scope):

| Tool | Language | Framework | Scenario |
|------|----------|-----------|----------|
| Vue CLI | TypeScript | commander | Framework CLI |
| Firebase CLI | JavaScript | commander | Cloud service CLI |
| Wrangler (Cloudflare) | TypeScript | yargs | Cloud service CLI |
| Vercel CLI | TypeScript | arg | Platform CLI |
| gh (GitHub) | Go | cobra | Platform CLI (cross-platform binary) |

Cloud service CLIs predominantly use TypeScript + commander/yargs.

Additional evidence: Anthropic chose TypeScript for Claude Code itself — "90% of Claude Code is written with Claude Code" — leveraging the model's own language proficiency. This is the strongest endorsement for TS as an AI-agent-friendly CLI language ([source](https://mer.vin/2025/12/ai-cli-tools-comparison-why-openai-switched-to-rust-while-claude-code-stays-with-typescript/)).

### CLI Framework: commander.js

**Decision**: commander.js (27K stars).

**Rationale**:
- Industry standard for API-wrapping CLIs (Vue CLI, Firebase CLI use it)
- Proven in similar-scale projects (e.g., [ding-bot-cli](https://github.com/qiqiboy/ding-bot-cli))
- Native support for subcommands, `--json` flag, help generation
- Right weight for ~50 commands — not too heavy (oclif), not too bare (parseArgs)
- Performance: 18-25ms startup, zero dependencies ([source](https://www.grizzlypeaksoftware.com/library/cli-framework-comparison-commander-vs-yargs-vs-oclif-utxlf9v9))

**Alternatives considered**:

| Framework | Stars | Verdict | Why Not |
|-----------|-------|---------|---------|
| oclif | 9K | Too heavy | Plugin system overkill for 50 commands |
| yargs | 11K | Viable | API more complex, no clear advantage |
| citty | 1K | Too new | Thin ecosystem, limited references |
| Node.js parseArgs | built-in | Too bare | Manual work for subcommands, help, etc. |

### Build & Distribution

| Aspect | Choice | Notes |
|--------|--------|-------|
| Dev runtime | Bun | `bun install`, `bun run`, `bun test` |
| Build | tsc | Emit JS to `dist/` |
| Distribution | npm registry | `npm publish`; users run `npx trongrid` |
| User runtime | Node.js 22+ | Current LTS; enables built-in `styleText` (no chalk dep) |
| Linting | Biome | Replaces Prettier + ESLint |
| Testing | Bun test | Built-in, zero deps, Jest-compatible API |
| CI/CD | GitHub Actions | lint → test → publish on tag |

**Why tsc, not `bun build`?** Bun serves as the dev runtime (fast installs, test runner, script runner), but the build step uses `tsc` to emit standard JavaScript. `bun build` either bundles into a single file (loses module structure, harder to debug) or compiles into a standalone binary (~50MB, includes Bun runtime — not suitable for npm distribution). `tsc` does 1:1 transpilation (`src/commands/block/latest.ts` → `dist/commands/block/latest.js`), producing standard Node.js-compatible output that any user can run with `node`. This is the same approach used by Vue CLI, Firebase CLI, and most npm-distributed CLIs.

**Why Biome, not ESLint + Prettier?** The traditional setup requires two tools with separate configs (`.eslintrc` + `.prettierrc`) plus plugins to resolve conflicts between them. Biome is a single Rust-based tool that handles both linting and formatting with one config file (`biome.json`). It is 10-40x faster and eliminates the `@typescript-eslint` plugin dependency. For a new TypeScript project, there is no reason to start with the two-tool setup.

**Why Bun test, not vitest or Jest?** Bun is already the dev runtime for this project, and its built-in test runner (`bun test`) supports `describe`/`it`/`expect`, mocking, and native TypeScript — everything a CLI tool needs. Adding vitest would be an extra dependency for capabilities this project doesn't use (coverage UI, snapshot testing). Jest requires ESM/TypeScript transform configuration. If advanced coverage tooling is needed later, vitest is a drop-in migration (both use Jest-compatible API).

**Why Node.js 22+, not 18+?** Node 18 is EOL (April 2025). Node 20 maintenance LTS ends April 2026. Node 22 is the current Active LTS (until October 2027). Targeting 22+ lets us use built-in `node:util` `styleText` for terminal colors instead of depending on chalk — reducing production deps from 2 to 1. `styleText` supports all we need (red, green, dim, bold) and respects `NO_COLOR` automatically.

### Why not chalk?

Node.js 22+ includes both `fetch` (HTTP) and `styleText` (terminal colors) as built-in APIs. No need for axios, node-fetch, or chalk.

### Dependencies (planned)

| Package | Purpose | Why |
|---------|---------|-----|
| commander | CLI framework | Industry standard, 18-25ms startup |

Total production deps: **1** (commander). No HTTP library (native fetch), no color library (native `styleText`), no test framework (Bun test built-in).

**Why not chalk?** chalk (41K stars) is the de facto standard for terminal colors, and most CLI tutorials recommend it. However, Node.js 22+ provides `node:util` `styleText` with equivalent functionality for our needs (color, bold, dim) and automatic `NO_COLOR` support. Since we target Node 22+, chalk would be a redundant dependency. If `styleText` proves insufficient for advanced formatting later, chalk can be added as a one-line install.

## Command Structure

### Pattern: resource → action (gh style)

```bash
trongrid <resource> <action> [target] [flags]
```

**Evidence** — industry patterns:

| Tool | Pattern | Our match |
|------|---------|-----------|
| gh | `gh repo view`, `gh pr list` | resource → action |
| gcloud | `gcloud compute instances list` | service → resource → action |
| aws | `aws s3 ls`, `aws ec2 describe-instances` | service → action |
| kubectl | `kubectl get pods` | action → resource |

API service CLIs (gh, gcloud, aws) use resource-first. We follow gh's 2-level pattern.

### Positional argument ordering

**Decision**: Identifier (address / hash / id) is the **trailing positional**. `trongrid account tokens <address>`, not `trongrid account <address> tokens`.

**Alternatives considered**:

| Option | Shape | Verdict |
|--------|-------|---------|
| A — target-first | `account <addr> tokens` | Reads more as possessive ("X's tokens"), but fails discoverability and default-address. |
| **B — action-first (chosen)** | `account tokens <addr>` | Matches git / kubectl / gh / aws / solana convention. |
| C — flag-based | `account tokens --address <addr>` | Explicit, but verbose for a read-heavy CLI. |

**Why B wins**:

1. **Discoverability** — `trongrid account --help` lists all aspects. Option A has no clean answer for what to show before an address is supplied.
2. **Default address** — Option B lets `<address>` become optional when `default_address` is configured, so `trongrid account tokens` naturally uses the default. Option A introduces parsing ambiguity when the address is omitted.
3. **Ecosystem consistency** — all major CLIs keep identifier trailing; user muscle memory matches.
4. **Uniform scaling** — address-less commands (`chain parameters`, `block latest`) share the same `<noun> <verb> [args]` shape as address-taking ones. Option A creates two structural classes.
5. **Commander.js fit** — Option B is idiomatic; Option A requires parameterized parent-command routing.
6. **Future writes** — `account transfer <from> <to> <amount>` is unambiguous under B; Option A's `account <addr> transfer <to> <amt>` leaves the address role (source? recipient?) unclear.

**What's sacrificed**: Option A reads slightly more naturally as a possessive ("X's tokens" / "TR... 的代币"). This loss is recovered through three compensating mechanisms — see §Coupled decisions below.

**Full analysis**: Four-tool competitive evidence base, 10-dimension quantitative scoring (A 48 / B 85 / C 77), and linguistic discussion in [`competitors.md`](./competitors.md#decision-1-command-argument-ordering).

### Coupled decisions

Three mechanisms preserve the linguistic naturalness that Option A would have provided, without sacrificing Option B's ecosystem fit:

| Mechanism | Effect | Phase |
|-----------|--------|-------|
| **Default address** (`trongrid config set default_address <addr>`) | Makes `<address>` positional optional across `account` / `tx` / related commands. Frequent users rarely retype the address. | A+ (committed) |
| **Smart identifier routing** | Bare identifier without subcommand — `trongrid TR7...` / `trongrid 0xabc...` / `trongrid 12345` — auto-routes to `account view` / `tx view` / `block view`. Gives tronscan-URL shortcut without changing the core grammar. | B (polish) |
| **Documentation prose framing** | Help text and docs phrase commands possessively ("show the tokens of `<address>`") even though the grammar is action-first. Naturalness lives in prose, not syntax. | B (writing guideline) |

### Naming convention: `view` for single-item lookup

| Action | Verb | Evidence |
|--------|------|---------|
| Single item | `view` | gh uses `view` (not `get` or `info`) |
| List items | `list` | Universal across all CLIs |
| Specific data | Domain verb | `decode`, `estimate`, `calc`, etc. |

### Entity hierarchy

Top-level resources are **blockchain entities with independent attributes**. Account-level views of the same concept go under `account`.

| Resource | Global commands | Also under account? |
|----------|----------------|-------------------|
| energy | price, calc | account resources |
| bandwidth | price | account resources |
| token | view, holders, transfers | account tokens |
| tx | view, broadcast, pending | account txs |

## Auth & Config

### Auth hierarchy

```
Priority 1: System keyring (from "trongrid auth login")
Priority 2: TRONGRID_API_KEY environment variable
Priority 3: No auth (3 QPS, degraded)
```

**Rate limit context** (current as of early 2026):
- No key: 3 QPS (reduced from 10 to encourage adoption)
- Free key: 15 QPS/key × 3 keys per user
- Custom plan: higher QPS, free, requires application and approval

**Auth login**: v1 ships with manual key entry (user pastes API key from TronGrid dashboard). Browser-based OAuth/device flow is a P0 follow-up — every major CLI treats "one command, browser opens, done" as the default onboarding:

- `gh auth login` — opens browser, OAuth flow, token stored automatically
- `vercel login` — opens browser, returns token
- `claude` — browser login first, API key as fallback (`ANTHROPIC_API_KEY`)
- `gcloud auth login` — opens browser, Google OAuth

Browser-based login is the single biggest UX differentiator between "developer tool" and "developer-friendly tool." Manual key entry is acceptable for v1 but the gap is visible. This would require TronGrid to offer an OAuth endpoint or device authorization grant.

### Config

Location: `~/.config/trongrid/config.json`

```json
{
  "network": "mainnet",
  "output": "human"
}
```

Networks: mainnet (default), shasta, nile. Override per-command with `--network`.

## Output Design

| Aspect | Human Mode (default) | JSON Mode (`--json`) |
|--------|---------------------|---------------------|
| Format | Aligned key-value, tables, colors | Raw JSON object |
| Units | TRX (human-readable) | Both sun + TRX (see below) |
| Colors | `styleText` (respects `NO_COLOR`) | None |
| Errors | Friendly message + hint + upstream detail | `{"error": "...", "code": "...", "detail": "...", "upstream": {...}}` |
| Pagination | `--limit` + summary | Full page + `next_cursor` |

**Unit handling**: This is more nuanced than "human gets TRX, machine gets sun." The core problem: raw sun values without metadata cause AI agents to misinterpret amounts by 6 orders of magnitude (e.g., 35.2 TRX reported as 35.2 million TRX). This affects 20+ read tools and 6+ write tools with resource safety risk.

CLI follows the same unit convention used in the TronGrid MCP server. The naming principle: **use the explicit unit name when possible; fall back to `_major` only when the unit is variable.**

"Major" comes from monetary terminology — major unit (TRX, USD) vs minor unit (sun, cent). The suffix was chosen over alternatives like `_formatted` (implies string beautification, not unit conversion), `_normalized` (statistics ambiguity), and `_standard` (overloaded in tech contexts).

**A. TRX amounts** — raw sun preserved, `_trx` appended:

```json
{
  "balance": 35216519,
  "balance_unit": "sun",
  "balance_trx": "35.216519"
}
```

The major unit is always TRX, so the suffix is explicit: `_trx`. No ambiguity — the reader knows the unit from the field name alone.

**B. TRC-20 token amounts** — raw integer preserved, decimals + `_major` appended:

```json
{
  "balance": "38927318000000000",
  "token_decimals": 6,
  "balance_major": "38927318000.0"
}
```

Here `_major` is a pragmatic fallback, not a preference. The ideal would be `_usdt` or `_usdc`, but token symbols are unreliable as field name suffixes — they can contain Unicode characters (Chinese token names), special characters, or even collide with existing field names. `_major` is the stable, universal suffix that works for any token.

**C. Other units** — explicit unit annotation in field names to prevent ambiguity:
- Single-unit fields: `marketcap_usd` (not `marketcap`)
- Multi-unit fields: `price_usd`, `price_trx` side by side

**D. Write operations** (transaction construction): raw sun/integer values are the required input format. Field names stay unchanged for FullNode compatibility. Unit guidance provided in help text and command descriptions only.

| Scenario | Human mode | JSON mode |
|----------|-----------|-----------|
| TRX amounts | `35.22 TRX` | `balance` (sun) + `balance_trx` + `balance_unit` |
| TRC-20 tokens | `38,927.318 USDT` | `balance` (raw) + `balance_major` + `token_decimals` |
| Prices | `$0.067` | `price_usd` + `price_trx` |
| Transaction input | N/A | `amount` in sun (raw, FullNode-compatible) |

Human mode shows only the major-unit value. JSON mode always includes both raw and major values with explicit unit metadata — agents never need to guess or convert.

**`--json` is a contract**: Once shipped, field names don't change. Human output can evolve freely.

**Error layering**: Friendly message for context, upstream API error for detail. `--verbose` for full trace when needed.

## Project Structure

```
src/
├── index.ts              # Entry, commander program setup
├── commands/
│   ├── account/          # trongrid account <action>
│   │   ├── view.ts
│   │   ├── tokens.ts
│   │   ├── txs.ts
│   │   ├── transfers.ts
│   │   ├── resources.ts
│   │   ├── permissions.ts
│   │   └── delegations.ts
│   ├── tx/               # trongrid tx <action>
│   ├── block/            # trongrid block <action>
│   ├── token/            # trongrid token <action>
│   ├── contract/         # trongrid contract <action>
│   ├── sr/               # trongrid sr <action>
│   ├── proposal/         # trongrid proposal <action>
│   ├── param/            # trongrid param <action>
│   ├── energy/           # trongrid energy <action>
│   ├── bandwidth/        # trongrid bandwidth <action>
│   ├── network/          # trongrid network <action>
│   ├── auth/             # trongrid auth <action>
│   └── config/           # trongrid config <action>
├── api/
│   ├── client.ts         # HTTP client (native fetch), auth injection
│   ├── endpoints.ts      # Endpoint URL definitions
│   └── types.ts          # Response type definitions
├── output/
│   ├── formatter.ts      # Human-readable formatting
│   └── json.ts           # --json output handler
├── auth/
│   ├── store.ts          # Keyring/config storage
│   └── login.ts          # Auth flow
└── utils/
    ├── config.ts         # Config file management
    └── network.ts        # Network selection
```

One folder per resource, one file per action. `api/client.ts` is the single HTTP exit point.
