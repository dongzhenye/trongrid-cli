# Phase A: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundational CLI architecture with 7 core commands that validate the end-to-end data flow: user input → commander → API client → TronGrid API → output formatter.

**Architecture:** TypeScript CLI using commander.js for arg parsing, native fetch for HTTP, `node:util` styleText for terminal colors. Single API client handles auth injection (env var > config file > no-key). Output layer supports human-readable (default) and JSON (`--json`) modes. One folder per resource, one file per action.

**Tech Stack:** TypeScript 5.x, commander.js, Biome, Bun (dev runtime + test runner), Node.js 22+ (user runtime)

**Spec:** [architecture.md](../architecture.md), [commands.md](../designs/commands.md), [roadmap.md](../roadmap.md)

---

## File Map

### Infrastructure

| File | Responsibility |
|------|---------------|
| `package.json` | Package metadata, bin, scripts, deps |
| `tsconfig.json` | TypeScript config targeting ES2022/Node22 |
| `biome.json` | Linting + formatting |
| `src/index.ts` | Entry point, commander program, global flags |
| `src/api/client.ts` | HTTP client: fetch wrapper, auth injection, network selection, error handling |
| `src/api/types.ts` | API response type definitions |
| `src/output/format.ts` | Dual output: human tables/kv + JSON, unit conversion (sun→TRX), styleText colors |
| `src/auth/store.ts` | Read/write API key from config file + env var |
| `src/utils/config.ts` | Config file (~/.config/trongrid/config.json) read/write |
| `src/utils/address.ts` | TRON address validation (Base58 + Hex) |

### Commands (Phase A)

| File | Command | API Endpoints |
|------|---------|--------------|
| `src/commands/block/latest.ts` | `block latest` | getNowBlock |
| `src/commands/account/view.ts` | `account view <addr>` | getAccount |
| `src/commands/account/tokens.ts` | `account tokens <addr>` | getAccountInfo (TRC20) + getAssetIssueByAccount (TRC10) |
| `src/commands/account/resources.ts` | `account resources <addr>` | getAccountResource + getAccountNet |
| `src/commands/tx/view.ts` | `tx view <hash>` | getTransactionById + getTransactionInfoById |
| `src/commands/auth/login.ts` | `auth login` | — (local) |
| `src/commands/auth/status.ts` | `auth status` | — (local) |
| `src/commands/config/set.ts` | `config set <key> <value>` | — (local) |
| `src/commands/config/get.ts` | `config get <key>` | — (local) |
| `src/commands/config/list.ts` | `config list` | — (local) |

### Tests

| File | Tests |
|------|-------|
| `tests/api/client.test.ts` | HTTP client, auth injection, error handling |
| `tests/output/format.test.ts` | Human + JSON formatting, sun→TRX conversion |
| `tests/auth/store.test.ts` | API key storage, priority resolution |
| `tests/utils/config.test.ts` | Config read/write/defaults |
| `tests/utils/address.test.ts` | Address validation |
| `tests/commands/block-latest.test.ts` | block latest command |
| `tests/commands/account-view.test.ts` | account view command |
| `tests/commands/tx-view.test.ts` | tx view command |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `src/index.ts` (stub)

- [ ] **Step 1: Initialize project with Bun**

```bash
cd /Users/dongzhenye/projects/trongrid-cli
bun init -y
```

- [ ] **Step 2: Replace package.json with proper config**

```json
{
  "name": "trongrid",
  "version": "0.1.0",
  "description": "CLI for TronGrid — query TRON blockchain from terminal or AI agent",
  "type": "module",
  "bin": {
    "trongrid": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "test": "bun test",
    "start": "node dist/index.js"
  },
  "engines": {
    "node": ">=22"
  },
  "files": [
    "dist"
  ],
  "keywords": ["tron", "trongrid", "blockchain", "cli"],
  "license": "MIT",
  "author": "Zhenye Dong"
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  }
}
```

- [ ] **Step 5: Install dependencies**

```bash
bun add commander
bun add -d typescript @types/node @biomejs/biome
```

- [ ] **Step 6: Create entry point stub**

Create `src/index.ts`:

```typescript
#!/usr/bin/env node
console.log("trongrid-cli stub");
```

- [ ] **Step 7: Verify build**

```bash
bun run build && node dist/index.js
```

Expected: prints "trongrid-cli stub"

- [ ] **Step 8: Add .gitignore**

Create `.gitignore`:

```
node_modules/
dist/
.env
```

- [ ] **Step 9: Commit**

```bash
git init
git add package.json tsconfig.json biome.json src/index.ts .gitignore README.md docs/
git commit -m "chore: scaffold project with typescript, commander, biome"
```

---

## Task 2: Config System

**Files:**
- Create: `src/utils/config.ts`
- Create: `tests/utils/config.test.ts`

- [ ] **Step 1: Write failing tests for config**

Create `tests/utils/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readConfig, writeConfig, getConfigValue, setConfigValue } from "../src/utils/config.js";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, ".tmp-config-test");

describe("config", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("returns default config when file does not exist", () => {
    const config = readConfig(join(TEST_DIR, "config.json"));
    expect(config.network).toBe("mainnet");
  });

  it("writes and reads config", () => {
    const path = join(TEST_DIR, "config.json");
    writeConfig(path, { network: "shasta" });
    const config = readConfig(path);
    expect(config.network).toBe("shasta");
  });

  it("sets individual config value", () => {
    const path = join(TEST_DIR, "config.json");
    setConfigValue(path, "network", "nile");
    expect(getConfigValue(path, "network")).toBe("nile");
  });

  it("preserves existing values when setting a new one", () => {
    const path = join(TEST_DIR, "config.json");
    writeConfig(path, { network: "shasta" });
    setConfigValue(path, "network", "nile");
    const config = readConfig(path);
    expect(config.network).toBe("nile");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/utils/config.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement config module**

Create `src/utils/config.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface TrongridConfig {
  network: string;
  apiKey?: string;
}

const DEFAULT_CONFIG: TrongridConfig = {
  network: "mainnet",
};

export const CONFIG_DIR = join(homedir(), ".config", "trongrid");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function readConfig(path: string = CONFIG_PATH): TrongridConfig {
  try {
    const raw = readFileSync(path, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(
  path: string = CONFIG_PATH,
  config: Partial<TrongridConfig>,
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const existing = readConfig(path);
  const merged = { ...existing, ...config };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n");
}

export function getConfigValue(
  path: string = CONFIG_PATH,
  key: string,
): string | undefined {
  const config = readConfig(path);
  return config[key as keyof TrongridConfig] as string | undefined;
}

export function setConfigValue(
  path: string = CONFIG_PATH,
  key: string,
  value: string,
): void {
  writeConfig(path, { [key]: value });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/utils/config.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/config.ts tests/utils/config.test.ts
git commit -m "feat: add config system with read/write/defaults"
```

---

## Task 3: Auth Store

**Files:**
- Create: `src/auth/store.ts`
- Create: `tests/auth/store.test.ts`

- [ ] **Step 1: Write failing tests for auth store**

Create `tests/auth/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { resolveApiKey } from "../src/auth/store.js";
import { writeConfig } from "../src/utils/config.js";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dirname, ".tmp-auth-test");
const TEST_CONFIG = join(TEST_DIR, "config.json");

describe("resolveApiKey", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    delete process.env.TRONGRID_API_KEY;
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    delete process.env.TRONGRID_API_KEY;
  });

  it("returns env var when set", () => {
    process.env.TRONGRID_API_KEY = "env-key-123";
    expect(resolveApiKey(TEST_CONFIG)).toBe("env-key-123");
  });

  it("returns config file key when env var is not set", () => {
    writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
    expect(resolveApiKey(TEST_CONFIG)).toBe("config-key-456");
  });

  it("prefers env var over config file", () => {
    process.env.TRONGRID_API_KEY = "env-key-123";
    writeConfig(TEST_CONFIG, { apiKey: "config-key-456" });
    expect(resolveApiKey(TEST_CONFIG)).toBe("env-key-123");
  });

  it("returns undefined when neither is set", () => {
    expect(resolveApiKey(TEST_CONFIG)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/auth/store.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement auth store**

Create `src/auth/store.ts`:

```typescript
import { readConfig, writeConfig, CONFIG_PATH } from "../utils/config.js";

export function resolveApiKey(configPath: string = CONFIG_PATH): string | undefined {
  const envKey = process.env.TRONGRID_API_KEY;
  if (envKey) return envKey;

  const config = readConfig(configPath);
  return config.apiKey;
}

export function saveApiKey(
  key: string,
  configPath: string = CONFIG_PATH,
): void {
  writeConfig(configPath, { apiKey: key });
}

export function removeApiKey(configPath: string = CONFIG_PATH): void {
  writeConfig(configPath, { apiKey: undefined });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/auth/store.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/store.ts tests/auth/store.test.ts
git commit -m "feat: add auth store with env var > config priority"
```

---

## Task 4: Address Validation

**Files:**
- Create: `src/utils/address.ts`
- Create: `tests/utils/address.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/utils/address.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { isValidAddress } from "../src/utils/address.js";

describe("isValidAddress", () => {
  it("accepts valid Base58 address", () => {
    expect(isValidAddress("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW")).toBe(true);
  });

  it("accepts valid hex address (41-prefix)", () => {
    expect(isValidAddress("410000000000000000000000000000000000000000")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidAddress("")).toBe(false);
  });

  it("rejects too-short string", () => {
    expect(isValidAddress("TJCn")).toBe(false);
  });

  it("rejects ethereum address (0x prefix)", () => {
    expect(isValidAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/utils/address.test.ts
```

- [ ] **Step 3: Implement address validation**

Create `src/utils/address.ts`:

```typescript
const BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
const HEX_REGEX = /^41[0-9a-fA-F]{40}$/;

export function isValidAddress(address: string): boolean {
  if (!address) return false;
  return BASE58_REGEX.test(address) || HEX_REGEX.test(address);
}

export function validateAddress(address: string): string {
  if (!isValidAddress(address)) {
    throw new Error(`Invalid TRON address format: "${address}". Expected Base58 (T...) or Hex (41...).`);
  }
  return address;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/utils/address.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/address.ts tests/utils/address.test.ts
git commit -m "feat: add TRON address validation (Base58 + Hex)"
```

---

## Task 5: API Client

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/types.ts`
- Create: `tests/api/client.test.ts`

- [ ] **Step 1: Write failing tests for API client**

Create `tests/api/client.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { createClient, TrongridError } from "../src/api/client.js";

describe("createClient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends GET request to correct URL on mainnet", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({ blockID: "abc" }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = createClient({ network: "mainnet" });
    await client.get("/wallet/getnowblock");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/getnowblock",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends POST request with JSON body", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({ account: {} }) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = createClient({ network: "mainnet" });
    await client.post("/wallet/getaccount", { address: "TXxx", visible: true });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.trongrid.io/wallet/getaccount",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "TXxx", visible: true }),
      }),
    );
  });

  it("injects API key header when provided", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({}) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = createClient({ network: "mainnet", apiKey: "my-key" });
    await client.get("/wallet/getnowblock");

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "TRON-PRO-API-KEY": "my-key" }),
      }),
    );
  });

  it("uses shasta endpoint when network is shasta", async () => {
    const mockResponse = { ok: true, json: () => Promise.resolve({}) };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = createClient({ network: "shasta" });
    await client.get("/wallet/getnowblock");

    expect(fetch).toHaveBeenCalledWith(
      "https://api.shasta.trongrid.io/wallet/getnowblock",
      expect.any(Object),
    );
  });

  it("throws TrongridError on HTTP error", async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({ Error: "rate limited" }),
    };
    vi.mocked(fetch).mockResolvedValue(mockResponse as Response);

    const client = createClient({ network: "mainnet" });
    await expect(client.get("/wallet/getnowblock")).rejects.toThrow(TrongridError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/api/client.test.ts
```

- [ ] **Step 3: Create API types**

Create `src/api/types.ts`:

```typescript
export interface ClientOptions {
  network: string;
  apiKey?: string;
}

export const NETWORK_URLS: Record<string, string> = {
  mainnet: "https://api.trongrid.io",
  shasta: "https://api.shasta.trongrid.io",
  nile: "https://nile.trongrid.io",
};
```

- [ ] **Step 4: Implement API client**

Create `src/api/client.ts`:

```typescript
import { type ClientOptions, NETWORK_URLS } from "./types.js";

export class TrongridError extends Error {
  constructor(
    message: string,
    public status: number,
    public upstream?: unknown,
  ) {
    super(message);
    this.name = "TrongridError";
  }
}

export interface ApiClient {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T>;
}

export function createClient(options: ClientOptions): ApiClient {
  const baseUrl = NETWORK_URLS[options.network] ?? NETWORK_URLS.mainnet;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.apiKey) {
    headers["TRON-PRO-API-KEY"] = options.apiKey;
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, { ...init, headers });

    if (!response.ok) {
      let upstream: unknown;
      try {
        upstream = await response.json();
      } catch {}
      throw new TrongridError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
        upstream,
      );
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T = unknown>(path: string) => request<T>(path, { method: "GET" }),
    post: <T = unknown>(path: string, body?: Record<string, unknown>) =>
      request<T>(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      }),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
bun test tests/api/client.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/client.ts src/api/types.ts tests/api/client.test.ts
git commit -m "feat: add API client with auth injection and network selection"
```

---

## Task 6: Output Formatting

**Files:**
- Create: `src/output/format.ts`
- Create: `tests/output/format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/output/format.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { sunToTrx, formatKeyValue, formatJson } from "../src/output/format.js";

describe("sunToTrx", () => {
  it("converts sun to TRX", () => {
    expect(sunToTrx(1_000_000)).toBe("1");
    expect(sunToTrx(1_500_000)).toBe("1.5");
    expect(sunToTrx(0)).toBe("0");
  });

  it("handles large values", () => {
    expect(sunToTrx(1_000_000_000_000)).toBe("1000000");
  });
});

describe("formatKeyValue", () => {
  it("formats key-value pairs with aligned columns", () => {
    const output = formatKeyValue([
      ["Address", "TXxx"],
      ["Balance", "100 TRX"],
    ]);
    expect(output).toContain("Address");
    expect(output).toContain("TXxx");
    expect(output).toContain("Balance");
    expect(output).toContain("100 TRX");
  });
});

describe("formatJson", () => {
  it("outputs stable JSON", () => {
    const data = { address: "TXxx", balance: 100 };
    const output = formatJson(data);
    expect(JSON.parse(output)).toEqual(data);
  });

  it("filters fields when specified", () => {
    const data = { address: "TXxx", balance: 100, type: "EOA" };
    const output = formatJson(data, ["address", "balance"]);
    const parsed = JSON.parse(output);
    expect(parsed).toEqual({ address: "TXxx", balance: 100 });
    expect(parsed.type).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/output/format.test.ts
```

- [ ] **Step 3: Implement output formatting**

Create `src/output/format.ts`:

```typescript
import { styleText } from "node:util";

export function sunToTrx(sun: number): string {
  const trx = sun / 1_000_000;
  return trx % 1 === 0 ? trx.toFixed(0) : String(trx);
}

export function formatKeyValue(pairs: [string, string][]): string {
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs
    .map(([key, value]) => `${styleText("dim", key.padEnd(maxKeyLen))}  ${value}`)
    .join("\n");
}

export function formatJson(
  data: Record<string, unknown>,
  fields?: string[],
): string {
  if (fields && fields.length > 0) {
    const filtered: Record<string, unknown> = {};
    for (const field of fields) {
      if (field in data) {
        filtered[field] = data[field];
      }
    }
    return JSON.stringify(filtered, null, 2);
  }
  return JSON.stringify(data, null, 2);
}

export function printResult(
  data: Record<string, unknown>,
  humanPairs: [string, string][],
  options: { json?: boolean; fields?: string[] },
): void {
  if (options.json) {
    console.log(formatJson(data, options.fields));
  } else {
    console.log(formatKeyValue(humanPairs));
  }
}

export function printError(
  message: string,
  options: { json?: boolean; verbose?: boolean; upstream?: unknown },
): void {
  if (options.json) {
    const err: Record<string, unknown> = { error: message };
    if (options.upstream) err.upstream = options.upstream;
    console.error(JSON.stringify(err, null, 2));
  } else {
    console.error(styleText("red", `Error: ${message}`));
    if (options.verbose && options.upstream) {
      console.error(styleText("dim", JSON.stringify(options.upstream, null, 2)));
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/output/format.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/output/format.ts tests/output/format.test.ts
git commit -m "feat: add output formatting with human/JSON dual mode"
```

---

## Task 7: CLI Entry Point + Global Flags

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Implement CLI entry point with commander**

Replace `src/index.ts`:

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { readConfig } from "./utils/config.js";
import { resolveApiKey } from "./auth/store.js";
import { createClient, type ApiClient } from "./api/client.js";

const program = new Command();

program
  .name("trongrid")
  .description("CLI for TronGrid — query TRON blockchain from terminal or AI agent")
  .version("0.1.0")
  .option("-j, --json", "output as JSON", false)
  .option("-n, --network <network>", "network: mainnet, shasta, nile", "mainnet")
  .option("--no-color", "disable colored output")
  .option("-v, --verbose", "show upstream API details in errors", false)
  .option("-l, --limit <number>", "max items for list commands", "20")
  .option("-f, --fields <fields>", "select output fields (JSON mode)");

export interface GlobalOptions {
  json: boolean;
  network: string;
  verbose: boolean;
  limit: string;
  fields?: string;
}

export function getClient(opts: GlobalOptions): ApiClient {
  const config = readConfig();
  const network = opts.network ?? config.network ?? "mainnet";
  const apiKey = resolveApiKey();
  return createClient({ network, apiKey });
}

export function parseFields(opts: GlobalOptions): string[] | undefined {
  if (!opts.fields) return undefined;
  return opts.fields.split(",").map((f) => f.trim());
}

export { program };

// Commands will be registered here by each command module
// Import commands (added as tasks implement them)

program.parse();
```

- [ ] **Step 2: Verify build and help output**

```bash
bun run build && node dist/index.js --help
```

Expected: shows trongrid help with all global flags

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI entry point with commander and global flags"
```

---

## Task 8: First Command — `block latest`

**Files:**
- Create: `src/commands/block/latest.ts`
- Create: `tests/commands/block-latest.test.ts`
- Modify: `src/index.ts` (register command)

- [ ] **Step 1: Write failing test**

Create `tests/commands/block-latest.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

describe("block latest", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and returns latest block data", async () => {
    const mockBlock = {
      blockID: "000000000123abcdef",
      block_header: {
        raw_data: {
          number: 70000000,
          timestamp: 1711929600000,
          witness_address: "41abc123",
          txTrieRoot: "0000",
        },
      },
      transactions: [{}, {}, {}],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockBlock),
    } as Response);

    // Import dynamically after mocking
    const { fetchLatestBlock } = await import("../src/commands/block/latest.js");
    const { createClient } = await import("../src/api/client.js");

    const client = createClient({ network: "mainnet" });
    const result = await fetchLatestBlock(client);

    expect(result.blockId).toBe("000000000123abcdef");
    expect(result.number).toBe(70000000);
    expect(result.txCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/commands/block-latest.test.ts
```

- [ ] **Step 3: Implement block latest command**

Create `src/commands/block/latest.ts`:

```typescript
import { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";
import { type GlobalOptions, getClient, parseFields, program } from "../../index.js";

interface BlockData {
  blockId: string;
  number: number;
  timestamp: number;
  witnessAddress: string;
  txCount: number;
}

export async function fetchLatestBlock(client: ApiClient): Promise<BlockData> {
  const raw = await client.post<{
    blockID: string;
    block_header: {
      raw_data: {
        number: number;
        timestamp: number;
        witness_address: string;
      };
    };
    transactions?: unknown[];
  }>("/wallet/getnowblock");

  return {
    blockId: raw.blockID,
    number: raw.block_header.raw_data.number,
    timestamp: raw.block_header.raw_data.timestamp,
    witnessAddress: raw.block_header.raw_data.witness_address,
    txCount: raw.transactions?.length ?? 0,
  };
}

export function registerBlockCommands(parent: Command): void {
  const block = parent.command("block").description("Block queries");

  block
    .command("latest")
    .description("Get the latest block (chain head)")
    .action(async () => {
      const opts = parent.opts<GlobalOptions>();
      try {
        const client = getClient(opts);
        const data = await fetchLatestBlock(client);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["Block", String(data.number)],
            ["Block ID", data.blockId],
            ["Time", new Date(data.timestamp).toISOString()],
            ["Producer", data.witnessAddress],
            ["Transactions", String(data.txCount)],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err), {
          json: opts.json,
          verbose: opts.verbose,
          upstream: (err as { upstream?: unknown }).upstream,
        });
        process.exit(1);
      }
    });
}
```

- [ ] **Step 4: Register command in index.ts**

Add to `src/index.ts` before `program.parse()`:

```typescript
import { registerBlockCommands } from "./commands/block/latest.js";

registerBlockCommands(program);

program.parse();
```

(Remove the old bare `program.parse()` line)

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test tests/commands/block-latest.test.ts
```

Expected: PASS

- [ ] **Step 6: Build and test against real mainnet**

```bash
bun run build && node dist/index.js block latest
```

Expected: prints latest block info (number, ID, time, producer, tx count)

```bash
node dist/index.js block latest --json
```

Expected: prints JSON object

- [ ] **Step 7: Commit**

```bash
git add src/commands/block/latest.ts tests/commands/block-latest.test.ts src/index.ts
git commit -m "feat: add block latest command — first end-to-end command"
```

---

## Task 9: `account view`

**Files:**
- Create: `src/commands/account/view.ts`
- Create: `tests/commands/account-view.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/account-view.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

describe("account view", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and formats account data", async () => {
    const mockAccount = {
      address: "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW",
      balance: 50_000_000,
      create_time: 1600000000000,
      account_resource: {},
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockAccount),
    } as Response);

    const { fetchAccountView } = await import("../src/commands/account/view.js");
    const { createClient } = await import("../src/api/client.js");

    const client = createClient({ network: "mainnet" });
    const result = await fetchAccountView(client, "TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");

    expect(result.address).toBe("TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW");
    expect(result.balanceSun).toBe(50_000_000);
    expect(result.balanceTrx).toBe("50");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/commands/account-view.test.ts
```

- [ ] **Step 3: Implement account view**

Create `src/commands/account/view.ts`:

```typescript
import { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import { type GlobalOptions, getClient, parseFields, program } from "../../index.js";

interface AccountViewData {
  address: string;
  balanceSun: number;
  balanceTrx: string;
  isContract: boolean;
  createTime: number;
}

export async function fetchAccountView(
  client: ApiClient,
  address: string,
): Promise<AccountViewData> {
  const raw = await client.post<{
    address: string;
    balance?: number;
    create_time?: number;
    type?: string;
    account_resource?: Record<string, unknown>;
  }>("/wallet/getaccount", { address, visible: true });

  const balance = raw.balance ?? 0;

  return {
    address: raw.address ?? address,
    balanceSun: balance,
    balanceTrx: sunToTrx(balance),
    isContract: raw.type === "Contract",
    createTime: raw.create_time ?? 0,
  };
}

export function registerAccountCommands(parent: Command): void {
  const account = parent.command("account").description("Address queries");

  account
    .command("view")
    .description("View account balance, type, and activation status")
    .argument("<address>", "TRON address (Base58 or Hex)")
    .action(async (address: string) => {
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const data = await fetchAccountView(client, address);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["Address", data.address],
            ["Balance", `${data.balanceTrx} TRX`],
            ["Type", data.isContract ? "Contract" : "EOA"],
            ["Created", data.createTime ? new Date(data.createTime).toISOString() : "Unknown"],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err), {
          json: opts.json,
          verbose: opts.verbose,
          upstream: (err as { upstream?: unknown }).upstream,
        });
        process.exit(1);
      }
    });
}
```

- [ ] **Step 4: Register in index.ts**

Add import and call before `program.parse()`:

```typescript
import { registerAccountCommands } from "./commands/account/view.js";

registerAccountCommands(program);
```

- [ ] **Step 5: Run test and E2E verify**

```bash
bun test tests/commands/account-view.test.ts
bun run build && node dist/index.js account view TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
node dist/index.js account view TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --json
```

- [ ] **Step 6: Commit**

```bash
git add src/commands/account/view.ts tests/commands/account-view.test.ts src/index.ts
git commit -m "feat: add account view command"
```

---

## Task 10: `account tokens`

**Files:**
- Create: `src/commands/account/tokens.ts`
- Modify: `src/commands/account/view.ts` (add to same account command group)

- [ ] **Step 1: Implement account tokens**

Create `src/commands/account/tokens.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { sunToTrx, printError } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import type { GlobalOptions } from "../../index.js";
import { getClient, parseFields } from "../../index.js";
import { styleText } from "node:util";

interface TokenBalance {
  name: string;
  symbol: string;
  balance: string;
  decimals: number;
  contractAddress: string;
}

export async function fetchAccountTokens(
  client: ApiClient,
  address: string,
): Promise<TokenBalance[]> {
  const raw = await client.get<{
    data?: Array<{
      tokenId: string;
      tokenAbbr: string;
      tokenName: string;
      balance: string;
      tokenDecimal: number;
    }>;
  }>(`/v1/accounts/${address}/tokens`);

  if (!raw.data) return [];

  return raw.data.map((t) => ({
    name: t.tokenName,
    symbol: t.tokenAbbr,
    balance: t.balance,
    decimals: t.tokenDecimal,
    contractAddress: t.tokenId,
  }));
}

export function registerAccountTokensCommand(account: Command, parent: Command): void {
  account
    .command("tokens")
    .description("List all TRC20/TRC10 token balances")
    .argument("<address>", "TRON address")
    .action(async (address: string) => {
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const tokens = await fetchAccountTokens(client, address);

        if (opts.json) {
          const fields = parseFields(opts);
          const data = fields
            ? tokens.map((t) => {
                const filtered: Record<string, unknown> = {};
                for (const f of fields) if (f in t) filtered[f] = t[f as keyof TokenBalance];
                return filtered;
              })
            : tokens;
          console.log(JSON.stringify(data, null, 2));
        } else {
          if (tokens.length === 0) {
            console.log(styleText("dim", "No tokens found."));
            return;
          }
          console.log(styleText("dim", `Found ${tokens.length} tokens:\n`));
          for (const t of tokens) {
            const humanBalance = (Number(t.balance) / 10 ** t.decimals).toLocaleString();
            console.log(`  ${styleText("bold", t.symbol.padEnd(10))} ${humanBalance}`);
          }
        }
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err), {
          json: opts.json,
          verbose: opts.verbose,
          upstream: (err as { upstream?: unknown }).upstream,
        });
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Wire up in account command registration**

Refactor `src/commands/account/view.ts` to export the `account` command group, and call `registerAccountTokensCommand` from `src/index.ts`. Or import and register in `index.ts`:

```typescript
import { registerAccountTokensCommand } from "./commands/account/tokens.js";
```

Add after the account command group is created (modify `registerAccountCommands` to return the `account` Command, then pass it):

```typescript
export function registerAccountCommands(parent: Command): Command {
  const account = parent.command("account").description("Address queries");
  // ... view subcommand registration ...
  return account;
}
```

Then in `index.ts`:

```typescript
const account = registerAccountCommands(program);
registerAccountTokensCommand(account, program);
```

- [ ] **Step 3: Build and test against mainnet**

```bash
bun run build && node dist/index.js account tokens TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
node dist/index.js account tokens TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW --json
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/tokens.ts src/commands/account/view.ts src/index.ts
git commit -m "feat: add account tokens command"
```

---

## Task 11: `account resources`

**Files:**
- Create: `src/commands/account/resources.ts`

- [ ] **Step 1: Implement account resources**

Create `src/commands/account/resources.ts`:

```typescript
import type { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";
import { validateAddress } from "../../utils/address.js";
import type { GlobalOptions } from "../../index.js";
import { getClient, parseFields } from "../../index.js";

interface ResourceData {
  address: string;
  energyUsed: number;
  energyLimit: number;
  bandwidthUsed: number;
  bandwidthLimit: number;
  totalFrozenV2: number;
}

export async function fetchAccountResources(
  client: ApiClient,
  address: string,
): Promise<ResourceData> {
  const raw = await client.post<{
    EnergyUsed?: number;
    EnergyLimit?: number;
    freeNetUsed?: number;
    freeNetLimit?: number;
    NetUsed?: number;
    NetLimit?: number;
    TotalEnergyLimit?: number;
    TotalNetLimit?: number;
  }>("/wallet/getaccountresource", { address, visible: true });

  return {
    address,
    energyUsed: raw.EnergyUsed ?? 0,
    energyLimit: raw.EnergyLimit ?? 0,
    bandwidthUsed: (raw.freeNetUsed ?? 0) + (raw.NetUsed ?? 0),
    bandwidthLimit: (raw.freeNetLimit ?? 0) + (raw.NetLimit ?? 0),
    totalFrozenV2: 0,
  };
}

export function registerAccountResourcesCommand(account: Command, parent: Command): void {
  account
    .command("resources")
    .description("View energy, bandwidth, and staking state")
    .argument("<address>", "TRON address")
    .action(async (address: string) => {
      const opts = parent.opts<GlobalOptions>();
      try {
        validateAddress(address);
        const client = getClient(opts);
        const data = await fetchAccountResources(client, address);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["Address", data.address],
            ["Energy", `${data.energyUsed.toLocaleString()} / ${data.energyLimit.toLocaleString()}`],
            ["Bandwidth", `${data.bandwidthUsed.toLocaleString()} / ${data.bandwidthLimit.toLocaleString()}`],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err), {
          json: opts.json,
          verbose: opts.verbose,
          upstream: (err as { upstream?: unknown }).upstream,
        });
        process.exit(1);
      }
    });
}
```

- [ ] **Step 2: Register in index.ts**

```typescript
import { registerAccountResourcesCommand } from "./commands/account/resources.js";

registerAccountResourcesCommand(account, program);
```

- [ ] **Step 3: Build and verify**

```bash
bun run build && node dist/index.js account resources TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/account/resources.ts src/index.ts
git commit -m "feat: add account resources command"
```

---

## Task 12: `tx view`

**Files:**
- Create: `src/commands/tx/view.ts`
- Create: `tests/commands/tx-view.test.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Write failing test**

Create `tests/commands/tx-view.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";

describe("tx view", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and merges transaction + info data", async () => {
    const callCount = { n: 0 };
    vi.mocked(fetch).mockImplementation(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("gettransactionbyid")) {
        return {
          ok: true,
          json: () =>
            Promise.resolve({
              txID: "abc123",
              raw_data: {
                contract: [{ type: "TransferContract" }],
                timestamp: 1711929600000,
              },
            }),
        } as Response;
      }
      // gettransactioninfobyid
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            id: "abc123",
            blockNumber: 70000000,
            receipt: { result: "SUCCESS", energy_usage_total: 0 },
            fee: 1_100_000,
          }),
      } as Response;
    });

    const { fetchTxView } = await import("../src/commands/tx/view.js");
    const { createClient } = await import("../src/api/client.js");

    const client = createClient({ network: "mainnet" });
    const result = await fetchTxView(client, "abc123");

    expect(result.txId).toBe("abc123");
    expect(result.blockNumber).toBe(70000000);
    expect(result.status).toBe("SUCCESS");
    expect(result.feeSun).toBe(1_100_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/commands/tx-view.test.ts
```

- [ ] **Step 3: Implement tx view**

Create `src/commands/tx/view.ts`:

```typescript
import { Command } from "commander";
import type { ApiClient } from "../../api/client.js";
import { sunToTrx, printResult, printError } from "../../output/format.js";
import { type GlobalOptions, getClient, parseFields, program } from "../../index.js";

interface TxViewData {
  txId: string;
  blockNumber: number;
  timestamp: number;
  status: string;
  contractType: string;
  feeSun: number;
  feeTrx: string;
  energyUsed: number;
}

export async function fetchTxView(client: ApiClient, hash: string): Promise<TxViewData> {
  const [tx, info] = await Promise.all([
    client.post<{
      txID: string;
      raw_data: {
        contract: Array<{ type: string }>;
        timestamp: number;
      };
    }>("/wallet/gettransactionbyid", { value: hash }),
    client.post<{
      id: string;
      blockNumber: number;
      receipt: { result?: string; energy_usage_total?: number };
      fee?: number;
    }>("/wallet/gettransactioninfobyid", { value: hash }),
  ]);

  const fee = info.fee ?? 0;

  return {
    txId: tx.txID,
    blockNumber: info.blockNumber,
    timestamp: tx.raw_data.timestamp,
    status: info.receipt.result ?? "UNKNOWN",
    contractType: tx.raw_data.contract[0]?.type ?? "Unknown",
    feeSun: fee,
    feeTrx: sunToTrx(fee),
    energyUsed: info.receipt.energy_usage_total ?? 0,
  };
}

export function registerTxCommands(parent: Command): void {
  const tx = parent.command("tx").description("Transaction queries");

  tx.command("view")
    .description("View transaction details by hash")
    .argument("<hash>", "Transaction hash")
    .action(async (hash: string) => {
      const opts = parent.opts<GlobalOptions>();
      try {
        const client = getClient(opts);
        const data = await fetchTxView(client, hash);

        printResult(
          data as unknown as Record<string, unknown>,
          [
            ["TX Hash", data.txId],
            ["Block", String(data.blockNumber)],
            ["Time", new Date(data.timestamp).toISOString()],
            ["Status", data.status],
            ["Type", data.contractType],
            ["Fee", `${data.feeTrx} TRX`],
            ["Energy Used", String(data.energyUsed)],
          ],
          { json: opts.json, fields: parseFields(opts) },
        );
      } catch (err) {
        printError(err instanceof Error ? err.message : String(err), {
          json: opts.json,
          verbose: opts.verbose,
          upstream: (err as { upstream?: unknown }).upstream,
        });
        process.exit(1);
      }
    });
}
```

- [ ] **Step 4: Register in index.ts and run test**

```typescript
import { registerTxCommands } from "./commands/tx/view.js";

registerTxCommands(program);
```

```bash
bun test tests/commands/tx-view.test.ts
bun run build && node dist/index.js tx view <a-real-tx-hash>
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/tx/view.ts tests/commands/tx-view.test.ts src/index.ts
git commit -m "feat: add tx view command with parallel API calls"
```

---

## Task 13: Auth + Config Commands

**Files:**
- Create: `src/commands/auth/login.ts`
- Create: `src/commands/auth/status.ts`
- Create: `src/commands/config/set.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Implement auth login (manual key entry)**

Create `src/commands/auth/login.ts`:

```typescript
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { saveApiKey } from "../../auth/store.js";
import { styleText } from "node:util";

export function registerAuthCommands(parent: Command): void {
  const auth = parent.command("auth").description("Authentication");

  auth
    .command("login")
    .description("Authenticate with TronGrid API key")
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        console.log(styleText("dim", "Get your API key from https://www.trongrid.io/dashboard"));
        const key = await rl.question("API Key: ");

        if (!key.trim()) {
          console.error(styleText("red", "Error: API key cannot be empty."));
          process.exit(1);
        }

        saveApiKey(key.trim());
        console.log(styleText("green", "Authenticated. API key saved."));
      } finally {
        rl.close();
      }
    });

  auth
    .command("logout")
    .description("Remove stored credentials")
    .action(() => {
      const { removeApiKey } = require("../../auth/store.js");
      removeApiKey();
      console.log("Credentials removed.");
    });

  auth
    .command("status")
    .description("Show current authentication state")
    .action(() => {
      const { resolveApiKey } = require("../../auth/store.js");
      const key = resolveApiKey();
      if (key) {
        const masked = key.slice(0, 4) + "..." + key.slice(-4);
        console.log(`Authenticated: ${styleText("green", masked)}`);
        console.log(styleText("dim", `Source: ${process.env.TRONGRID_API_KEY ? "TRONGRID_API_KEY env var" : "config file"}`));
      } else {
        console.log(styleText("yellow", "Not authenticated. Using free tier (3 QPS)."));
        console.log(styleText("dim", 'Run "trongrid auth login" to authenticate.'));
      }
    });
}
```

- [ ] **Step 2: Implement config commands**

Create `src/commands/config/set.ts`:

```typescript
import { Command } from "commander";
import { setConfigValue, getConfigValue, readConfig } from "../../utils/config.js";
import { styleText } from "node:util";

export function registerConfigCommands(parent: Command): void {
  const config = parent.command("config").description("Configuration");

  config
    .command("set")
    .description("Set a config value")
    .argument("<key>", "Config key (e.g., network)")
    .argument("<value>", "Config value")
    .action((key: string, value: string) => {
      setConfigValue(undefined, key, value);
      console.log(`${key} = ${value}`);
    });

  config
    .command("get")
    .description("Get a config value")
    .argument("<key>", "Config key")
    .action((key: string) => {
      const value = getConfigValue(undefined, key);
      if (value !== undefined) {
        console.log(value);
      } else {
        console.log(styleText("dim", "(not set)"));
      }
    });

  config
    .command("list")
    .description("Show all config values")
    .action(() => {
      const all = readConfig();
      for (const [key, value] of Object.entries(all)) {
        if (value !== undefined) {
          console.log(`${styleText("dim", key.padEnd(12))}  ${value}`);
        }
      }
    });
}
```

- [ ] **Step 3: Register both in index.ts**

```typescript
import { registerAuthCommands } from "./commands/auth/login.js";
import { registerConfigCommands } from "./commands/config/set.js";

registerAuthCommands(program);
registerConfigCommands(program);
```

- [ ] **Step 4: Build and verify**

```bash
bun run build
node dist/index.js auth status
node dist/index.js config set network shasta
node dist/index.js config get network
node dist/index.js config list
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/auth/ src/commands/config/ src/index.ts
git commit -m "feat: add auth and config commands"
```

---

## Task 14: No-Key Warning + CI Setup

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `src/index.ts` (no-key tip)

- [ ] **Step 1: Add no-key tip to commands**

In `src/index.ts`, add a helper that prints a tip when no API key is found. Call it after client creation in a program hook:

```typescript
import { resolveApiKey } from "./auth/store.js";
import { styleText } from "node:util";

program.hook("preAction", () => {
  if (!resolveApiKey()) {
    console.error(
      styleText("dim", 'Tip: Run "trongrid auth login" for 5x faster rate limits.\n'),
    );
  }
});
```

- [ ] **Step 2: Create CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint
      - run: bun run test
      - run: bun run build
```

- [ ] **Step 3: Run all tests locally**

```bash
bun run lint && bun test && bun run build
```

Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml src/index.ts
git commit -m "chore: add CI workflow and no-key usage tip"
```

---

## Phase A Exit Criteria Checklist

After all tasks complete, verify:

- [ ] `node dist/index.js block latest` — works on mainnet
- [ ] `node dist/index.js block latest --network shasta` — works on shasta
- [ ] `node dist/index.js account view <addr> --json` — stable JSON output
- [ ] `node dist/index.js auth login` — prompts for key, saves it
- [ ] `node dist/index.js auth status` — shows auth state
- [ ] `bun run lint` — passes
- [ ] `bun run test` — all tests pass
- [ ] `bun run build` — compiles successfully
