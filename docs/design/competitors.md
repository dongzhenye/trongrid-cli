# CLI Competitor Research

**Research date**: 2026-04-10
**Phase**: A+ design research
**Goal**: Inform UX decisions for `trongrid-cli` (command ordering, token decimals, config design, overall patterns) before expanding to ~47 commands in Phase B.

## Tools analyzed

| Tool | Ecosystem | Relevance | Why |
|------|-----------|-----------|-----|
| [cast](#cast-foundry) (Foundry) | EVM | Primary | Widely considered the gold standard for blockchain query/ops CLIs; closest positioning to ours |
| [Solana CLI](#solana-cli) | Solana | Primary | Mature non-EVM L1 reference; TRON is also non-EVM-semantically adjacent |
| [wallet-cli](#wallet-cli-tronprotocol) | TRON (official) | Primary | Direct historical predecessor; same ecosystem, years of real usage |
| [Aptos CLI](#aptos-cli) | Aptos | Secondary | "Modern CLI design" reference — 2023+ well-funded team's design choices |

**Not included and why**:

- `forge` / `hardhat` / `tronbox` — contract development frameworks, not query/ops tools. Different category.
- `sui` — dropped in favor of aptos, which has more to teach us on CLI polish and profile design.
- `geth` — node-operator focused, not a query/ops client CLI.

## Methodology

Each tool was investigated by a parallel research agent with evidence-driven constraints: cite specific commands, doc URLs, repo file paths. Every non-obvious claim must be verifiable. Depth over breadth — deeply understand 3–4 balance/account commands per tool rather than superficially list 30.

Results below include direct quotes, file:line references, and citations. Read the appendix sections in full when a specific decision hangs on the details — the synthesis at the end is a summary, not a replacement.

---

### cast (Foundry)

**Links**

- Repo: <https://github.com/foundry-rs/foundry> (cast source under `crates/cast/`)
- Foundry Book (cast overview): <https://getfoundry.sh/cast/>
- Cast reference: <https://getfoundry.sh/reference/cast/>
- `cast balance` reference: <https://getfoundry.sh/reference/cast/cast-balance>
- Key source file (Balance + erc20 clap defs): `crates/cast/src/opts.rs` lines 803–827, 1168–1173
- Key source file (execution): `crates/cast/src/args.rs` lines 316–341
- ERC20 subcommand source: `crates/cast/src/cmd/erc20.rs`
- Issue #4292 (`--ether` flag origin): <https://github.com/foundry-rs/foundry/issues/4292>
- Issue #6813 (`--token` flag origin): <https://github.com/foundry-rs/foundry/issues/6813>
- Issue #12095 (`cast erc20` promotion, v1.5.0): <https://github.com/foundry-rs/foundry/issues/12095>

**Positioning**

Cast is "Foundry's command-line tool for performing Ethereum RPC calls. You can make smart contract calls, send transactions, or retrieve any type of chain data — all from your command-line" (Foundry Book, `/cast/`). The in-source description is blunter: "A Swiss Army knife for interacting with Ethereum applications from the command line" (`crates/cast/src/opts.rs:19`). Cast is the de facto EVM query/ops CLI — widely used by smart-contract devs, MEV searchers, protocol operators, and security researchers — and is the closest analogue to what `trongrid-cli` aspires to be (query/ops, not a contract dev framework like `forge`).

**Command shape**

Cast is **flat-with-selective-nesting** — the vast majority of commands live one level deep (`cast balance`, `cast call`, `cast send`, `cast block`, `cast tx`, `cast chain-id`, `cast nonce`, `cast code`, `cast storage`). A handful of noun-grouped subtrees exist where the domain justifies it: `cast wallet <verb>`, `cast erc20 <verb>` (added in v1.5.0), `cast tip20 <verb>` (Tempo). There is no universal `cast <noun> <verb>` enforcement — the tree is organized pragmatically, not dogmatically.

Representative commands (all from official docs and source):

```
cast balance vitalik.eth --rpc-url $ETH_RPC_URL --ether
cast call 0xC02a...Cc2 "balanceOf(address)(uint256)" 0xf39f...2266
cast send --ledger 0x... "deposit(address,uint256)" 0x... 1
cast erc20 balance 0xA0b8...eB48 vitalik.eth           # v1.5.0+
cast erc20 decimals 0xA0b8...eB48
cast block latest
cast tx 0xabc... --json
cast wallet import mykey --interactive
```

Every one of these puts the **target resource first** (address, block, tx hash, token), then verbs/arguments. This is load-bearing for the ordering decision below.

**Current context** is set via three layers, in priority order: (1) CLI flags (`--rpc-url`, `--chain`, `--private-key`, `--from`), (2) env vars (`ETH_RPC_URL`, `ETH_RPC_JWT_SECRET`, `ETH_GAS_PRICE`, `ETH_FROM`; defined at `crates/cli/src/opts/rpc_common.rs:23` and around), (3) `foundry.toml` via figment (`rpc_endpoints`, profiles). There is **no explicit `cast config set` command** and **no cast-level "current account" concept** — auth is rebuilt on every command from flags/env. Users typically `export ETH_RPC_URL=...` in their shell once per session.

**Token/balance display — the decimals question (critical)**

This is where cast's design has visibly evolved, and the evolution is itself evidence.

1. **Native balance** (`cast balance <who>`): Default output is a raw wei integer. Example: `cast balance vitalik.eth` → `1234567890000000000`. With `--ether` / `-e`, it formats via `SimpleCast::from_wei(value, "eth")` → `1.234567890000000000` (`crates/cast/src/args.rs:334-335`). The `--ether` flag was added in Feb 2023 (issue #4292, PR #4293) after a user complained "I often forget the exact incantation required to pass a wei value from `cast balance` back into `cast` to get out the human readable ether value" — originally maintainer mattsse's workaround was literally "`cast balance ... | cast fw`" (pipe to from-wei).

2. **ERC20 balance via deprecated flag** (`cast balance <who> --erc20 <token>`): Added in Jan 2024 (issue #6813, PR #6828). Does **NOT** auto-resolve decimals — prints the raw uint256 via `format_uint_exp` (scientific-notation helper), and since v1.5.0 prints a deprecation warning: `"--erc20 flag is deprecated, use `cast erc20 balance` instead"` (`crates/cast/src/args.rs:329`).

3. **ERC20 balance via dedicated subtree** (`cast erc20 balance <token> <owner>`, v1.5.0, Oct 2025): The argument order is **token first, then owner** (`crates/cast/src/cmd/erc20.rs`, `Erc20Subcommand::Balance { token, owner, block, rpc }`). Execution: fetches `balanceOf(owner)` and prints the raw uint256 via `format_uint_exp`. It **still does not auto-resolve decimals** — the source makes zero calls to `decimals()` in the `Balance` branch. `cast erc20 decimals <token>` is a separate command; users compose them manually.

4. **Rationale for the `--erc20` → `cast erc20` migration** (issue #12095): The maintainers explicitly rejected flag-based ERC20 handling as unscalable: *"this approach doesn't scale well for other ERC20 operations, and adding similar flags to other commands (like `cast send`) would create an inconsistent and ambiguous interface"*. The fix was a dedicated noun-grouped subtree with ten subcommands: `balance, transfer, approve, allowance, name, symbol, decimals, total-supply, mint, burn`.

**What cast does NOT auto-solve**: Cast deliberately leaves decimals resolution to the user. For transfers, amounts are passed as raw `String` and parsed as `U256::from_str` (`crates/cast/src/cmd/erc20.rs` Transfer/Approve/Mint branches) — no `parseUnits` helper, no per-token decimals fetch. The user must either (a) pre-multiply, (b) compose with `cast erc20 decimals` + `cast --to-unit`, or (c) know the decimals by heart. This is friction, and cast accepts it as a tradeoff for predictability and zero hidden RPC calls.

**Field naming in JSON output**: For `cast erc20 balance`, the JSON path is literally `sh_println!("{}", serde_json::to_string(&balance.to_string())?)` — a bare JSON string (no named field, no `balance_raw` vs `balance_formatted`). This is minimalist to the point of austerity.

**Output formats**

`--json` is a **global flag** (`crates/cli/src/opts/global.rs`), usable on any command, and conflicts with `--quiet` and `--color`. Human output is mostly unadorned: plain integers for balances, colon-aligned key-value for block/tx views, hex with 0x prefix. Verbosity is `-v` through `-vvvvv`. `--quiet` / `-q` / `--silent` suppresses logs. No table rendering, no fancy columns — cast assumes its output will be piped.

**Auth/key management**

`cast wallet` is the only deeply-nested subtree and has 15+ subcommands: `new`, `new-mnemonic`, `vanity`, `address`, `derive`, `sign`, `sign-auth`, `verify`, `import`, `list`, `remove`, `private-key`, `public-key`, `decrypt-keystore`, `change-password`. Keystores default to `~/.foundry/keystores/<name>` (referenced via `--keystore-dir` / `-k`). Signing key is selected at command time via `--account <name>`, `--private-key <hex>`, `--mnemonic`, `--ledger`, `--trezor`, or `--interactive` — there is **no persistent "default signer"**; each `cast send` must re-specify. Hardware wallet support: Ledger + Trezor are first-class; v1.5.0 added browser-wallet signing (`--browser`) and Turnkey.

**Subcommand organization**

- **Flat is the default.** ~80+ top-level subcommands sit at depth 1.
- **Nesting is earned**, not defaulted: `wallet`, `erc20`, `tip20` are nested because each covers a self-contained resource with 5+ verbs. Anything lighter stays flat.
- Heavy use of `visible_alias` in clap — `b` for balance, `d` for decimals, `n` for name, `s` for symbol, `t`/`send` for transfer (`crates/cast/src/cmd/erc20.rs`). Users type short forms in interactive use; docs show long forms.
- No global "resource → verb" contract; the taxonomy in the Foundry Book (Chain/Tx/Block/Account/ABI/Conversion/Wallet) is documentation-side grouping, not structural nesting.

**Strengths to consider adopting**

1. **Global `--json` as a single switch** that flips every command from human to machine output. Much cleaner than per-command `--format=json`.
2. **Short visible aliases via clap** (`b`, `d`, `n`) for ergonomics without polluting help text — long forms stay canonical in docs.
3. **Layered config precedence**: flags > env (`ETH_RPC_URL`) > config file (`foundry.toml` figment profiles). No hidden state, fully reconstructible from shell env.
4. **Graceful deprecation with in-place warnings** (`sh_warn!("--erc20 flag is deprecated, use cast erc20 balance instead")`) — users learn the new command at the moment they use the old one.
5. **"Nest only when earned"** — flat is the default, noun subtrees (`wallet`, `erc20`) only appear when a resource has 5+ verbs that share state or options.

**Weaknesses/friction points to avoid**

1. **No auto-decimals for ERC20.** `cast erc20 balance` returns raw uint256. Two command compositions required for human-readable output (`balance` + `decimals`, then `cast --to-unit`). The community has filed multiple issues about this; cast has chosen friction over a hidden on-chain call.
2. **No persistent "current account" or "current RPC"** — every command re-resolves from flags/env. Power users `export` once, but casual users retype `--rpc-url` repeatedly. No `cast config set rpc_url ...` shortcut.
3. **Flag creep before the v1.5.0 cleanup** — `--ether` on balance (2023), then `--erc20` on balance (2024), then deprecated in favor of `cast erc20` (2025). Three years of accumulated cruft. Lesson: decide the noun-subtree boundary early.
4. **JSON output is untyped and unlabeled** — `cast erc20 balance` emits a bare JSON string `"1234567890"` with no field name, no decimals metadata, no symbol. Machine-parseable but not self-describing.
5. **`cast wallet` is nested but `cast send --ledger` is flat** — inconsistent placement of signing context makes the mental model fuzzy.

**Direct answers to our two open questions**

**Decision 1 — Command ordering: cast uses `target-first`** (address/contract/token before verb-like arguments).

Evidence, straight from `crates/cast/src/opts.rs` and `crates/cast/src/cmd/erc20.rs`:

```
cast balance    <who>              [--ether] [--erc20 <TOKEN>]
cast call       <to> <sig> [args...]
cast send       <to> <sig> [args...]
cast erc20 balance    <token> <owner>
cast erc20 allowance  <token> <owner> <spender>
cast erc20 transfer   <token> <to> <amount>
```

In **every** case the resource being acted on (account address, contract address, token address) comes first, followed by verb-specific arguments. For our TRON CLI this directly supports the **`account <address> tokens`** ordering over `account tokens <address>`. The Foundry Book does not state this rationale explicitly — it's an unwritten convention, enforced by clap struct field order in the source. But the convention is universal across cast and survived the v1.5.0 redesign intact: when they built `cast erc20 balance`, they put `token` before `owner`, not the reverse.

**Surprising finding**: `cast balance` itself is the *only* exception — it uses `--erc20 <TOKEN>` as a flag rather than a positional, because the "target" there is the account holder, not the token. This actually reinforces the rule: the positional arg is always whichever resource the command is fundamentally *about*.

**Decision 2 — Token decimals: cast does NOT auto-resolve; it deliberately leaves it to the user.**

Evidence: `crates/cast/src/cmd/erc20.rs` `Self::Balance` branch calls only `balanceOf(owner)` — zero additional RPC calls. The result is printed via `format_uint_exp(balance)` which is a scientific-notation formatter, not a decimals-aware formatter. `cast erc20 decimals <token>` is a separate command and the user composes them. For transfers, amount is parsed directly as `U256::from_str(&amount)` with no decimals adjustment. The field name in JSON is a bare unnamed string (`serde_json::to_string(&balance.to_string())`).

**Quotable maintainer design statement** (issue #12095, rationale for the `cast erc20` subtree): *"this approach doesn't scale well for other ERC20 operations, and adding similar flags to other commands (like `cast send`) would create an inconsistent and ambiguous interface."* — Foundry maintainers on why they consolidated rather than adding more balance-like flags. Note what this statement does *not* commit to: automatic decimals handling. Even the redesigned `cast erc20` subtree keeps decimals as a separate, explicit user action.

**Implication for trongrid-cli**: If we want a *better* token balance UX than cast, the bar is genuinely low — any CLI that displays `1.234 USDT` instead of `1234000` with no extra command will already beat cast. But cast's reason for not doing this is worth taking seriously: an extra hidden `decimals()` RPC call per balance query doubles network cost and can surprise users who are already rate-limited. A static decimals map for common tokens (USDT=6, USDC=6, WTRX=6, etc.) with fallback to an on-chain call and a `--raw` escape hatch would give us the best of both worlds — and it's exactly the design cast didn't attempt.

---

### Solana CLI

**Links**

- Agave (validator + `solana` / `solana-keygen` CLI source): <https://github.com/anza-xyz/agave>
- CLI usage reference: <https://docs.anza.xyz/cli/usage>
- CLI intro: <https://docs.anza.xyz/cli>
- SPL Token program + CLI repo: <https://github.com/solana-program/token> (historically `solana-labs/solana-program-library`, still shipped as the `spl-token-cli` crate on crates.io: <https://crates.io/crates/spl-token-cli>)
- Token program docs: <https://www.solana-program.com/docs/token>
- CLI basics tutorial: <https://solana.com/docs/intro/installation/solana-cli-basics>

**Positioning**

The reference CLI for a mature non-EVM L1. `solana` is the first-class interface every validator op, dapp dev, and program deployer touches; its UX conventions (clap-based Rust, YAML config, `~/.config/solana/`) are widely copied by the broader Solana tooling ecosystem. Relevant to us because TRON is likewise non-EVM-semantically (different VM, resource model, account model) and we need a UX benchmark that isn't just `cast`.

**Command shape**

Flat, verb-first, noun-less. There is no `solana account …` subcommand tree — actions sit at the top level. Examples:

- `solana balance <ADDRESS>` — SOL balance; address is optional, defaults to configured keypair
- `solana config get` / `solana config set --url devnet --keypair ~/.config/solana/id.json`
- `solana-keygen new --outfile ~/my-solana-wallet/my-keypair.json`
- `solana transfer <RECIPIENT> <AMOUNT>`
- `spl-token accounts` — list all token accounts owned by the configured keypair
- `spl-token display <MINT>` — show mint details

"Current context" lives in `~/.config/solana/cli/config.yml`, holding RPC URL, WebSocket URL, Keypair Path, and Commitment. `solana config set --url mainnet-beta|devnet|testnet|localhost` (or the short forms `-um / -ud / -ut / -ul`) swaps cluster; `--keypair` swaps signer. `solana config get` prints the full active context (Source: <https://solana.com/docs/intro/installation/solana-cli-basics>).

**Why `spl-token` is a separate binary**

`solana` is shipped from the Agave validator repo (`anza-xyz/agave`). `spl-token` ships from an entirely different repo and org (`solana-program/token`, formerly inside `solana-labs/solana-program-library`) as the `spl-token-cli` crate. The split mirrors the on-chain architecture: SOL is native to the runtime, but tokens are just "another program" (the SPL Token program) — so its CLI is maintained by the program's team, not the core client team.

- **Pro**: independent release cadence, smaller blast radius, core CLI stays thin.
- **Con**: discovery friction — newcomers wonder why `solana balance` works but `solana token balance` doesn't exist; they must `cargo install spl-token-cli` separately.

**For trongrid-cli this is a cautionary tale**: we own the whole surface, so a single binary with a `trongrid token …` namespace is almost certainly the right call.

**Token/balance display (critical)**

`solana balance` returns a single human string like `3.00050001 SOL` (up to 9 decimals since 1 SOL = 10^9 lamports). `--lamports` shows raw integer units. No structured output by default; `--output json` / `--output json-compact` is supported across the CLI.

`spl-token accounts` outputs a table:

```
Token                                         Balance
-----------------------------------------------------
4thQMAdXBX7zPA7LmKBEdW4JG6MujnTkeTvdJcB5MBqU  100
```

`spl-token balance <TOKEN_MINT>` returns just the formatted number. Critically, **balances are already decimal-adjusted**: a mint with 6 decimals and a raw `amount` of `100000000` displays as `100`. The underlying RPC (`getTokenAccountsByOwner` with `jsonParsed` encoding) returns a `tokenAmount` object with four fields — `amount` (raw string), `decimals`, `uiAmount` (float, may lose precision), and `uiAmountString` (the safe string form) — and the CLI surfaces the string form.

**Where do the decimals come from?** Straight off the mint account on-chain. `spl-token display <MINT>` fetches the Mint struct and prints fields including `Supply`, `Decimals: 6`, `Mint authority`, `Freeze authority`. There is no static decimals map shipped with the CLI and no registry lookup — every balance query implicitly resolves decimals via the mint account. This is the right default for a permissionless token ecosystem where anyone can create a token: the source of truth is the chain, not a bundled JSON file.

**Output formats**

`--output <format>` supports `json` and `json-compact` globally. Quiet mode via `--no-address-labels` and similar flags; verbosity via `-v`.

**Auth/key management**

Keypairs are **unencrypted JSON files** on disk, by default at `~/.config/solana/id.json`. `solana-keygen` is a **third separate binary** shipped alongside `solana`. Key commands: `solana-keygen new [--outfile PATH]` (generates keypair + BIP39 seed phrase, will not overwrite without `--force`), `solana-keygen pubkey PATH`, `solana-keygen verify`. Which keypair signs is determined by precedence: CLI `--keypair` flag > config `keypair_path` > default `~/.config/solana/id.json` (source: <https://docs.anza.xyz/cli/wallets/file-system>).

**Subcommand organization**

Deliberately flat. `solana` has ~50 top-level verbs (`balance`, `transfer`, `airdrop`, `stake-account`, `validators`, `epoch-info`, `program deploy` …). The only nested group is `solana config {get,set,…}`. No resource nesting like `solana account subcommand`.

**Strengths to consider adopting**

1. **YAML config file with a single source of truth path** (`~/.config/solana/cli/config.yml`) — every flag has a config equivalent, and `config get` prints the exact active state. Cleaner than our current scattered config.
2. **Cluster short aliases** (`-um`, `-ud`, `-ut`, `-ul`). For TRON: `-um` mainnet, `-us` Shasta, `-un` Nile is a free win.
3. **Balance returns both forms on demand** — default is formatted, `--lamports` gives raw. We should expose `--raw` on `account tokens`.
4. **On-chain decimals resolution, no static map** — mirrors TRC20 reality (anyone can deploy) and avoids stale metadata drift.
5. **`display <address>` as a polymorphic inspector** — `spl-token display` accepts mint, account, or multisig and formats accordingly. Maps well to a `trongrid inspect <address>` convenience command.

**Weaknesses/friction to avoid**

1. **Binary fragmentation** — new users have to learn that SOL lives in `solana` but tokens live in `spl-token` and keygen lives in `solana-keygen`. Three separate installs, three separate `--help` trees, no unified discovery.
2. **Flat verb space doesn't scale** — with ~50 top-level verbs, `solana --help` is a wall of text; there's no grouping by resource. We should avoid this at ~47 commands by keeping the `noun verb` structure.
3. **Unencrypted keypairs by default** — explicitly called out as "least secure" in the docs, yet it's the default. We should require either passphrase or OS keychain from day one.
4. **`uiAmount` precision footgun** — RPC returns both `uiAmount` (float) and `uiAmountString`; consumers who pick the float lose precision on large balances. Our JSON should only emit the string form.
5. **Inconsistent argument position for addresses** — `solana balance [ADDRESS]` (positional, optional) vs `spl-token balance --address <ADDR>` (flag). The inconsistency between the two binaries is exactly the kind of thing we should avoid across our own subcommands.

**Direct answers to our two open questions**

1. **Command ordering.** Solana is unambiguously **action-first / verb-first**, with the address as a trailing positional:
   - `solana balance <ACCOUNT_ADDRESS>`
   - `solana transfer <RECIPIENT> <AMOUNT>`
   - `spl-token balance <TOKEN_MINT>`
   - `spl-token display <MINT_OR_ACCOUNT>`
   - `spl-token accounts` (no address at all — implicit "the configured keypair's accounts")

   The docs offer no written rationale, but the pattern is consistent: the verb is mandatory, the address is optional when it can default from the configured keypair. Notably, Solana has no `account` noun at all — there is no `solana account balance ADDR` or `solana ADDR balance`. For our `account tokens <address>` vs `account <address> tokens` question: Solana would effectively pick neither and write `tokens [ADDRESS]` — but we already committed to a `noun verb` tree, and within that constraint **action-first (`account tokens <address>`) is what Solana's verb-first philosophy most closely endorses**. Address-last preserves the "verb is the mandatory token, address is optional and defaults from config" pattern — which we should steal wholesale by making `<address>` optional when `config get default_address` is set.

2. **Token decimals strategy.** `spl-token` **always resolves decimals from the on-chain mint account**, via the RPC's `jsonParsed` encoding which returns `{amount, decimals, uiAmount, uiAmountString}` in one shot. No static map, no local cache, no registry. For `trongrid-cli` this means: for TRC20 we should `triggerConstantContract` the `decimals()` method (or batch-fetch via an indexer), emit raw `amount` + `decimals` + `uiAmountString` in JSON, and render only the string form in human output. A static decimals map for the top ~10 tokens is a reasonable *optimization* cache (fewer RPC calls for USDT/USDC), but it should never be the source of truth — the on-chain value wins on cache miss or conflict.

**Surprising finding**: The canonical Solana client repo is **not** `solana-labs/solana` anymore — it's `anza-xyz/agave`, following the 2024 split where Solana Labs' client work moved to the new Anza entity. The `spl-token` CLI also migrated from `solana-labs/solana-program-library` to `solana-program/token`. Documentation across the ecosystem is inconsistent about which org owns what, and many tutorials still link to the old repos. This three-way split (`anza-xyz/agave` for core, `solana-program/*` for programs, `solana.com/docs` for the docs site which is maintained by yet another team) is itself a cautionary tale about what happens when the "CLI" isn't one thing. **For a small project like ours, keeping all surface area in one repo and one binary is a strict UX win.**

---

### wallet-cli (tronprotocol)

**Links**

- Repo: <https://github.com/tronprotocol/wallet-cli> (Java, LGPL-3.0, 773 stars, 578 forks)
- README: <https://github.com/tronprotocol/wallet-cli/blob/master/README.md>
- Source of truth for command list: [`src/main/java/org/tron/walletcli/Client.java`](https://github.com/tronprotocol/wallet-cli/blob/develop/src/main/java/org/tron/walletcli/Client.java) (a 172 KB file holding ~135 `case` branches for every command)

**Positioning**

TRON's official reference CLI, sibling to `java-tron`. Still actively maintained — latest release `wallet-cli-4.9.4` published 2026-02-06, recent commits January 2026, 0 open issues / 2 open PRs (support clearly funnels into the [TRON dev Telegram](https://t.me/TronOfficialDevelopersGroupEn)). It is **not a classic CLI** — `java -jar wallet-cli.jar` drops you into a jline REPL with a `wallet> ` prompt, and commands are typed inside that shell. Recently migrated its gRPC internals to the [Trident SDK](https://github.com/tronprotocol/trident).

**Command shape**

- **REPL-only.** `Client.java` builds a jline `TerminalBuilder`/`LineReader` and loops on `lineReader.readLine("wallet> ")` — there is no documented non-interactive / piped / `--command` mode ([Client.java](https://github.com/tronprotocol/wallet-cli/blob/develop/src/main/java/org/tron/walletcli/Client.java), the `run()` method).
- **Flat, case-insensitive command namespace.** Every command is matched by `cmd.toLowerCase()` in one giant `switch` (`case "getbalance"`, `case "freezebalancev2"` …). No subcommand tree.
- **Positional arguments**, space-separated, no flags. Argument order and meaning are fixed, with optional `OwnerAddress` prefix defaulting to the logged-in account. Example signature from the README: `> freezeBalance [OwnerAddress] frozen_balance frozen_duration [ResourceCode:0 BANDWIDTH, 1 ENERGY] [receiverAddress]`.
- **Representative commands**:
  - `login 123456` — unlocks a local keystore for the session (REPL state).
  - `getAccount TRfwwLDpr4excH4V4QzghLEsdYwkapTxnm` — prints an ad-hoc human dump with an embedded JSON-ish `assetV2` array.
  - `getBalance` — prints `Balance = 9999900000` (raw sun).
  - `sendCoin TJCn…6sxMW 10000000000000000` — TRX transfer, amount in sun.
  - `freezeBalanceV2 TJAV…4AyDh 1000000000000000 0` — stake for BANDWIDTH (resource code 0) under the Stake 2.0 model.
  - `delegateResource TJAV…4AyDh 10000000 0 TQ4g…fzLfyEVs3 true` — delegate bandwidth to another address.
  - `getUSDTBalance` / `transferUSDT TR311sD6… 1` — hard-coded convenience wrappers around the USDT TRC20 contract.
  - `triggerContract` / `triggerConstantContract` — generic TRC20/contract calls.
- **Context model**: explicit `login` / `loginAll` / `logout` / `switchWallet` / `lock` / `unlock` commands manage a "current account" held in REPL memory; `switchNetwork [main|nile|shasta|custom]` switches networks at runtime.

**TRON-specific concepts encoded as commands**

- **Bandwidth/Energy**: `getAccountResource`, `getAccountNet`, `getBandwidthPrices`, `getEnergyPrices`, `getMemoFee`, `estimateEnergy`.
- **Stake 1.0 vs 2.0**: duplicated surface — `freezeBalance`/`unfreezeBalance` (legacy) and `freezeBalanceV2`/`unfreezeBalanceV2`/`withdrawExpireUnfreeze`/`cancelAllUnfreezeV2`/`getAvailableUnfreezeCount`/`getCanWithdrawUnfreezeAmount` (current). Resource code is a positional int: `0 = BANDWIDTH, 1 = ENERGY`.
- **Delegation**: `delegateResource`, `unDelegateResource`, `getDelegatedResource`, `getDelegatedResourceV2`, `getDelegatedResourceAccountIndexV2`, `getCanDelegatedMaxSize`.
- **TRC10 (native)**: full first-class support via `assetIssue`, `transferAsset`, `participateAssetIssue`, `getAssetIssueById/ByName/ByAccount`, `unfreezeAsset`, `updateAsset`. TRC10 token ID uses the literal string `"_"` to mean TRX in the DEX commands.
- **TRC20 (contracts)**: no first-class framework — users must hand-build calldata via `triggerContract`, **except** for the one hard-coded pair `getUSDTBalance` / `transferUSDT` which wraps mainnet USDT specifically.
- **Witness / SR**: `createWitness`, `updateWitness`, `listWitnesses`, `voteWitness`, `getBrokerage`, `updateBrokerage`, `getReward`, `withdrawBalance`.
- **Governance**: `createProposal`, `approveProposal`, `deleteProposal`, `listProposals`, `getChainParameters`.
- **On-chain DEX**: `exchangeCreate`, `exchangeInject`, `exchangeTransaction`, `exchangeWithdraw`, `marketSellAsset`, `marketCancelOrder`, `getMarketPairList`.
- **GasFree**: newer additions `gasFreeInfo`, `gasFreeTransfer`, `gasFreeTrace` for meta-transactions ([README §Gas Free Support](https://github.com/tronprotocol/wallet-cli/blob/master/README.md#gas-free-support)).

**Token/balance display**

- TRX balances are shown in **raw sun**, always. README example: `> getbalance` → `Balance = 0`; `assetIssue` example comment says "(Print balance: 9999900000)". The user is expected to divide by 10^6 mentally.
- `frozen_balance` arguments are documented in sun with a 1 TRX minimum: *"The amount of frozen funds, the unit is Sun. The minimum value is 1000000 Sun(1TRX)."*
- TRC10 balances appear inside `getAccount`'s `assetV2` block as raw integers.
- USDT is the only TRC20 with a dedicated command path; other TRC20s have no decimals handling at all — users call `triggerConstantContract balanceOf(address)` and read hex from `constant_result`.

**Output formats**

- **No JSON output mode, no `--output` flag.** Output is a mixture of:
  1. Human strings (`Balance = 0`, `SwitchNetwork successful !!!`).
  2. Pretty-printed JSON dumped into the REPL for anything deriving from a protobuf (`getAccount`, `getTransactionSignWeight`, `gasFreeInfo`).
  3. Hex smart-contract return values (`getUSDTBalance` prints `constant_result: ["0000…6544ae57"]` *and* a decoded `USDT balance = 1698999895`).
- **Not scriptable / pipeable.** Because output is interleaved with prompts, progress bars (`[====] 100%` in `loginAll`), interactive confirmations ("Please confirm and input your permission id…"), and banners, stdout cannot be piped into `jq` or another tool.

**Auth / key management**

- **Local encrypted keystores**, one JSON file per account under `./Wallet/` (e.g. `./Wallet/Ledger-TAT1dA…81y.json`). Unlocked via `login <password>` inside the REPL.
- `loginAll` unlocks every keystore in the directory with a single shared password, then prompts you to pick one by number.
- Supports mnemonics (`importWalletByMnemonic` / `exportWalletMnemonic` / `generateSubAccount`), Base64 private keys (`backupWallet2Base64` / `importWalletByBase64`), and plain-keystore import (`importWalletByKeystore`).
- **Hardware wallet**: first-class Ledger Nano X/S support via `importWalletByLedger` — derives default path `m/44'/195'/0'/0/0`, prompts for path selection, supports custom paths, and writes a `Ledger-<addr>.json` keystore ([README §import wallet by ledger](https://github.com/tronprotocol/wallet-cli/blob/master/README.md#import-wallet-by-ledger)). This is unusually mature for a reference CLI.
- An optional `lockAccount = true` in `config.conf` enables session `lock` / `unlock [seconds]` (default 300s auto-relock) — signatures blocked while locked.

**Subcommand organization**

- **No hierarchy at all.** ~135 flat commands, counted directly from `case "…"` branches in `Client.java`. Grouping exists only as section headings in the README. Tab completion is provided by jline's `CaseInsensitiveCommandCompleter` plus an address-book completer (`ArgumentCompleter`), which is nice but only works *inside* the REPL.

**Strengths worth considering**

1. **Vocabulary completeness.** Every TRON-specific concept has an explicit command. Reading the command list is basically a map of TRON's ontology (Stake 1.0/2.0, delegation, SR brokerage, TRC10 DEX, proposals, GasFree). This is a good **command-coverage checklist** for trongrid-cli's ~47-command target.
2. **Ledger support.** The `importWalletByLedger` → keystore-file flow is clean: hardware wallet derives the key, a keystore wraps the public identity and path, and downstream commands don't need to know the difference. Worth copying conceptually even if we punt on hardware in Phase B.
3. **Explicit network switching at runtime.** `switchNetwork main|nile|shasta|custom` with a `currentNetwork` echo. Our `--network` flag should keep parity with these three names for muscle memory.
4. **Address book with tab completion.** `addressBook` command plus `addressCompleter` means frequent counterparties are reachable by prefix. A lightweight alias file is cheap for us to add later.

**Weaknesses / friction points to avoid**

1. **JVM boot + REPL-only interaction.** `java -jar wallet-cli.jar` needs a JVM cold start, and there is no `--command` / stdin batch mode — you cannot do `wallet-cli getBalance TRfww…` from a shell script. Our non-TTY-aware, pipeable Node CLI is the whole point of difference here.
2. **No JSON output / mixed human+JSON stdout.** Even where the tool does print JSON (e.g. `gasFreeInfo`, `getTransactionSignWeight`), it's sandwiched between banners, `successful !!!` lines, and command echoes, so you cannot `| jq`. trongrid-cli's `--json` / auto-detected non-TTY JSON mode must be first-class.
3. **Raw sun everywhere, no decimals.** Balances, stakes, transfers all take raw `sun`. README literally tells the user to count zeros (`100000000 3 1` for "freeze 10 TRX for 3 days as ENERGY"). We should display **TRX by default** with `--sun` / `--raw` for experts, and do the same for TRC10/TRC20 with fetched decimals.
4. **No TRC20 framework, just a USDT special-case.** `getUSDTBalance` / `transferUSDT` are hard-coded wrappers; every other TRC20 falls through to `triggerContract` with manual calldata and hex return values. Any serious TRC20 ergonomics (balanceOf across arbitrary contracts, decimals lookup, symbol display) is an **open gap** we should fill.
5. **Positional args with `[OwnerAddress]` as an optional *leading* parameter.** The `freezeBalance` signature `[OwnerAddress] frozen_balance frozen_duration [ResourceCode] [receiverAddress]` is confusing: whether position 1 is the owner or the amount depends on whether you omit the owner. This is a classic positional-overload trap — flags (`--owner`, `--resource`) avoid it.
6. **Duplicated legacy/V2 command surface.** `freezeBalance` (dead) lives alongside `freezeBalanceV2` (current), same for `unfreeze*`, `getDelegatedResource*`. New users have to know which is current. We should only expose Stake 2.0 names (without the `V2` suffix) and document legacy as historical.
7. **135-command flat list with 172 KB of switch-case.** Discoverability is poor — users rely on the README table. A subcommand tree like `account`, `resource`, `tx` gives free grouping and `--help` pages.

**Relevance to trongrid-cli**

- **Command coverage checklist**: wallet-cli's TRON-specific families tell us what Phase B/C must cover to feel complete to an existing TRON power user: `account` (get/resource/net), `resource` (stake/unstake/delegate/undelegate/withdraw-expire), `witness` (list/vote/brokerage/reward/withdraw-balance), `proposal`, `tx` (getById, getInfoByBlockNum, countByBlockNum), `chain` (parameters, bandwidth/energy/memo prices), and TRC10 operations (`asset issue/transfer/list/participate`).
- **Muscle memory to honor**: network names `main` / `nile` / `shasta`; resource codes `BANDWIDTH` / `ENERGY` (accept the 0/1 ints too as aliases, reject by default); concept of an optional *owner* that defaults to the active account; explicit `delegate` / `undelegate` verbs; `getReward` + `withdrawBalance` as distinct steps.
- **Muscle memory to deliberately break**: raw-sun-everywhere (switch to TRX-by-default); positional-only args (add named flags); REPL-as-primary (direct invocation is our primary, interactive is optional); CamelCase command names (use lowercase kebab, e.g. `freeze-v2` → actually just `resource stake`); `getXxxByYyy` verbosity (prefer `tx get <id>`, `block get <n>`).
- **Command-ordering debate (`account tokens <addr>` vs `account <addr> tokens`)**: wallet-cli offers only weak evidence because it has no subcommand tree at all — everything is flat (`getAssetIssueByAccount <addr>`, `getAccountResource <addr>`). But its *naming* pattern is clearly **verb-first / subject-last** (`getAccount`, `getAccountResource`, `getAssetIssueByAccount`), which corresponds more closely to `account tokens <addr>` (group → action → target) than `account <addr> tokens`. It also defaults the owner address to the logged-in account when omitted — a precedent for letting `account tokens` (no address) act on a default/active address in our CLI. This is mild support for the `account tokens <addr>` ordering, with an escape hatch for a configured default address.

**Other TRON-ecosystem CLI tools to be aware of** (briefly, none displace wallet-cli as the historical incumbent):

- **Trident Java SDK** (<https://github.com/tronprotocol/trident>) — not a CLI, but wallet-cli now sits on top of it. The shape of Trident's Java API is a more normalized view of the same command set and may be worth skimming as a second data point on grouping.
- **TronWeb** (<https://github.com/tronprotocol/tronweb>) — JS SDK, not a CLI, but its method naming (`tronWeb.trx.getAccount`, `tronWeb.trx.getBalance`, `tronWeb.trx.freezeBalance`) is the *other* naming convention TRON power users have internalized and is arguably closer to our subcommand tree.
- **TronBox** (<https://github.com/tronprotocol/tronbox>) — contract deployment CLI, Truffle-style; orthogonal to our query/ops positioning.
- **tronpy** (<https://github.com/andelf/tronpy>) — third-party Python SDK used by many analysts; good signal for which method names non-Java users recognize.

---

### Aptos CLI

**Links**

- Repo: <https://github.com/aptos-labs/aptos-core> (CLI crate: `crates/aptos/src/`)
- Main docs: <https://aptos.dev/en/build/cli>
- Reference: <https://aptos.dev/build/cli/trying-things-on-chain/looking-up-account-info>
- Setup / config: <https://aptos.dev/build/cli/setup-cli>
- No dedicated design-philosophy blog post found. The most substantive third-party critique is [NonceGeekDAO on Medium](https://noncegeek.medium.com/aptos-cli-usage-guide-and-repl-design-suggestions-learning-move-0x04-b22720b99e98), which treats Aptos CLI as a baseline and proposes REPL improvements (colors, history, tab-completion, markdown help).

**Positioning**

First-party CLI from Aptos Labs for compiling/publishing Move contracts, querying on-chain state, and running local testnets. Written in Rust, built on `clap`. We care about it as a **modern, well-funded team's CLI** with an opinionated profile/config model and an unusually thorough `aptos init` UX.

**Command shape**

Strict **noun-verb, two-level subcommand tree** (max depth 2 beneath `aptos`). From `crates/aptos/src/lib.rs` the top-level `Tool` enum is: `Account`, `Config`, `Genesis`, `Governance`, `Info`, `Init`, `Key`, `Move`, `Multisig`, `Node`, `Stake`, `Update`, `Workspace`. Most are `#[clap(subcommand)]`; `Init` and `Info` are flat.

Representative commands:

- `aptos init --profile alice` — interactive wizard; creates `.aptos/config.yaml` and a named profile
- `aptos account list --query balance --account 0xf1f2...` — query balance/modules/resources for an address
- `aptos account balance --account 0xf1f2... --coin-type 0x1::aptos_coin::AptosCoin` — dedicated balance command
- `aptos account transfer --account 0x2df4... --amount 1000` — on-chain transfer
- `aptos config show-profiles` / `config set-global-config --config-type global` — profile/config management
- `aptos node run-local-testnet --with-faucet` — long-running local node
- `aptos move publish --profile alice` — publish Move module using profile defaults

**Current context** is entirely profile-driven. Every command that touches chain state flattens a `ProfileOptions` struct providing `--profile <name>`, defaulting to a profile literally named `default` (`DEFAULT_PROFILE` constant in `crates/aptos/src/common/types.rs`). There is no per-command "active network" flag — network is a property of the profile.

**Config & profile design**

- **Location**: `.aptos/config.yaml` in workspace (default), or `~/.aptos/global_config.yaml` (opt-in)
- **Format**: **YAML**, one file holds many profiles keyed by name
- **Example** (from Aptos docs):

  ```yaml
  profiles:
    customer:
      private_key: "0xSOMETHING"
      public_key: "0xe82f73c9..."
      account: 525344e8...
      rest_url: "https://fullnode.devnet.aptoslabs.com/"
      faucet_url: "https://faucet.devnet.aptoslabs.com"
  ```

  A profile bundles **keys + account + network endpoints** as one unit — switching profile switches network. Multi-network = multi-profile.
- **Active profile selection**: `--profile <name>` flag per invocation; no "set default profile" command. The literal name `default` is the implicit fallback. `aptos config set-global-config --config-type global` only toggles workspace-vs-home lookup — it does not pick a default profile (see `crates/aptos/src/config/mod.rs`).
- **Workspace vs global precedence**: config search walks current dir and parents (`ConfigSearchMode::CurrentDirAndParents` in `account/balance.rs`), falling back to `~/.aptos/` only if global mode is set.
- **Pros for us**: single file, fully declarative, network+key bundled.
- **Cons**: no notion of "default profile other than literal 'default'" — users who want two mainnet identities must retype `--profile` every call. The workspace-first search is developer-friendly for Move projects but surprising for a pure query tool.

**Token/balance display**

Source of truth is `crates/aptos/src/account/balance.rs`. The output struct is:

```rust
pub struct AccountBalance {
    asset_type: String,          // "coin" or "fungible_asset"
    coin_type: Option<String>,   // e.g. "0x1::aptos_coin::AptosCoin"
    balance: u64,                // RAW octas, never scaled
}
```

**Aptos does not format decimals.** Balance is returned as raw `u64` octas (1 APT = 100_000_000 octas). No `decimals` field, no human-readable `ui_amount`. For non-APT coins the user must pass `--coin-type` explicitly; for fungible assets (FAs) the user passes the metadata object address via `--coin-type` and the code dispatches to `fa_balance`. There's still a **TODO comment on the `Balance` struct**: `/// TODO: Fungible assets` — the FA path exists but the team flags it as unfinished. The decimals value is never queried from the chain.

**Output formats**

Everything is serialized to JSON by default via `execute_serialized()`, wrapped in `{"Result": ...}`. There is no `--format=table`; human output is literally pretty-printed JSON. A `PromptOptions` flatten provides `--assume-yes`/`--assume-no` for non-interactive automation.

**Auth/key management**

Private keys live **in plaintext** inside `config.yaml` as hex literals under each profile. `aptos config show-private-key --profile alice` is an explicit read-back command. Keys are associated with profiles 1:1. Hardware wallet support exists via `--ledger` in `aptos init` (`common/init.rs`).

**Subcommand organization**

Hierarchical, grouped by domain noun: `account`, `config`, `key`, `move`, `node`, `stake`, `multisig`, `governance`. Depth is capped at 2. `Multisig` was promoted to a top-level noun rather than nested under `account`, trading tree symmetry for discoverability — worth noting as a design precedent.

**Help text & UX polish**

Aptos leans on `clap`'s docstring-as-help convention: every command struct has a **doc comment that becomes its help text**, and per-field docs become flag help. Examples from the source:

- `Balance`: *"Show the account's balance of different coins"*
- `ListAccount`: *"List resources, modules, or balance owned by an address. This allows you to list the current resources at the time of query. This can change due to any transactions that have occurred after the request."*
- `SetGlobalConfig.config_type`: *"Workspace will put the `.aptos/` folder in the current directory, where Global will put the `.aptos/` folder in your home directory"*

The strength is **consistency** — every flag has a short description, every command has a one-line summary plus a caveat paragraph. `aptos init` is interactive by default with sensible defaults (pressing Enter accepts devnet), funds the account automatically on test networks, and writes a gitignore into `.aptos/`. Error messages are actionable: missing profile returns `"Please provide an account using --account or run aptos init"` — it tells the user the fix.

**Weaknesses**: help text is mechanical (no examples section like `git --help`), and there is no colorised/pretty non-JSON output. JSON-only output means humans have to eyeball raw octas.

**Strengths to adopt**

1. **Profile = keys + network + endpoints as one unit.** Clean mental model; one `--profile` flag replaces `--network`, `--rest-url`, `--private-key`.
2. **Workspace + global config with parent-dir walk.** `.aptos/config.yaml` auto-discovered from CWD up — great for project-scoped CLI usage.
3. **Actionable error messages that name the fix.** "Please provide an account using --account or run aptos init" is a pattern to copy.
4. **Docstring-driven help via clap.** Forces every command to carry its own description in-source; help stays in sync with code.
5. **Default profile literally named `default`.** Simple convention that avoids a separate "set-default" command for solo users.
6. **Explicit `config show-private-key` command.** Makes key extraction an audited, intentional action rather than "cat the config file."

**Weaknesses/friction points to avoid**

1. **Raw u64 balances with no decimals/formatting.** Every user must know "APT has 8 decimals" — a beginner running `aptos account balance` sees `100000000` and can't tell if it's 1 APT or 100 APT. The `TODO: Fungible assets` comment in `balance.rs` confirms the team knows this is incomplete. **We must do better here.**
2. **JSON-only output.** No table/plain mode means human readability is poor.
3. **No "set default profile" command.** Users with multiple accounts on one network have to type `--profile` on every call.
4. **Plaintext private keys in config.yaml.** Fine for devnet, not appropriate for mainnet query tools.

**Direct answers to our two open questions**

1. **Command ordering — Aptos uses `--account` as a named flag, not positional.**
   Verified in `crates/aptos/src/account/balance.rs`:

   ```rust
   pub struct Balance {
       /// Address of the account you want to list resources/modules/balance for
       #[clap(long, value_parser = crate::common::types::load_account_arg)]
       pub(crate) account: Option<AccountAddress>,
       ...
   }
   ```

   Identical pattern in `list.rs`. Actual invocation is `aptos account balance --account 0xf1f2...`, not `aptos account balance 0xf1f2...`. **Neither action-first nor address-first — it's flag-first**, which sidesteps the ordering debate entirely by never making address positional.

   Rationale, inferred from the code: the `account` field is `Option<AccountAddress>`. When omitted, the command falls back to the **active profile's** account (`CliConfig::load_profile(...).map(|p| p.account)`). Making it positional would conflict with the "profile provides the default" UX. I found no aptos-core GitHub issue explicitly debating positional-vs-flag for this command, but the Hermes CLI [explicitly argued](https://github.com/informalsystems/hermes/issues/2239) for flags everywhere for exactly this reason: optional + defaultable args cannot be positional without ambiguity.

   **Implication for trongrid-cli**: if we plan to let a config profile supply the default address, "address-first positional" (`account <addr> tokens`) becomes incoherent — what do you type when the profile provides the address? Aptos's answer is "make address a flag, fall back to profile." Worth strong consideration.

2. **Token decimals strategy — Aptos does zero formatting.** Balances are raw `u64` octas, field named `balance`, coin identified by `coin_type` string (e.g. `"0x1::aptos_coin::AptosCoin"`). No `decimals`, no `ui_amount`, no symbol. For FAs the user supplies the metadata object address via `--coin-type`; decimals are never fetched. This is **explicitly flagged as unfinished** in the source (`/// TODO: Fungible assets`). Takeaway: even the "modern reference" has a gap here, and doing formatting properly (query decimals once, cache, show `1.23 USDT (1234500 raw)`) would be a genuine differentiator.

**Surprising finding**: Aptos CLI, despite its reputation for polish, has a **TODO in production** for fungible-asset balance handling and ships raw u64 as its only balance representation. The "modern reference" is actually weaker than expected on exactly the decision we're trying to make. Our instinct to handle token decimals thoughtfully is well-founded — we'd be leapfrogging Aptos on this axis, not catching up.

---

## Cross-tool synthesis

### Decision 1: Command argument ordering

**Status**: ✅ **Decided 2026-04-10 — Option B (action-first positional)**. Canonical record in [`architecture.md` §Positional argument ordering](./architecture.md#positional-argument-ordering). This section retains the evidence and reasoning.

Three distinct workable patterns exist across the 4 tools — **not two**, as the question was originally framed.

| Tool | Pattern | Signature example | Default address? |
|------|---------|-------------------|------------------|
| cast | **Target-first positional** | `cast erc20 balance <token> <owner>` | No — every call re-specifies |
| Solana CLI | **Action-first positional** | `solana balance [ADDRESS]` (optional trailing) | Yes — from configured keypair |
| wallet-cli | **Verb-first flat** (REPL) | `getAccountResource [ADDRESS]` | Yes — from logged-in account |
| Aptos CLI | **Flag-based** | `aptos account balance --account 0xf1f2...` | Yes — from active profile |

Interpretation:

- **Option A — Target-first positional** (cast). Clean when there is NO default account; every command explicit. Cast proves this works for power users.
- **Option B — Action-first positional** (Solana, wallet-cli, current trongrid). Address as **optional trailing positional**, defaulting to a configured account when omitted. Works with a default-address concept.
- **Option C — Flag-based** (aptos). Address is never positional. Profile (or explicit `--address`) provides the value.

**Critical coupling**: the choice of ordering is interlocked with whether we want a "default address" feature.

- If **no default address**: Option A (cast's target-first) is the cleanest.
- If **default address via config**: Option B (action-first trailing positional) wins on ergonomics; Option C (flag-based) wins on clarity.

Aptos agent's framing, worth quoting: *"if we plan to let a config profile supply the default address, 'address-first positional' (account `<addr>` tokens) becomes incoherent — what do you type when the profile provides the address?"*

wallet-cli's verb-first naming (`getAccountResource`, `getAssetIssueByAccount`) is mild precedent for Option B in the TRON ecosystem specifically.

#### Quantitative scoring

10 dimensions, equal weight, 1–10 per dimension. Weights are deliberately not reshuffled to reflect any single user priority — readers can re-weight.

| Dimension | A `account <addr> tokens` | B `account tokens <addr>` | C `account tokens --address <addr>` |
|---|:-:|:-:|:-:|
| 1. Linguistic naturalness (possessive reading) | **9** | 6 | 4 |
| 2. CLI ecosystem consistency (git / kubectl / gh / aws) | 3 | **9** | 4 |
| 3. `--help` tree discoverability | 3 | **10** | **10** |
| 4. Default-address compatibility | 4 | **10** | **10** |
| 5. Commander.js implementation simplicity | 3 | **10** | 9 |
| 6. Muscle memory — editing aspect (last-word edit) | **8** | 6 | 4 |
| 7. Muscle memory — editing address | 4 | **8** | 7 |
| 8. Future write-command compatibility (`transfer` etc.) | 4 | **8** | **9** |
| 9. Uniformity with address-less commands (`chain parameters`, `block latest`) | 5 | **9** | **10** |
| 10. AI-agent generation friendliness | 5 | **9** | **10** |
| **Total** | **48** | **85** | **77** |

#### Why Option B beats Option A on "naturalness" despite A's surface appeal

Option A's apparent advantage is possessive reading ("X's tokens" / "TR... 的代币"), which does feel natural in spoken language. But this loses to B once you factor in three things:

1. **CLI grammar is imperative, not possessive.** Command lines are `[implicit verb] <noun> <aspect> <target>`. With the implicit `get` dropped for read-heavy CLIs, the structure is `<noun> <aspect> <target>` — which is exactly B, and exactly how tronscan users already phrase it mentally (`account balance TR...`). The possessive framing ("TR... 's balance") maps to a different grammar entirely, one that would require dropping `account` as a noun.
2. **Identifier-trailing is "約定俗优".** The convention isn't arbitrary — it comes from real ergonomics constraints: tab completion (finite sets come before infinite identifier space), shell-history re-use (last-word edits are cheapest), and `--help` tree form (finite subcommand lists must be in front). All three demand identifier-trailing.
3. **The "edit aspect" muscle-memory advantage vanishes with default address.** A's only practical edge is editing the aspect (last word) while reusing the address. But with `default_address`, users can drop the address entirely: `account tokens` → `account resources` → `account txs`, all using the default. This is cheaper than A's middle-address pattern.

#### Compensating mechanisms for B's linguistic loss

Option B does lose a small amount of linguistic naturalness vs A. This is recovered at three complementary layers, recorded in [`architecture.md` §Coupled decisions](./architecture.md#coupled-decisions):

1. **Default address** (Phase A+) — `trongrid account tokens` with no address uses the configured default. High-frequency users rarely type addresses at all.
2. **Smart identifier routing** (Phase B) — `trongrid TR7...` / `trongrid 0xabc...` / `trongrid 12345` without a subcommand auto-routes to `account view` / `tx view` / `block view`. Power users get a tronscan-URL shortcut without changing core grammar.
3. **Documentation prose framing** (Phase B) — help text and docs phrase commands possessively ("show the tokens of `<address>`") even though grammar is action-first. Naturalness lives in prose, not syntax.

#### Escape hatch

If 2+ years of real usage data shows trongrid has evolved into an "address-centric browser" (not a "TRON-version of cast"), switching to Option A is a breaking change — but while user count and command surface are small, the cost is bounded. Locking in B now is a commitment to the current trajectory, not a commitment to this ordering forever.

### Decision 2: Token decimals strategy

**Startling finding: none of the 4 tools do decimals well for arbitrary tokens.**

| Tool | Strategy | Gap |
|------|----------|-----|
| cast | Deliberately raw; user composes `cast erc20 balance` + `cast erc20 decimals` + `cast --to-unit` | No auto-resolution by design |
| Solana CLI | Always on-chain query via RPC `jsonParsed` encoding; returns `{amount, decimals, uiAmount, uiAmountString}` | No static cache; every query hits chain |
| wallet-cli | No framework; one hard-coded USDT wrapper. Raw sun for TRX. | TRC20 entirely unhandled |
| Aptos CLI | Zero formatting; raw u64 only; `TODO: Fungible assets` in source | "Modern reference" is broken |

**Differentiation opportunity**: trongrid-cli can beat all four with a **hybrid strategy**:

1. **Static decimals map** for top ~10–20 verified TRC20s (USDT, USDC, WTRX, WBTC, etc.) — avoids extra RPC calls on 95%+ of real-world balance queries.
2. **On-chain fallback** via `triggerConstantContract decimals()` for unknown tokens. The on-chain value is the source of truth on conflict.
3. **JSON output shape** (drop-in for current `account tokens` contract):

   ```json
   {
     "type": "TRC20",
     "contract_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
     "balance": "1234000",
     "decimals": 6,
     "balance_major": "1.234"
   }
   ```

   Follows scenario S2 in [`units.md`](./units.md): `{head}` + `decimals` + `{head}_major`. For `account tokens` the head word is `balance` (not `amount`) because the field represents an address's currently available token balance, aligning with the TIP-20 / EIP-20 standard `balanceOf(address) returns (uint256 balance)`. The word `amount` is reserved for write-side parameters (e.g., `transfer(to, amount)`) to keep read and write vocabularies distinct.
4. **Human output**: formatted by default (`1.234 USDT`), with `--raw` flag to show `1234000`.
5. **Document the tradeoff**: trongrid-cli's decision doc should state explicitly that we accept the ~1 extra RPC call for unknown tokens as the cost of human-friendly output.

This directly addresses the `account tokens` JSON output item in `docs/roadmap.md` (Phase A+ high-priority code fix).

### Patterns to adopt

1. **Global `--json` flag** — already shipping. Cast validates the choice.
2. **Network short aliases**: `-um` / `-us` / `-un` for mainnet/shasta/nile. Free win from Solana.
3. **Single binary** — validated by solana's fragmentation friction and aptos's single-binary model.
4. **"Nest only when earned"** (cast): flat by default, subcommand tree when a resource has 5+ verbs with shared state/options. Our current `account`, `tx`, `block` nesting already follows this.
5. **Docstring-driven help** (aptos): every command and flag carries a one-line description in-source; help stays in sync with code.
6. **Actionable error messages** (aptos): "Please provide X using `--foo` or run `trongrid auth login`" — name the fix, not just the problem.
7. **Auto non-TTY detection → JSON output** — avoids wallet-cli's non-pipeable trap without requiring users to remember `--json`.
8. **Address book / alias file** (wallet-cli) — lightweight future add.
9. **Layered config precedence**: flags > env vars > config file. Cast's `foundry.toml` + env + flags model.
10. **Graceful deprecation with in-place warnings** (cast): when we rename a command in the future, emit `warn: "old-name is deprecated, use new-name"` at call time.

### Patterns to avoid

1. **Binary fragmentation** — no `trongrid-keygen` or `trongrid-token` split; everything under one binary.
2. **Flat verb space at scale** — keep noun-verb structure; do not evolve into a 50-verb flat list.
3. **Plaintext keys in config file as the default** (solana, aptos) — require passphrase or OS keychain for mainnet, even if plaintext is acceptable for testnets.
4. **REPL-only / non-pipeable** (wallet-cli) — our primary mode is direct invocation.
5. **Raw-units-everywhere** (wallet-cli, aptos) — TRX by default, `--raw`/`--sun` for experts.
6. **Positional-overload with optional leading args** (wallet-cli's `freezeBalance [OwnerAddress] amount ...`) — use flags for optional-or-defaulted fields.
7. **Flag creep before consolidation** (cast's `--ether` → `--erc20` → `cast erc20` took 3 years) — decide noun-subtree boundaries in Phase B design, not Phase C.
8. **Untyped/unlabeled JSON** (cast's bare string balance) — every field named, every amount string-typed for precision.
9. **JSON-only human output** (aptos) — humans deserve formatted output too.
10. **JS floats in JSON amount fields** (solana's `uiAmount`) — always emit strings for numeric amounts.

### Command coverage checklist (from wallet-cli)

Phase B needs to feel complete to existing TRON power users. wallet-cli's command surface is the completeness checklist:

- **account**: `view`, `tokens`, `resources`, `net`, `permissions`, `txs`, `transfers`, `delegations`
- **resource** (Stake 2.0): `stake`, `unstake`, `delegate`, `undelegate`, `withdraw-expire`, `can-delegate`, `can-withdraw-unfreeze`
- **witness / sr**: `list`, `vote`, `brokerage`, `reward`, `withdraw-balance`, `create`, `update`
- **proposal**: `list`, `view`, `create`, `approve`, `delete`, `chain-parameters`
- **tx**: `view`, `send`, `info`, `sign-weight`, `count-by-block`
- **block**: `latest`, `view`, `count`, `by-number`, `by-id`
- **chain**: `parameters`, `bandwidth-prices`, `energy-prices`, `memo-fee`
- **asset** (TRC10): `list`, `issue`, `transfer`, `participate`, `get-by-account`
- **gasfree**: `info`, `transfer`, `trace`
- **contract / trigger**: `trigger`, `trigger-constant`, `estimate-energy`
- **wallet**: `list`, `import`, `generate`, `backup`, `ledger`

This is ~50 commands, aligning with the ~47 Phase B target.

## Decisions and open questions

Based on this research, the following Phase A+ decisions cluster into "ready to commit" vs "needs user input".

### Committed (2026-04-10)

1. **Global `--json` flag** — already implemented, validated by research.
2. **Single binary, no split** — validated against solana's fragmentation friction.
3. **Nest subcommands only when earned** (5+ verbs per resource).
4. **Network short aliases**: `-um` / `-us` / `-un`.
5. **Non-TTY auto-detection → JSON**.
6. **Token decimals: hybrid strategy** (static map for TRC-20 + on-chain fallback + TRC-10 via `/wallet/getassetissuebyid.precision`). `account tokens` JSON gains `decimals` + `balance_major` under the class B `{head}`/`decimals`/`{head}_major` shape; for this scenario `{head} = "balance"` per the read-side TRC-20 convention. Implements the `account tokens` improvement in `docs/roadmap.md` Phase A+ → Code quality fixes.
7. **Never emit JS floats in JSON** — always strings for numeric amounts.
8. **Actionable error messages** — apply during Phase B implementation review.
9. **Command argument ordering: Option B** (action-first positional). Canonical decision in [`architecture.md` §Positional argument ordering](./architecture.md#positional-argument-ordering). Evidence and scoring above in §Decision 1.
10. **Default address feature** (`config set default_address <addr>`). Blocker-resolved dependency of #9. Tracked in `docs/roadmap.md` Phase A+ → Feature additions.
11. **Smart identifier routing** — `trongrid <id>` without subcommand auto-routes. Tracked in `docs/roadmap.md` Phase B → item 4.
12. **Documentation prose framing** — help text uses possessive phrasing even though grammar is action-first. Tracked in `docs/roadmap.md` Phase B → item 2.

### Still open

1. **Config file structure**: flat `~/.config/trongrid/config.json` (current), or profile-based (aptos-style) with multi-network/multi-account? Profile model is cleaner for multi-network but adds mental overhead for solo users. **Recommendation**: stay flat for now; revisit if Phase B surfaces a concrete multi-network workflow that demands profiles.
2. **Auth storage**: keep plaintext (like aptos/solana current defaults) or require passphrase/OS keychain from day one? **Recommendation**: OS keyring (architecture.md already specifies "System keyring (from `trongrid auth login`)" as priority 1). Confirm current implementation matches, or flag as a Phase A+ gap.

### Suggested next steps

1. **Commit this doc** as `docs/design/competitors.md`.
2. **Decide the 4 interlocked questions** together — ideally in one design-review session.
3. **Update `docs/architecture.md`** with the chosen JSON contract for `account tokens` (adding `decimals` / `balance_major`; see `docs/design/units.md` for the full unit shape contract).
4. **Update `docs/design/commands.md`** if command ordering changes or if default-address flag is added.
5. **Implement Phase A+ code quality fixes** per `docs/roadmap.md`, informed by this research.
6. **Next research round**: TronScan + TronGrid MCP/Skills review (Phase A+ Design research item 2). User has provided 2 of 4 links (TronScan MCP + Skills); TronGrid MCP + Skills links still needed.
