# commander.js `.helpGroup()` on Sub-Command Leaves

Phase C's trial walkthrough (item #8) flagged an asymmetry in the help output: the top-level `trongrid --help` groups sub-commands under tidy headers like `Read commands:` and `Authentication & Configuration:`, but every per-parent help (`trongrid account --help`, `trongrid auth --help`, …) falls back to a flat `Commands:` list. The open question was whether commander.js exposes the same grouping primitive on leaves inside a parent, or whether `.helpGroup()` is reserved for the first level.

## Version tested

commander.js **v14.0.3**, pinned in `package.json` (`"commander": "^14.0.3"`).

## Type signature

From `node_modules/commander/typings/index.d.ts:997`:

```ts
/**
 * Set the help group heading for this subcommand in parent command's help.
 *
 * @returns `this` command for chaining
 */
helpGroup(heading: string): this;
```

The signature is attached to `Command`, not a specialised top-level variant, so in principle any sub-command — leaf or not — can claim a group heading in its parent's help output.

## Experiment

A minimal program registered four leaves under a single `parent` container, tagging three with `.helpGroup()` and leaving one untagged:

```
Usage: x parent [options] [command]

Options:
  -h, --help      display help for command

Group A:
  leaf1           first leaf
  leaf3           third leaf

Group B:
  leaf2           second leaf

Commands:
  leaf4           fourth leaf (no group)
  help [command]  display help for command
```

Two behaviours worth noting:

1. Leaves with the same heading cluster under that heading, in registration order.
2. Leaves without a heading fall through to commander's default `Commands:` header, which still hosts the auto-generated `help` entry regardless.

## Decision

**Supported.** Phase D P9 applies `.helpGroup()` to every leaf across the six parent containers so that `trongrid <parent> --help` mirrors the grouping style of the top-level help.

## Application plan

The goal is label consistency first, functional grouping second. Homogeneous parents get a uniform label so the header text reads the same at every level of the help tree; heterogeneous parents split by intent (read vs. state-changing vs. credentials) to match how the top-level help already categorises them.

| Parent | Leaves | Header(s) |
|---|---|---|
| `account` | `view`, `resources`, `tokens`, `txs` | `Read commands:` (all) |
| `block` | `view`, `latest` | `Read commands:` (all) |
| `token` | `view` | `Read commands:` |
| `tx` | `view` | `Read commands:` |
| `auth` | `login`, `logout` → `Credentials:`; `status` → `Read commands:` |
| `config` | `set` → `Write commands:`; `get`, `list` → `Read commands:` |

For the homogeneous parents the change is cosmetic (`Commands:` → `Read commands:`), but keeping the label consistent with the top-level `Read commands:` group means a reader scanning any slice of the help tree sees the same vocabulary. For `auth` and `config` the grouping is load-bearing: it surfaces that `login`/`logout` and `config set` mutate local state, while everything else is a pure query.

The parent container registrations themselves (e.g. `parent.command("account").helpGroup("Read commands:")`) are untouched — those drive the top-level grouping and are already correct as of Phase C.
