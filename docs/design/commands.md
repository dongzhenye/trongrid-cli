# Commands — Design and Reference

This document combines the design decisions behind `trongrid-cli`'s command grammar with the full command reference. The design section is the *why*; the reference section is the *what*. Both live in one doc so the rationale cannot drift away from the shipped surface.

Four-tool competitive research and quantitative scoring that backs the design decisions lives separately in [`competitors.md`](./competitors.md).

---

## Part I — Design

### 1. Top-level grammar

```bash
trongrid <resource> <action> [target] [flags]
```

Two-level noun-verb structure, following `gh`'s pattern.

**Industry evidence**:

| Tool | Pattern | Notes |
|------|---------|-------|
| gh | `gh repo view`, `gh pr list` | resource → action |
| gcloud | `gcloud compute instances list` | service → resource → action |
| aws | `aws s3 ls`, `aws ec2 describe-instances` | service → action |
| kubectl | `kubectl get pods` | action → resource |

API-service CLIs (gh, gcloud, aws) use resource-first. We follow `gh`'s two-level pattern — structured enough to organize the surface, shallow enough to avoid gcloud-style nesting fatigue.

### 2. Positional argument ordering — action-first (Option B)

**Decision**: identifier (address / hash / id) is the **trailing positional**.

- ✅ `trongrid account tokens <address>`
- ❌ `trongrid account <address> tokens`

**Alternatives considered**:

| Option | Shape | Verdict |
|--------|-------|---------|
| A — target-first | `account <addr> tokens` | Reads more naturally as a possessive ("X's tokens"), but fails on discoverability and default-address. |
| **B — action-first (chosen)** | `account tokens <addr>` | Matches git / kubectl / gh / aws / solana / aptos convention. |
| C — flag-based | `account tokens --address <addr>` | Explicit, but verbose for a read-heavy CLI. |

**Why B wins** (six reasons):

1. **Discoverability.** `trongrid account --help` lists all aspects cleanly. Option A has no clean answer for what to show before an address is supplied.
2. **Default address.** Option B lets `<address>` become optional when `default_address` is configured — `trongrid account tokens` naturally uses the default. Option A introduces parsing ambiguity when the address is omitted.
3. **Ecosystem consistency.** All major CLIs keep the identifier trailing; user muscle memory transfers.
4. **Uniform scaling.** Address-less commands (`chain parameters`, `block latest`) share the same `<noun> <verb> [args]` shape as address-taking ones. Option A would create two structural classes.
5. **Commander.js fit.** Option B is idiomatic for commander.js; Option A requires parameterized parent-command routing, which is a fight against the library.
6. **Future writes.** `account transfer <from> <to> <amount>` is unambiguous under B; Option A's `account <addr> transfer <to> <amt>` leaves the address role (source? recipient?) unclear.

**Research backing**: four-tool competitive evidence base, 10-dimension quantitative scoring (A: 48 / B: 85 / C: 77), and linguistic discussion in [`competitors.md` §Decision 1](./competitors.md#decision-1-command-argument-ordering).

**What's sacrificed**: Option A reads slightly more naturally as a possessive ("X's tokens"). This loss is recovered through three compensating mechanisms — see §3.

### 3. Coupled decisions — three compensating mechanisms

The linguistic naturalness that Option A would have provided is recovered through three other layers of the tool, rather than through syntax:

| Mechanism | Effect | Phase |
|-----------|--------|-------|
| **Default address** (`trongrid config set default_address <addr>`) | Makes `<address>` optional across `account` / `tx` / related commands. Frequent users rarely retype the address. | A+ (shipped) |
| **Smart identifier routing** | Bare identifier without a subcommand — `trongrid TR7...` / `trongrid 0xabc...` / `trongrid 12345` — auto-routes to `account view` / `tx view` / `block view`. Gives a tronscan-URL shortcut without changing the core grammar. | B (polish) |
| **Documentation prose framing** | Help text and docs phrase commands possessively ("show the tokens of `<address>`") even though the grammar is action-first. Naturalness lives in prose, not syntax. | B (writing guideline) |

### 4. Naming convention — `view` for single-item lookup

| Action | Verb | Evidence |
|--------|------|---------|
| Single item | `view` | gh uses `view` (not `get` or `info`) |
| List items | `list` | Universal across all CLIs |
| Specific data | Domain verb | `decode`, `estimate`, `calc`, etc. |

### 5. Entity hierarchy

Top-level resources are **blockchain entities with independent attributes**. Account-scoped views of the same concept go under `account`.

| Resource | Global commands | Also under account? |
|----------|----------------|-------------------|
| energy | `price`, `calc` | `account resources` |
| bandwidth | `price` | `account resources` |
| token | `view`, `holders`, `transfers` | `account tokens` |
| tx | `view`, `broadcast`, `pending` | `account txs` |

---

## Part II — Reference

### Global flags

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--json` | `-j` | Output as JSON | false |
| `--network` | `-n` | Network: mainnet, shasta, nile | mainnet |
| `--no-color` | — | Disable colored output | false |
| `--verbose` | `-v` | Show upstream API details in errors | false |
| `--limit` | `-l` | Max items for list commands | 20 |
| `--fields` | `-f` | Select output fields (JSON mode) | all |
| `--help` | `-h` | Show help | — |
| `--version` | `-V` | Show version | — |

### account — Address queries

```bash
trongrid account view [address]          # Balance, type, activation status
trongrid account tokens [address]        # All TRC20/TRC10 balances
trongrid account txs <address>           # Transaction history (all types)
trongrid account transfers <address>     # Token transfer history
trongrid account resources [address]     # Energy, bandwidth, staking state
trongrid account delegations <address>   # Resources delegated to/from
trongrid account permissions <address>   # Multi-sig, owner/active keys
```

Commands shown with `[address]` accept an optional TRON address. When omitted, the address falls back to `default_address` from config — set it once with `trongrid config set default_address <addr>`. Remaining `<address>` entries will gain the same fallback as they are implemented in Phase B.

### tx — Transaction queries

```bash
trongrid tx view <hash>                  # Full details, status, fees
trongrid tx decode <hash>                # Decode contract call (method, params, events)
trongrid tx internals <hash>             # Internal transactions
trongrid tx transfers <hash>             # Token Transfer events triggered by this tx
trongrid tx broadcast <hex|json>         # Broadcast a signed transaction
trongrid tx pending                      # Pending pool size and transactions
```

### block — Block queries

```bash
trongrid block latest                    # Current chain head
trongrid block view <number|hash>        # Block details + producer
trongrid block stats <number>            # Fee, energy, bandwidth statistics
trongrid block range <start> <end>       # Block range query
trongrid block events <number>           # Events emitted in block
```

### token — Token queries

```bash
trongrid token view <address|symbol>     # Metadata: name, symbol, decimals, supply
trongrid token holders <address|symbol>  # Top holders + distribution
trongrid token transfers <address|symbol>  # Transfer history of this token
trongrid token balance <token> <address> # Check specific token balance
trongrid token allowance <token> <owner> <spender>  # Approval check
```

**Token symbol resolution**: verified token symbols (e.g., `USDT`, `USDC`, `BTT`) can be used in place of contract addresses. Resolution uses a curated static map of ~20 tokens sourced from TronScan's verified token list. Unknown symbols are rejected with a clear error prompting the user to provide the contract address directly. This prevents phishing/scam tokens from being resolved — only manually verified entries are supported.

### contract — Smart contract queries

```bash
trongrid contract view <address>         # ABI, bytecode, runtime info
trongrid contract call <address> <method> [args]  # Read-only call
trongrid contract estimate <address> <method> [args]  # Energy estimation
trongrid contract events <address>       # Recent event logs
trongrid contract history <address>      # Transaction history
```

### sr — Super Representatives

```bash
trongrid sr list                         # All SRs ranked by votes
trongrid sr view <address>               # Details: rewards, commission, blocks
```

### proposal — Governance proposals

```bash
trongrid proposal list                   # Active proposals
trongrid proposal view <id>              # Proposal details + voting status
```

### param — Chain parameters

```bash
trongrid param list                      # All chain parameters
trongrid param view <name>               # Single parameter details
```

### energy — Energy resource (network-level)

```bash
trongrid energy price                    # Current + historical energy pricing
trongrid energy calc <amount>            # Calculate TRX needed for target energy
```

### bandwidth — Bandwidth resource (network-level)

```bash
trongrid bandwidth price                 # Current + historical bandwidth pricing
```

### network — Node and chain status

```bash
trongrid network status                  # Node health, sync status, peers
trongrid network maintenance             # Next maintenance time
trongrid network burn                    # Total TRX burned
```

### auth — Authentication

```bash
trongrid auth login                      # Authenticate (manual key entry; OAuth planned)
trongrid auth logout                     # Remove stored credentials
trongrid auth status                     # Show current auth state
```

### config — Configuration

```bash
trongrid config set <key> <value>        # Set config value
trongrid config get <key>                # Get config value
trongrid config list                     # Show all config
```

---

## API Mapping

Each command maps to one or more TronGrid API endpoints. The full mapping with gap analysis is maintained in [`product.md`](../product.md#user-scenarios--gap-analysis).

## Future commands (tracked gaps)

These commands represent identified user needs without current API support. They will be implemented if and when such endpoints become available.

| Command | Need | Blocked by |
|---------|------|-----------|
| `token price <address>` | Token price in TRX/USD | No price feed API |
| `account tags <address>` | Address labels (exchange, scam) | No tagging API |
| `contract creator <address>` | Creator address + creation tx | No direct endpoint |

Additional scenarios per resource will be expanded iteratively. Design principle from [`product.md`](../product.md): *"commands that should exist but don't are documented, not dropped."*
