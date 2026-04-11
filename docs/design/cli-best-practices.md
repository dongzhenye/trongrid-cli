# CLI Best Practices for Humans and Agents

Design checklist derived from the Google Cloud Tech article *"Build a CLI for AI agents & humans"* (March 2026, by Hinoy Chinoy, Shubham Saboo, and Zack Akil), cross-checked against `trongrid-cli`'s current state. The review is deliberately a pre-Phase-B sanity pass: spending 30 minutes to align on global principles now is cheaper than refactoring 47 commands later.

This doc is **normative** for new commands and **retrospective** for existing ones. Gaps become roadmap entries tracked under Phase A+ / Phase B.

---

## Core philosophy

> Every CLI built in 2026 will be called by an agent at some point. Most aren't ready for it.

The article's central thesis is that interactive prompts, colored output, and terminal UIs all break the moment an automated agent tries to parse the result — but stripping them makes the CLI worse for humans. The answer is not to pick one audience: it's to **decouple the data from the presentation**. Treat the CLI's internal logic as an engine that emits data; the terminal UI is one possible client of that engine. Same command, two renderers.

Concrete shape from the article:

```bash
# Human gets the interactive TUI
a2acli watch --task abc123

# Agent gets structured NDJSON
a2acli watch --task abc123 --no-tui
```

`trongrid-cli`'s equivalent pattern is already in place via `--json` (no TUIs yet, so the human side is plain formatted text rather than Bubble Tea). As the surface grows in Phase B, the dual-audience commitment becomes load-bearing.

---

## Scorecard

Legend: ✅ done · ⚠️ partial · ❌ missing · N/A not applicable yet

| Pillar | Sub-item | Current | Priority |
|---|---|---|---|
| 1. Structured discoverability | Grouped help by function (category labels) | ⚠️ | Pre-B |
| 1. Structured discoverability | Short / Long / Examples per command | ⚠️ (Short only) | Pre-B |
| 1. Structured discoverability | Entry-point hints (`start here`) | ❌ | Pre-B |
| 1. Structured discoverability | `AGENTS.md` at repo root | ❌ | Pre-B |
| 1. Structured discoverability | `skills/` directory with per-command skill prompts | ❌ | Phase B |
| 2. Agent-first interoperability | `--json` on every data command | ✅ | — |
| 2. Agent-first interoperability | `NO_COLOR` + non-TTY auto-detection | ✅ | — |
| 2. Agent-first interoperability | `[APP]_NO_TUI` env var | N/A (no TUI yet) | Phase B |
| 2. Agent-first interoperability | Non-interactive fallback when stdout is piped | ✅ (all output is non-interactive today) | — |
| 2. Agent-first interoperability | Pre-sort output by importance | ❌ | Phase B |
| 2. Agent-first interoperability | Context-window safety: truncate / mask sensitive data | ⚠️ | Phase B |
| 2. Agent-first interoperability | Stateless (reference IDs) | ✅ | — |
| 3. Configuration and context | XDG config location | ✅ | — |
| 3. Configuration and context | Named environments (`--env` with bundled URL + token) | ❌ | **Pre-B decision** |
| 4. Error guidance | Contextual `Hint:` lines | ⚠️ | Pre-B |
| 4. Error guidance | Fail fast on missing prerequisites | ⚠️ | Pre-B |
| 4. Error guidance | Deterministic exit codes (0 / 1 / 2 / 3) | ❌ | Pre-B |
| 5. Flag and argument consistency | Standardized shorthands | ✅ | — |
| 5. Flag and argument consistency | Positional for entities, flags for modifiers | ✅ | — |
| 5. Flag and argument consistency | Safe defaults | ✅ | — |
| 6. Visual design | Semantic color tokens (not raw `dim` / `red`) | ❌ | Pre-B |
| 6. Visual design | Reserve color for state, not description | ⚠️ | Phase B |
| 6. Visual design | Whitespace over color for hierarchy | ⚠️ | — |
| 6. Visual design | Adaptive light/dark | ❌ | Phase B |
| 7. Versioning and lifecycle | `--version` | ✅ | — |
| 7. Versioning and lifecycle | SIGINT graceful handling | N/A (read-only today) | Phase B (when writes land) |
| 7. Versioning and lifecycle | Actor tracking on writes | N/A | Phase B |
| 7. Versioning and lifecycle | Update notifications | ❌ | Phase C |

**Summary:** 10 ✅, 9 ⚠️, 7 ❌, 3 N/A. We're in reasonable shape on pillars 2 / 3 / 5 / 7, and have concrete gaps in pillars 1 / 4 / 6. The biggest structural unknown is pillar 3's `--env` question — which needs a design call, not just code.

---

## 1. Structured discoverability

The `--help` output is both audiences' first contact point. Agents use it to figure out which command to call; humans skim it to orient themselves.

### Principles from the article

- Group commands by **function**, not alphabetically. Categories like `Task Management`, `Information`, `Configuration` prevent wall-of-text help.
- Mark entry points explicitly with hints like `(start here)` or `(typical first step)`.
- Populate three fields for every command:
  - **Short** — one-line, 5–10 words, action verb first.
  - **Long** — what it does, why, how it differs from siblings.
  - **Example** — 3–5 concrete, copy-pasteable snippets.
- Examples matter more than descriptions. Humans copy-paste; agents infer flag patterns from the example.
- External agent directives: `AGENTS.md` at the repo root, `skills/` directory for complex commands.

### Current state

- **Grouping.** commander.js groups commands by parent in its default help output (`trongrid account --help` shows account subcommands, `trongrid --help` shows the top level). This is automatic structural grouping but not *semantic categorization* — we do not label categories like `Information` / `Write ops`. ⚠️
- **Short descriptions.** Every command has a `.description()` string. ✅
- **Long descriptions + examples.** Not populated. commander.js supports `.addHelpText("after", "...")` for examples per command, and we use it nowhere. ❌
- **Entry-point hints.** Not marked anywhere. ❌
- **AGENTS.md.** We do not ship one. ❌
- **`skills/` directory.** Not yet. ❌

### Actions

- **Pre-B:** Decide category labels for the current ~7 commands and the Phase B target ~47. Likely groups: `Read` (account / tx / block / token / contract / sr / proposal / param), `Network` (energy / bandwidth / network), `Auth & Config` (auth / config). Mark the commands agents are most likely to start with — `account view`, `tx view`, `block latest` — as `(typical first step)`.
- **Pre-B:** Populate Long descriptions and at least 3 examples per shipped command. Low per-command effort, large UX payoff.
- **Pre-B:** Ship `AGENTS.md` at repo root — codify invocation rules, default env, how to parse `--json` output, the class-A/S1 and class-B/S2 field shapes, and the recommended first commands.
- **Phase B:** Consider a `skills/` directory if command complexity grows beyond what `AGENTS.md` can comfortably hold.

---

## 2. Agent-first interoperability

Being usable by agents means being parseable and predictable.

### Principles from the article

- `--json` / `--no-tui` on every data-producing command. Output must be valid JSON or NDJSON.
- Support `NO_COLOR` and `[APP]_NO_TUI` environment variables. When stdout is piped, skip all interactive elements.
- Non-interactive fallback: TUIs should always have a plain mode.
- Protect the context window — actively truncate large blobs and mask secrets in default output. Require `--full` / `--verbose` for raw unfiltered payloads.
- Pre-sort data by importance: severe items at the top, not in upstream order.
- Delegated state: stateless CLI, backend holds long-running token context and conversation history. Use reference IDs (`--task <ID>`).

### Current state

- **`--json` everywhere.** Global `-j / --json` flag is respected by all seven shipped read commands. ✅
- **`NO_COLOR` support.** Just wired in Task 4 (`applyNoColorFromOptions` in `src/utils/color.ts`). `--no-color` sets `NO_COLOR=1` in `process.env` before any command action runs; `node:util`'s `styleText` reads `NO_COLOR` at call time and strips ANSI. Non-TTY stdout also auto-strips via `styleText`'s TTY detection. ✅
- **`[APP]_NO_TUI` env var.** No TUI yet, so not applicable. Track for Phase B if we add Bubble Tea-style interactive views.
- **Non-interactive fallback.** No interactive prompts shipped. All output is non-interactive today — good by default. ✅
- **Pre-sort by importance.** We return data in upstream order. For `account tokens`, this means FullNode's native ordering rather than "most valuable token first". Low risk today (small per-account lists), but an agent scanning a large portfolio would appreciate sort-by-value. ❌
- **Context window safety.** We do not auto-truncate long responses. We also do not explicitly mask secrets — but the only secret the CLI handles is the API key, which is never rendered in output (only referenced via `auth login`). ⚠️
- **Stateless.** No session state; every invocation is independent; we use reference IDs (`<address>`, `<hash>`, `<number>`). ✅

### Actions

- **Phase B:** Consider `account tokens` sort-by-value (descending `balance_major`) as the default. Add `--order raw` to opt back to upstream order. Check with user's agent-facing preference.
- **Phase B:** For event-log commands (`contract events`, `tx transfers`), define truncation policy. Default cap at 20 entries, `--full` to remove the cap.
- **Phase B:** When writes land, audit outputs for inadvertent secret exposure (private keys, API tokens).

---

## 3. Configuration and context

A CLI should understand its environment without requiring flags on every call.

### Principles from the article

- **Follow XDG.** `~/.config/<app>/config.yaml`. No dotfiles in the home directory.
- **Named environments.** `--env local` / `--env staging` / `--env prod`, each bundling service URL + token. An orchestrator can switch context with one flag without knowing any URLs or tokens.

### Current state

- **XDG.** `~/.config/trongrid/config.json`. ✅
- **Named environments.** We have `--network` (mainnet / shasta / nile) which is *similar* to named environments but narrower — it selects a FullNode URL but does not bundle an API key or any other per-env context. Switching from mainnet (read-heavy) to shasta (dev testing) today means re-running `auth login` or re-setting `TRONGRID_API_KEY` manually. ❌

### Decision (2026-04-11): keep `--network`, do not migrate to `--env`

We evaluated three paths (flat `--network` / full `--env` / hybrid internal env with `--network` façade) and committed to keeping `--network` as-is.

**Reasons**:

1. **`--network` reads more naturally at the user surface.** TRON has three named networks; `--network shasta` is how every other TRON tool phrases it, and user muscle memory is strong.
2. **The agent benefits the article lists do not currently exist for `trongrid-cli`:**
   - **Per-env API keys** — shasta and nile are free testnets that do not require or support API keys. Only mainnet has keys. The `--env` framing assumes each env carries its own credentials, but we only have one credential scope in practice.
   - **Per-env default address** — a user operates in one context at a time. The global `default_address` that Phase A+ introduced is the right shape; there is no "dev wallet" vs "prod wallet" split that a TRON user needs per network.
   - **Output preferences** — `--json` / `--verbose` / `--fields` are per-user, not per-env. A user does not want shasta to default to JSON and mainnet to default to human; they want their preferred format everywhere.
   - **Custom FullNode URLs / corp deployments** — not a current requirement. YAGNI.
3. **Revisit if and when any of the four preconditions above emerge.** The migration cost from `--network` to `--env` (or to a hybrid internal shape) stays bounded: config files are private to each user, the flag surface is small, and the semantics are clean. Deferring the decision until a real driver exists is cheaper than speculative restructuring.

**Commitment:** `--network` stays as the user-facing flag. Config stays flat (`{network, apiKey, default_address}`). No per-env scoping is added to `config set` / `resolveAddress`. If any of the four preconditions emerges later (e.g., a user asks for corp FullNode support), reopen this decision.

---

## 4. Error guidance

Don't just report errors — provide a path to resolution.

### Principles from the article

- **Contextual hints.** When a command fails due to a missing prerequisite, include a `Hint:` line pointing at the fix. Agents parse hints to self-correct; humans appreciate not having to search docs.
- **Fail fast.** Validate configuration and connectivity before executing expensive logic. Don't let an agent wait 30 seconds for an API call only to discover the auth token is missing.
- **Deterministic exit codes:**
  - `0` — success
  - `1` — general error
  - `2` — invalid usage / bad flags
  - `3` — connection / auth failure
- If the CLI returns `0` on a failed operation because "the command itself ran," automation breaks.

### Current state

- **Contextual hints.** One exemplar exists: `resolveAddress` emits a multi-line aptos-style hint ("No address provided and no default is configured. Pass an address or run `trongrid config set default_address <addr>`"). It is the only systematic hint in the codebase. Other error paths — address format errors, HTTP errors from TronGrid, missing transactions — are bare messages. ⚠️
- **Fail fast.** Address-format validation runs before any API call. Auth presence is not checked up front — the API call itself is what fails when a key is missing or invalid. This is fine for rate-limited queries but poor for "30-second call finally fails" scenarios. ⚠️
- **Exit codes.** Every `printError` path exits with `process.exit(1)`. Usage errors (bad flag parse) exit via commander's default (also 1). Network failures from Task 1's new wrapper produce `TrongridError` with `status: 0` but still exit `1`. ❌

### Actions

- **Pre-B:** Extend `printError`'s signature to accept an optional `hint: string`. Systematically add hints for the common failure modes:
  - `Error: API key not configured. Hint: run "trongrid auth login" or set TRONGRID_API_KEY.` (401/403)
  - `Error: Transaction not found: <hash>. Hint: check the hash, or try --network shasta if this was on a testnet.` (tx/view)
  - `Error: Invalid TRON address. Hint: Base58 starts with T (34 chars); Hex starts with 41 (42 chars).` (address validation)
- **Pre-B:** Introduce a deterministic exit-code scheme matching the article:
  - `0` success
  - `1` general / unexpected error (fallback)
  - `2` usage error (bad flag / bad positional / unknown command) — map via commander's `.exitOverride()`
  - `3` network / auth failure — map via `TrongridError.status === 0` or `401/403`
- **Pre-B:** Add a minimal fail-fast check: `auth status --check` style that resolves the API key once at `preAction` and short-circuits with exit 3 if the command is going to hit a rate-limited endpoint without a key. Reuse the existing "Tip" message infrastructure.

---

## 5. Flag and argument consistency

Predictability means an intuition learned on one command carries to the rest.

### Principles from the article

- **Standardized shorthands.** `-o` must mean the same thing everywhere. Inconsistency breaks agentic reasoning.
- **Positional for required entities, flags for optional modifiers.**
- **Safe defaults.** The default behavior is the safest, most common path. Destructive actions mandate an explicit flag.

### Current state

- **Shorthands.** Global flags use `-j / -n / -v / -l / -f` — unique, consistent, no clashes with commander's auto-`-h` / `-V`. ✅
- **Positional vs optional.** Current commands use `<address>` / `[address]` / `<hash>` / `<number>` as positionals, with all options as flags. `[address]` was introduced in Phase A+ for optional fallback via `default_address`. ✅
- **Safe defaults.** No destructive commands shipped yet. Default network is mainnet (read-only). When writes land in Phase B, the rule becomes: `--confirm` (or similar) must be explicit for anything that mutates state or spends resources. ✅

### Actions

- **Phase B:** When introducing write operations (`account transfer`, `tx broadcast`, stake commands), enforce a `--yes` / `--confirm` requirement for non-interactive invocation and a prompt for interactive invocation. Follow `gh`'s `--yes` convention.

---

## 6. Visual design for terminals

Color should serve a functional purpose, not an aesthetic one.

### Principles from the article

- **Semantic color tokens**, not raw color names. This keeps the palette consistent and makes light/dark adaptation trivial. The article proposes seven tokens:
  - `Accent` (landmarks): headers, group titles, section labels
  - `Command` (scan targets): command names, flags
  - `Pass` (success): completed tasks, success states
  - `Warn` (transient): active tasks, warnings
  - `Fail` (error): failed tasks, errors, rejected states
  - `Muted` (de-emphasis): metadata, types, defaults, previews
  - `ID` (identifiers): unique IDs (task IDs, skill IDs)
- **Reserve color for state.** Green = success, yellow = warning, red = error, grey = metadata. Do not color descriptions or help text — over-coloring produces rainbow output where nothing stands out.
- **Whitespace over color for hierarchy.** Positioning and alignment convey structure better than colors.
- **Adaptive light/dark.** Maintain contrast across themes.

### Current state

- **Semantic tokens.** We use raw `styleText("dim", ...)` / `styleText("red", ...)` in scattered places. No semantic layer. ❌
- **Reserve color for state.** `printError` uses red for error messages — correct. `styleText("dim", ...)` is used for metadata (auth tip, command hints, `(raw ...)` suffixes in account tokens rendering, type tags like `[TRC20]`). This maps loosely to `Muted`. Success state has no color (no green checkmarks). Warnings have no color. ⚠️
- **Whitespace over color.** `formatKeyValue` aligns columns with `padEnd` for human output — good. Token rendering uses `padEnd(35)` for contract address. ⚠️ (applied but not systematically).
- **Adaptive.** `styleText` respects `NO_COLOR` but does not adapt dark/light. We have not checked contrast on a light background. ❌

### Actions

- **Pre-B:** Introduce `src/output/colors.ts` with the seven semantic tokens from the article. Callers use `colors.accent("Header")` / `colors.muted("metadata")` / `colors.fail("Error")` instead of raw `styleText` calls. Migrate existing callers (printError, account tokens rendering, auth tip) to the new palette.
- **Phase B:** When dashboard-style output lands (`block stats`, `account resources` with graph-like output), apply the palette systematically. Audit on a light terminal background — at least iTerm2 `Solarized Light`.
- **Phase B:** Consider a small "terminal snapshot" test harness that captures rendered output (with ANSI stripped) for regression checks on the human path.

---

## 7. Versioning and lifecycle

A CLI is not a static artifact. Versions drift, operations get interrupted, writes need audit trails.

### Principles from the article

- `--version` on the root command. Optional: notify users of significant updates since the last run.
- Handle `SIGINT` (Ctrl-C) gracefully. No data corruption when someone — or an agent — kills a running operation.
- Track the "actor" on write operations (derived from `git config user.name` or `$USER`) for audit trails.

### Current state

- **`--version`.** `.version("0.1.0")` at program level — commander auto-wires `-V` / `--version`. ✅
- **SIGINT graceful.** Not handled. All shipped commands are read-only reads with no persistent state, so Ctrl-C during a `fetch()` just aborts cleanly. When writes land (broadcasting a signed tx, for example), this becomes load-bearing. N/A today.
- **Actor tracking.** No writes yet. N/A today.
- **Update notifications.** Not implemented. Low priority until we publish to npm. ❌

### Actions

- **Phase B:** When the first write command lands, add a `SIGINT` handler that (a) completes any in-flight network request, (b) does not partially update any persistent state, (c) exits with code 130 (the conventional Ctrl-C code).
- **Phase B:** When writes land, record the actor (`git config user.name`, `$USER`, or `--actor <name>`) on every broadcast for local audit log.
- **Phase C:** Post-publish, add a latest-version check against the npm registry on each invocation (silent 24-hour cache).

---

## Phase A+ closure scope vs Phase B scope

### Close before Phase B (pre-B)

These gaps are cheap to fix now and would be more expensive to fix once Phase B has baked ~40 more commands around them:

1. **`AGENTS.md` at repo root** — one new file, ~150 lines of content.
2. **Grouped help categories + Long / Example per command** — touches every command's registration, but each command is 5–10 lines of additional help text.
3. **Entry-point hints** (`(typical first step)` on `account view`, `tx view`, `block latest`).
4. **`Hint:` line in `printError`** — 5-line signature change + ~10 call sites to enrich.
5. **Deterministic exit codes 0 / 1 / 2 / 3** — commander's `.exitOverride()` hook + `TrongridError` status mapping.
6. **Semantic color tokens** — new `src/output/colors.ts` module with seven exports; migrate existing callers.
7. **`--network` vs `--env` decision** — design call, not code. Commit the decision so Phase B doesn't have to revisit.

### Phase B scope (during first-release expansion)

8. Pre-sort output by importance where it matters (account tokens, events).
9. `--yes` / `--confirm` discipline for write commands.
10. `SIGINT` graceful handling (once writes exist).
11. Actor tracking on write operations.
12. Context-window truncation policy for list/event commands.
13. Adaptive light/dark terminal palette audit.
14. `skills/` directory for complex commands (if complexity warrants beyond `AGENTS.md`).

### Phase C scope (post-launch)

15. Update notifications from npm registry.
16. `[APP]_NO_TUI` env var (if TUIs land).

---

## References

- **Source article**: [Google Cloud Tech — *"Build a CLI for AI agents & humans in less than 10 mins"*](https://x.com/GoogleCloudTech/article/2038778093104779537). By Hinoy Chinoy ([@ghchinoy](https://x.com/ghchinoy)), Shubham Saboo ([@Saboo_Shubham_](https://x.com/Saboo_Shubham_)), and Zack Akil. Published March 2026 as an X long-form article.
- **Inspiration cited by the article**: [Stevey Yegge — Beads UI philosophy](https://github.com/steveyegge/beads/blob/main/docs/UI_PHILOSOPHY.md)
- **Community standard**: [clig.dev — Command Line Interface Guidelines](https://clig.dev/)
- **Internal cross-references:**
  - [`architecture.md`](../architecture.md) — project-wide tech decisions
  - [`commands.md`](./commands.md) — command grammar design + full reference
  - [`competitors.md`](./competitors.md) — four-tool CLI research backing argument-ordering and token-decimals decisions
  - [`units.md`](./units.md) — JSON output unit shape contract
