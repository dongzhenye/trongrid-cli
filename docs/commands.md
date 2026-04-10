# Command Reference

## Global Flags

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

## Commands

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

**Token symbol resolution**: Verified token symbols (e.g., `USDT`, `USDC`, `BTT`) can be used in place of contract addresses. Resolution uses a curated static map of ~20 tokens sourced from TronScan's verified token list. Unknown symbols are rejected with a clear error prompting the user to provide the contract address directly. This prevents phishing/scam tokens from being resolved — only manually verified entries are supported.

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

## API Mapping

Each command maps to one or more TronGrid API endpoints. The full mapping with gap analysis is maintained in [product.md](./product.md#user-scenarios--gap-analysis).

## Future Commands (Tracked Gaps)

These commands represent identified user needs without current API support. They could be implemented if and when such endpoints become available.

| Command | Need | Blocked By |
|---------|------|-----------|
| `token price <address>` | Token price in TRX/USD | No price feed API |
| `account tags <address>` | Address labels (exchange, scam) | No tagging API |
| `contract creator <address>` | Creator address + creation tx | No direct endpoint |

Additional scenarios per resource will be expanded iteratively. See [product.md](./product.md) for the design principle: "commands that should exist but don't are documented, not dropped."
