# AGENTS.md — trongrid-cli

One-page spec for AI agents on how to invoke and contribute to `trongrid-cli`. If you are an AI agent planning to call this CLI as part of a task, read this first. Humans should start with [`README.md`](./README.md) and [`docs/`](./docs/).

---

## 1. Always use `--json` for machine-readable output

```bash
trongrid <command> --json
```

Every command that produces data accepts `--json`. Output is a single JSON document (not NDJSON), written to stdout. Commands that only perform side effects (`auth login`, `config set`) print plain confirmation strings — there is no `--json` for those.

Human-mode output (the default without `--json`) is **not a stable contract**. It includes ANSI codes and padding that changes between versions. Do not parse it.

## 2. Exit codes

Inspect the exit code before reading stdout:

| Code | Meaning | Agent action |
|---|---|---|
| `0` | Success | Parse stdout as expected |
| `1` | General / unexpected error | Surface to caller |
| `2` | Usage error (bad flag, unknown command, missing argument) | **Your bug** — do not retry, fix the invocation |
| `3` | Network or auth failure | Retry once with backoff, then surface |

Usage errors (exit `2`) mean the invocation itself is malformed. Retrying an unknown-flag error will never succeed. Network errors (exit `3`) may be transient — a single retry after 2–5 seconds is reasonable.

## 3. Error shape in `--json` mode

When a command fails, stderr carries a JSON error object:

```json
{
  "error": "Cannot reach TronGrid API at https://api.trongrid.io. Check your internet connection or try a different --network. Run with --verbose for details.",
  "hint": "Check your internet connection or try a different --network. Run with --verbose for details.",
  "upstream": { "code": "ECONNREFUSED" }
}
```

- **`error`** — always present. Short human-readable message.
- **`hint`** — often present. Actionable next step. Read this before retrying.
- **`upstream`** — only present when `--verbose` was passed. Raw underlying error from the API.

Agents should prefer the `hint` over the `error` when deciding how to recover: the hint names a specific fix, the error names the symptom.

## 4. Quantity fields — JSON unit-shape contract

All amount / balance / quantity fields follow the contract in [`docs/design/units.md`](./docs/design/units.md). There are two common shapes.

**Scenario S1 — TRX amounts (fixed unit = sun, decimals = 6):**

```json
{
  "balance": 35216519,
  "balance_unit": "sun",
  "decimals": 6,
  "balance_trx": "35.216519"
}
```

- `balance` — raw sun, JSON number.
- `balance_trx` — formatted string, **use this for display**.

**Scenario S2 — Scalable tokens (TRC-20 and TRC-10, variable decimals):**

```json
{
  "type": "TRC20",
  "contract_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "balance": "38927318000000000",
  "decimals": 6,
  "balance_major": "38927318000.0"
}
```

- `balance` — raw on-chain value, always a **string** (can exceed the JS safe integer range).
- `decimals` — integer exponent. May be `undefined` on lookup failure; the raw value is still present.
- `balance_major` — formatted string, **use this for display**. May be `undefined` on lookup failure.

**Rules of thumb:**

- Never display `balance` directly — use `balance_trx` (S1) or `balance_major` (S2).
- Never parse the raw balance as a JS `number` for S2 values. Use the string, or `BigInt(value)`.
- Never assume `decimals` is a fixed value per token type. For TRC-20 it varies; for TRC-10 most early tokens use `0`.

## 5. Default address — reduce per-call flags

For multi-call workflows against the same address, configure a default once:

```bash
trongrid config set default_address TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
```

After this, `account` read commands omit the positional and use the default:

```bash
trongrid account view --json
trongrid account tokens --json
trongrid account resources --json
```

This saves tokens in agent conversations and makes invocation patterns more uniform across a chain of calls.

## 6. Recommended first commands

For a new agent session entering a TRON-related task, these are safe, idempotent read-only discovery commands:

```bash
trongrid block latest --json                       # chain head, also tests connectivity + auth
trongrid account view <addr> --json                # TRX balance, activation status, contract flag
trongrid account tokens <addr> --json              # TRC-20 + TRC-10 holdings with decimals resolved
trongrid tx view <hash> --json                     # transaction detail
```

Commands marked `(typical first step)` in `--help` output are the intended entry points — the CLI explicitly signals which commands agents should call first.

## 7. Network selection

Three networks are supported: `mainnet` (default), `shasta`, `nile`. Pass `--network` when a task specifies a testnet:

```bash
trongrid account view TR... --network shasta --json
```

`--network` is a simple endpoint switch, not a profile. API key, default address, and other config are global and apply across networks. The three test networks (shasta, nile) do not require an API key.

## 8. Field projection — save context tokens

Narrow JSON output with `--fields` to only the keys your task needs:

```bash
trongrid account view TR... --json --fields balance_trx,is_contract
```

Comma-separated. Fields that do not exist in the source object are silently dropped (no error). This is the cheapest way to keep an agent's context window lean.

## 9. Environment variables

| Variable | Purpose |
|---|---|
| `TRONGRID_API_KEY` | Override the stored API key without `auth login` |
| `NO_COLOR` | Suppress ANSI codes (also set automatically on non-TTY stdout) |

Do not hardcode API keys in invocation strings. Use `TRONGRID_API_KEY` in the environment, or run `trongrid auth login` once interactively.

---

## Contribution rules

If you are an AI agent writing code for `trongrid-cli` (not just calling it), follow these:

- **Language:** TypeScript, strict mode.
- **Runtime:** Node.js 22+ for users; Bun for dev and test.
- **Test runner:** `bun test`.
- **Linter:** Biome. Run `bun run lint` before committing.
- **One production dependency:** `commander`. Native `fetch` and `node:util` `styleText` cover HTTP and color.
- **Commit format:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`). English only, header ≤ 50 chars, lowercase.
- **Branch strategy:** GitHub Flow — work on a feature branch, PR to `main`, merge with `--no-ff`.
- **New quantity fields** must follow the JSON unit-shape contract in [`docs/design/units.md`](./docs/design/units.md). Do not invent new naming patterns.
- **New commands** must follow the grammar committed in [`docs/design/commands.md`](./docs/design/commands.md): two-level noun-verb, action-first positional, trailing identifier, `[address]` for optional with `default_address` fallback.
- **Error paths** must go through `reportErrorAndExit` from `src/output/format.ts` — it handles the `Hint:` line, exit codes, and `--verbose` upstream expansion automatically.
- **Color** must go through the semantic tokens in `src/output/colors.ts` (`accent` / `command` / `pass` / `warn` / `fail` / `muted` / `id`) — not raw `styleText` calls.

## File layout

```
src/
├── index.ts                    # entry point, command registration
├── api/
│   └── client.ts               # TrongridError, ApiClient factory
├── auth/
│   └── store.ts                # API key resolution + storage
├── commands/
│   ├── account/                # account view/tokens/resources
│   ├── auth/                   # auth login/logout/status
│   ├── block/                  # block latest (Phase B: view/stats/range/events)
│   ├── config/                 # config set/get/list
│   └── tx/                     # tx view (Phase B: decode/internals/transfers/broadcast/pending)
├── output/
│   ├── colors.ts               # semantic color tokens (Google CLI design pillar 6)
│   └── format.ts               # printResult / printListResult / reportErrorAndExit
└── utils/
    ├── address.ts              # TRON address validation
    ├── color.ts                # --no-color wiring
    ├── config.ts               # ~/.config/trongrid/config.json read/write
    ├── resolve-address.ts      # [address] optional → default_address fallback
    └── tokens.ts               # TRC-20 / TRC-10 decimals resolvers
```

## Design reference

| Doc | Topic |
|---|---|
| [`docs/design/units.md`](./docs/design/units.md) | JSON quantity field shape (principles P1–P7, scenarios S1–S5) |
| [`docs/design/commands.md`](./docs/design/commands.md) | Command grammar design decisions + full reference |
| [`docs/design/competitors.md`](./docs/design/competitors.md) | CLI competitor research (cast / solana / wallet-cli / aptos) |
| [`docs/design/cli-best-practices.md`](./docs/design/cli-best-practices.md) | CLI best-practices checklist for humans + agents |
| [`docs/architecture.md`](./docs/architecture.md) | Project-wide tech decisions summary |
| [`docs/roadmap.md`](./docs/roadmap.md) | Phase A → B → C with current status |
| [`docs/plans/phase-a-plus.md`](./docs/plans/phase-a-plus.md) | Active implementation plan for the current phase |

---

## What NOT to do

- **Do not parse human-readable output.** Always pass `--json`.
- **Do not retry exit code `2`.** Usage errors will never succeed on retry; the invocation itself is malformed.
- **Do not use `balance` as a display value.** Use `balance_trx` (S1) or `balance_major` (S2).
- **Do not parse the raw `balance` field as a JS number for S2.** Strings can exceed `Number.MAX_SAFE_INTEGER`.
- **Do not hardcode API keys in command strings.** Use `TRONGRID_API_KEY` in the environment or `trongrid auth login`.
- **Do not assume unset fields mean zero.** `decimals` and `balance_major` are `undefined` on lookup failure, not `0` / `""`.
- **Do not add raw `styleText(...)` calls in new code.** Use the semantic tokens in `src/output/colors.ts`.
- **Do not introduce a second production dependency** without updating `docs/architecture.md` §Dependencies — the one-dep commitment is load-bearing.
