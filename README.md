# trongrid-cli

A command-line interface for [TronGrid](https://www.trongrid.io/) — query TRON blockchain data from your terminal or AI coding agent.

> **Status**: Active development (Phase F). 17 commands shipped, ~47 planned. See [docs/](./docs/) for the full spec.

## Features

- **17 commands shipped** across 6 resources (account, tx, block, token, contract, config) — ~47 planned across 13 resources
- **Human-friendly** by default — formatted output, colors, unit conversion (sun to TRX)
- **Agent-friendly** with `--json` — structured output for Claude Code, Codex, Gemini CLI, Cursor, and any tool with shell access
- **Zero config** start — works without API key (rate-limited), `trongrid auth login` for full access

## Quick Start

```bash
# Zero install
npx trongrid account view TRX...address

# Or install globally
npm install -g trongrid
trongrid block latest
trongrid token view USDT --json
```

## Why CLI?

TronGrid has a comprehensive REST API (160+ endpoints), but no CLI. Meanwhile, AI coding agents primarily interact with external services through shell commands — not MCP or browser. A CLI with `--json` is the universal interface that works with every agent, every OS, and every human.

For a data-driven analysis of why TypeScript + npm is the right distribution strategy for this project, see [**cli-coverage**](https://cli-coverage.vercel.app) — an interactive tool for visualizing CLI language coverage across OS and distribution channels.

## Documentation

| Doc | Content |
|-----|---------|
| [Product Design](./docs/product.md) | User scenarios, gap analysis, design philosophy |
| [Architecture](./docs/architecture.md) | Tech decisions with evidence and rationale |
| [Commands](./docs/designs/commands.md) | Command grammar design + full command reference |
| [Roadmap](./docs/roadmap.md) | Phase A–O, first npm publish at Phase I |
| [Competitor Research](./docs/research/competitors.md) | CLI landscape analysis (cast, solana, wallet-cli, aptos) |
| [Handoff](./docs/handoff.md) | Current state, locked decisions, cold-start reading order |

## License

MIT
