# Unit Shape: JSON Output Contract for Quantities

> **TL;DR** — Every quantity field in `trongrid-cli --json` output follows a small set of orthogonal principles (P1–P7). Recurring combinations are captured as named scenarios (S1–S5) for quick reference. A new situation derives its shape by applying the principles; scenario labels are shortcuts, not a classification.

## 1. Problem

Raw integer amounts without metadata cause agents and humans to misread on-chain values by orders of magnitude. A bare `balance: 35216519` could plausibly be 35.2 TRX, 35.2 million TRX, or 35.2 USDT — the field name alone does not tell you. The risk compounds across ~20 read endpoints and ~6 write endpoints, some with resource-safety implications (a user sending 1 TRX thinking it is 1 sun is a six-order-of-magnitude failure).

We solve this once, for all quantity fields in the CLI's JSON output, with a contract that is:

- **Self-describing.** The JSON payload alone is sufficient to convert raw to display form — no out-of-band ecosystem glossary needed.
- **Agent-safe.** LLM agents without TRON domain priors still read correctly.
- **Composable.** Built from orthogonal principles that combine cleanly. New situations derive their shape by applying rules rather than pattern-matching against a fixed class list.

## 2. Principles

Seven orthogonal principles. Each addresses one axis. Together they describe every quantity-field situation in the CLI.

### P1 · Always provide the major-unit value

**Every quantity field must carry its major-unit display form. This is unconditional — it keeps human/agent communication grounded in natural units regardless of storage choice.**

Raw integer storage is a precision and wire-compatibility concession: blockchains transmit values as integers (often above 2^53) to avoid float rounding. This reflects *how* values are represented in transit, not *how* consumers should read them. P1 says: major is always present, full stop.

**Corollary — raw + major pairing.** When a field also carries a raw integer (the common case for `--json` output), raw and major MUST be paired. Emitting raw alone is a contract violation. This corollary follows mechanically from P1: we cannot ship a field that drops the major value the principle guarantees. When no raw integer is present (a purely derived or computed metric), P1 still demands the major form — the pairing corollary simply does not apply.

**Format rules**:

- Major value: always JSON `string`. Floating-point serialization is never acceptable — silent rounding above 2^53 corrupts large balances.
- Raw value: JSON `number` when ≤ 2^53 - 1 (safe integer range), otherwise `string`.

### P2 · Always provide conversion metadata when possible

**Every quantity that has convertible units must carry the metadata needed to reproduce that conversion from the payload alone.**

Without metadata, a consumer sees both raw and major forms but cannot independently verify their relationship. Self-describing JSON requires the relationship — either as a named unit or as an exponent — to be in the payload.

**Two forms of metadata:**

- **Named unit** (`{head}_unit: "sun"`): a string naming the minor unit when the unit has an ecosystem-recognized name (`sun`, `wei`, `satoshi`, `gwei`). Activates domain vocabulary — LLMs have priors on these terms from training data; TRON developers have muscle memory for "sun".
- **Exponent** (`decimals: N`): a numeric field giving the power-of-10 exponent. Universal mathematical fallback — usable when no named unit exists (arbitrary TRC-20 tokens).

**Corollary — retain unit when a minor-unit name exists.** If the minor unit has a standard name, emit `{head}_unit`. This is the named-unit branch of P2.

**Corollary — retain `decimals` when a non-trivial conversion exists.** If raw and major differ by any non-zero exponent, emit `decimals`. This is the exponent branch of P2.

**When both are available, emit both.** They are complementary, not alternatives — they answer different questions in different consumer contexts:

| Field | Answers | Audience |
|---|---|---|
| `{head}_unit` | *"What does the raw integer represent?"* (semantic label) | Humans reading ecosystem docs; vocabulary-aware consumers |
| `decimals` | *"How do I convert raw to major?"* (computational instruction) | Generic parsers; agents without ecosystem priors |

See P4 for when each is mandatory vs recommended.

### P3 · Cross-row uniformity with `_major`; bake the unit when single-token

**When an object's rows or children may carry different units, use the generic `_major` suffix so every row exposes the same field name. When an object is pre-committed to a single unit, bake the unit into the suffix (`_trx`, `_usdt`, `_usd`).**

`_major` is the universal fallback. Four forces drive it:

1. **Symbol unreliability.** Token symbols can contain Unicode characters (Chinese token names), special characters, or collide with existing field names. Not every symbol is a valid identifier.
2. **Multi-row uniformity.** `account tokens` returns heterogeneous tokens in one array. A per-token dedicated suffix (`balance_usdt` on the USDT row, `balance_usdc` on the USDC row) cannot be expressed as a common field name — consumers cannot write `rows[i].balance_<something>` generically. `_major` gives every row the same field so a single access path works.
3. **Semantic stability.** "Major unit" is a monetary term (major: TRX, USD; minor: sun, cent) that does not depend on which specific token the field represents. The suffix survives rebrands and symbol changes.
4. **Future-proof.** New tokens do not require new field names.

**The dedicated single-token exception.** When an object's *type* is pre-committed to one unit (a hypothetical `trongrid trc20 analyze usdt --address …` returning USDT-only metrics), the hardcoded suffix form is valid: `balance_usdt`, `staked_usdt`. The rule:

- Object's **type** fixes the unit → bake the unit into the field name (follows S1).
- Object's **rows** may carry different units → use generic `_major` (follows S2).

### P4 · Decimals: mandatory when variable, recommended when static

**If decimals vary per row or require runtime lookup, `decimals` MUST be emitted. If decimals are statically known to the shape, `decimals` SHOULD be emitted as bonus self-describing metadata.**

- **Variable decimals** (multi-token responses): different TRC-20 tokens have different decimals (USDT: 6, JST: 18). Agents reading a multi-token response cannot guess. Emission is **mandatory**.
- **Static decimals** (TRX `decimals: 6` fixed forever): derivable from the named unit, so strictly redundant. Emission is **recommended** (not merely allowed) for the four reasons below.

**Why emit static decimals anyway (the bonus rule).** Same four reasons that support P2's "both forms when both available":

1. **Self-contained JSON.** A consumer who does not know TRON's minor-unit vocabulary ("sun") can still compute the conversion from `decimals` alone. Without it, consumers must carry an out-of-band "sun → trx" glossary.
2. **Uniform parser.** A generic amount parser reads `{head}` + `decimals` + major field without branching on scenario. Without `decimals` in S1 objects, parsers need a special case ("if `_unit` is set, look up decimals from a unit glossary").
3. **Agent audit trail.** Agents can verify the server's conversion from the payload alone, without assuming "sun = 10⁻⁶ TRX". Self-describing data is safer than data that assumes ecosystem knowledge.
4. **Zero cost.** The field is static, small, and never requires runtime lookup. Marginal JSON bytes are trivial compared to the contract clarity gained.

**Prefix rule for `decimals`.** `decimals` is written bare (no prefix) when the object carries only one scalable quantity. When the object carries multiple — e.g., an account summary with both `balance` and `staked_balance` at potentially different decimals — use compound forms: `balance_decimals`, `staked_balance_decimals`. Bare `decimals` is unambiguous in the single-quantity case; compound forms are reserved for disambiguation. Never add prefixes speculatively.

### P5 · Explicit unit labels when ambiguity is plausible

**When a small or mid-tier LLM might not know the conventional default unit of a field, the field name must carry an explicit unit suffix.**

Expert conventions are reliable inside their community but fragile as training data for LLMs or documentation for newcomers:

- `marketcap` conventionally means "in USD" — but not universally. A crypto-native LLM may default to TRX or BTC.
- `price` depends entirely on denomination.
- `fee` may mean "gas fee in native token" or "service fee in USD" depending on context.

When default is uncertain, label it: `marketcap_usd`, `price_usd`, `fee_trx`.

**Recommendation hierarchy:**

- **(a) Strongly recommended for all industry-metric fields.** Domain-expert conventions are fragile as LLM training data; being explicit costs nothing and prevents misreads.
- **(b) Mandatory when multiple units coexist in the same object.** Unlabeled sibling fields in different units (a `price` field next to a `value` field at different denominations) are ambiguous regardless of domain expertise — labeling is the only safe resolution. Emit both and label each: `price_usd` + `price_trx`.

### P6 · Context-clear exemption

**When the field name plus the enclosing object unambiguously determines the unit, bare field names are acceptable.**

P5 says "label when ambiguous"; P6 is its reverse: some contexts remove ambiguity, and over-labeling becomes noise.

Examples:

- TRC-20 Transfer event: `event Transfer(from, to, uint256 _value)`. Inside a `Transfer` event object, `amount` (or `value`) is self-contextualized. `transfer_amount` would redundantly restate the context already established by the event type.
- "If you know, you know" (IYKYK) industry abbreviations inside domain-specific outputs — e.g., `delegated` inside a stake-resource output block.

P6 is a **stylistic exemption**, not a correctness rule. When in doubt, prefer P5 (explicit) over P6 (exempt). P6 exists to prevent noise, not to permit laziness.

### P7 · Upstream lock-in preservation

**Field names dictated by upstream APIs or write-side wire contracts are preserved verbatim. Unit guidance lives in prose, not in field renaming.**

Examples:

- `/wallet/getaccount` returns `balance`, `create_time`, etc. — propagated unchanged.
- `freezeBalanceV2` accepts `frozen_balance` as input — accepted unchanged.
- Transaction construction fields (`amount`, `to_address`) must match FullNode wire contracts.

Renaming these fields creates risk:

- **Write-side correctness.** A transaction constructed with renamed fields may be rejected or, worse, misinterpreted. Fund-loss bugs caused by unit misread are the highest-severity class in a CLI.
- **Ecosystem drift.** Users cross-referencing TronScan, wallet-cli, or TronWeb expect the same field names.

P7 is a **correctness constraint**, not a stylistic choice. When upstream and our preferred shape conflict, upstream wins. Unit guidance for locked fields lives in help text and command descriptions ("`amount` is in sun"), not in renaming.

## 3. Head word selection

Head words are the **semantic noun** of a quantity — the `{head}` placeholder in `{head}` + `decimals` + `{head}_major`. Head word choice is independent of all seven principles; it comes from the domain of the field.

**Default head word**: `amount` (generic). Use when no more specific semantic applies.

**Scenario table** (non-exhaustive; pick the head that best describes the concrete semantic):

| Situation | Head word | Rationale |
|---|---|---|
| Address's available TRC-20/TRC-10 balance (read-side) | `balance` | Matches TIP-20 / EIP-20 `balanceOf(address) returns (uint256 balance)`. Semantically `balance` is a **strict subset** of the generic `amount`. |
| Stake 2.0 staked amount | `staked_balance` or `staked` | Composite noun distinguishes from liquid `balance` when both appear in the same object. |
| Legacy Stake 1.0 frozen amount | `frozen_balance` | Matches the FullNode `frozen_balance` field (S5 alignment). |
| TRC-20 total supply | `total_supply` | Token metadata; single quantity per object. |
| TRC-20 allowance | `allowance` | Approval read; single quantity per object. |
| TRC-20 Transfer event value | `amount` or `value` | TIP-20 / EIP-20 event uses `_value`; we prefer `amount` inside a Transfer event (S4 context exemption) for readability. |
| Delegated resource amount | `delegated` | Inside a delegation output; context makes unit clear. |
| Write-side transfer parameter | `amount` | `transfer(to, amount)` convention; reserved for write-side to keep read/write vocabularies distinct. |
| Net asset value | `net_value` | Composite metric. |
| Fee outputs (energy, net, memo) | `energy_fee`, `net_fee`, `memo_fee` | Compound noun with the fee category. |
| Otherwise unlabeled | `amount` | Default fallback. |

**Key principle**: `balance` is NOT a fixed field name — it is the right choice for the "address's available token balance" situation. Other situations pick other heads. The `{head} + decimals + {head}_major` shape works for all of them.

## 4. Scenarios

Scenarios are **organizational shortcuts** for common principle combinations. They help readers recognize frequent shapes at a glance. A new situation derives its shape from P1–P7 first; the scenario label is assigned afterward for reference.

Ordered by commonality in `trongrid-cli` output, most common first.

### S1 · Named L1 native token

**Combines**: P1 + P2 (both named and exponent) + P3 (single-unit hardcoded suffix) + P4 (bonus static decimals).

**When**: single-native-currency read-side amounts denominated in an L1 token with an ecosystem-recognized minor unit. The canonical TRON case: any TRX quantity — balances, stakes, fees, rewards, delegation amounts.

**Shape**:

```json
{
  "balance": 35216519,
  "balance_unit": "sun",
  "decimals": 6,
  "balance_trx": "35.216519"
}
```

**TRON instances**: `account view` TRX balance, SR `rewards` claimable, stake `frozen_balance`, delegation amount, fee outputs (`energy_fee`, `net_fee`, `memo_fee`).

### S2 · Multi-currency scalable tokens

**Combines**: P1 + P2 (exponent only — no named minor unit per token) + P3 (generic `_major`) + P4 (mandatory decimals).

**When**: heterogeneous token rows in one response, variable per-row decimals, no shared minor-unit vocabulary.

**Shape**:

```json
{
  "type": "TRC20",
  "contract_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  "balance": "38927318000000000",
  "decimals": 6,
  "balance_major": "38927318000.0"
}
```

**Head word choice here — `balance`, not `amount`.** Rationale per §3: matches the TIP-20 / EIP-20 standard return parameter `balanceOf(address) returns (uint256 balance)`, and semantically denotes "currently available holding" (a strict subset of the generic `amount`). The word `amount` is reserved for write-side parameters to keep read and write vocabularies distinct.

**TRC-10 coverage**: TRC-10 uses the same shape and head word. Decimals come from `/wallet/getassetissuebyid.precision` rather than the `decimals()` contract view; most early TRC-10 tokens have `precision: 0`. Different fetch path, identical JSON contract.

**TRON instances**: `account tokens`, `token allowance`, TRC-20/10 metadata where a response scopes to multiple tokens.

### S3 · Industry metric

**Combines**: P1 + P3 + P5 (explicit unit labels to prevent default-assumption errors).

**When**: cross-domain metrics whose default unit is ambiguous for generalist agents — prices, market caps, ratios.

**Shape (single unit)**:

```json
{ "marketcap_usd": "1234567890" }
```

**Shape (multiple units coexist)**:

```json
{ "price_usd": "0.067", "price_trx": "0.42" }
```

**TRON instances**: token price feeds (Phase C), TRX market cap, gas cost comparisons across denominations.

### S4 · Context-clear event or bare naming

**Combines**: P6 exemption on top of P1 at the enclosing-object level.

**When**: the field sits inside an object whose type already fixes the unit. Over-labeling would be redundant noise.

**Shape**:

```json
{
  "event": "Transfer",
  "from": "TR...",
  "to": "TR...",
  "amount": "1234000"
}
```

**When NOT to use**: if the enclosing object could plausibly contain fields in different units, revert to P5 labeling (S3).

**TRON instances**: decoded TRC-20 Transfer events, TRC-10 transfer records, stake-resource blocks where the unit is clear from the block type.

### S5 · Upstream-locked

**Combines**: P7 — field names inherited from upstream.

**When**: read-through of FullNode response fields, write-side transaction parameters, or any field where renaming risks correctness.

**Shape**: whatever upstream gives. For example, `/wallet/getaccount` fields are passed through verbatim:

```json
{
  "balance": 12345,
  "create_time": 1600000000000,
  "frozen_balance": 1000000
}
```

**Unit guidance for S5 fields**: lives in help text and command descriptions ("`amount` is in sun", "`frozen_balance` is raw sun per Stake 2.0"), not in field renaming.

## 5. Worked example — deriving a new shape

Suppose Phase C adds `trongrid sr rewards <addr>` returning an SR's claimable rewards in TRX sun. Derive the shape by applying principles:

1. **P1** ✓ need major (mandatory); raw is also needed for precision → corollary requires raw + major pairing.
2. **P2** ✓ "sun" is a named minor unit → emit `reward_unit: "sun"`; TRX decimals are known (6) → also emit `decimals: 6` (both corollaries apply).
3. **P3** ✓ single unit (always TRX) → hardcode the major suffix as `_trx`.
4. **P4** bonus ✓ decimals static → recommended; already included per P2.
5. **P5 / P6 / P7** ✗ none apply — no ambiguity, no context exemption, no upstream lock-in.

Head word (§3): `reward` is more specific than the default `amount`, so use `reward`.

Derived shape:

```json
{
  "reward": 35216519,
  "reward_unit": "sun",
  "decimals": 6,
  "reward_trx": "35.216519"
}
```

Cross-check: matches S1. Sanity pass.

## 6. Principle selection cheat sheet

Quick reference when designing a new quantity field:

| Question | If yes | If no |
|---|---|---|
| Is the field a quantity? | Apply P1 (major always; raw+major when raw present) | Out of scope |
| Is the field name upstream-locked? | Preserve verbatim (P7), add prose guidance | Design freely |
| Does the minor unit have an ecosystem-recognized name? | Emit `{head}_unit` (P2) | Skip it |
| Are decimals statically known? | Emit `decimals` recommended (P4) | Emit `decimals` mandatory (P4) |
| Will rows in this response carry different units? | Generic `_major` suffix (P3) | Hardcoded `_<unit>` suffix (P3) |
| Is the conventional default unit ambiguous for agents? | Label explicitly (P5) | Consider P6 exemption |
| Does the enclosing object unambiguously determine the unit? | P6 exemption permits bare field name | Keep P5 labeling |

## 7. Scope

**Applies to**:

- All `--json` mode output from `trongrid-cli` commands.
- Any future sub-command contributing quantity fields to JSON.

**Does not apply to**:

- Human (non-JSON) output — formatting there is free to evolve.
- S5 fields inside a pass-through upstream response — those keep upstream names.
- Non-quantity fields (addresses, hashes, timestamps, booleans, enums).

## 8. Contract stability

Once a field is shipped in a `--json` contract, its name does not change. Human output can evolve freely. This is the core stability commitment of P1–P7: applying the principles up front removes the need for breaking changes later.

The principles themselves may evolve as new situations surface, but changes to principles are **additive and non-conflicting** by design — a new P8 or a refinement to P5 cannot force renaming an already-shipped field.
