# trongrid-cli

A command-line interface for [TronGrid](https://www.trongrid.io/) — query the TRON blockchain from your terminal or AI coding agent.

> **Status:** v0.1.0 — first public release. 31 read-side commands across 7 resources. Write-side and governance/stats commands coming in v0.2.0+.

## Install

```bash
npm install -g trongrid-cli
```

Requires Node.js ≥ 22. The installed binary is `trongrid`.

## Quick Start

```bash
# Manual API key (free tier ≥ 3 QPS)
trongrid auth login

# Default network is mainnet; --network shasta or --network nile for testnets
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
trongrid block latest --confirmed
```

For agent integration, see [`AGENTS.md`](./AGENTS.md).

## Examples

```bash
# Single-value lookup
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

# Recent transfers (column display, with thousands separators)
trongrid account transfers TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --limit 10

# Token balance (machine-readable)
trongrid token balance USDT TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --json

# Transaction details
trongrid tx view <hash>

# Latest block (irreversible / confirmed view)
trongrid block latest --confirmed
```

## For AI Agents

The `--json` flag emits structured output suitable for piping into agents. JSON shapes follow the unit-shape contract documented in [`docs/designs/units.md`](./docs/designs/units.md). For full conventions and command grammar, see [`AGENTS.md`](./AGENTS.md).

```bash
trongrid account view TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t --json | jq '.balance_trx'
trongrid token balance USDT TMuA6YqfCeX8EhbfYEg5y7S4DqzSJireY9 --json --fields balance_major,decimals
```

## Why this exists

TronGrid has a comprehensive REST API but no first-party CLI. Other TRON ecosystem tools target either humans (browsers / wallets) or specific agent surfaces (MCP servers). A CLI with `--json` is the universal interface that works with every coding agent, every OS, and every human terminal — without a separate protocol layer.

For a structured comparison with the official TronGrid MCP and TronScan MCP, see [`docs/designs/competitor-parity.md`](./docs/designs/competitor-parity.md).

## Documentation

| Doc | Content |
|-----|---------|
| [Product](./docs/product.md) | User scenarios, gap analysis, design philosophy |
| [Architecture](./docs/architecture.md) | Tech decisions with rationale |
| [Commands](./docs/designs/commands.md) | Full command reference |
| [Roadmap](./docs/roadmap.md) | Phase A–O |
| [Parity matrix](./docs/designs/competitor-parity.md) | vs TronGrid MCP + TronScan MCP |
| [AGENTS.md](./AGENTS.md) | Agent integration + contributing |

## License

MIT
