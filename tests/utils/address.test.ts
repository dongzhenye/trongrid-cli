import { describe, it, expect } from "bun:test";
import { UsageError } from "../../src/output/format.js";
import { isValidAddress, validateAddress, hexToBase58 } from "../../src/utils/address.js";

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

describe("validateAddress error type", () => {
  it("throws UsageError (not plain Error) on bad input", () => {
    expect(() => validateAddress("NOT_AN_ADDRESS")).toThrow(UsageError);
  });

  it("empty string throws UsageError", () => {
    expect(() => validateAddress("")).toThrow(UsageError);
  });
});

// USDT contract: a614f803b6fd780986a42c78ec9c7f77e6ded13c → TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
const USDT_HEX_BARE = "a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const USDT_HEX_0X = "0xa614f803b6fd780986a42c78ec9c7f77e6ded13c";
const USDT_HEX_41 = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
const USDT_BASE58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("hexToBase58", () => {
  it("converts bare 40-char hex (no prefix) to Base58 — USDT contract", () => {
    expect(hexToBase58(USDT_HEX_BARE)).toBe(USDT_BASE58);
  });

  it("converts 0x-prefixed 40-char hex to Base58 — USDT contract", () => {
    expect(hexToBase58(USDT_HEX_0X)).toBe(USDT_BASE58);
  });

  it("converts 41-prefixed 42-char hex to Base58 — USDT contract", () => {
    expect(hexToBase58(USDT_HEX_41)).toBe(USDT_BASE58);
  });

  it("all three prefix forms produce the same result", () => {
    const a = hexToBase58(USDT_HEX_BARE);
    const b = hexToBase58(USDT_HEX_0X);
    const c = hexToBase58(USDT_HEX_41);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("converts 0x + all-zeros (40 hex zeros) to a valid T... address", () => {
    const result = hexToBase58("0x" + "0".repeat(40));
    expect(result).toMatch(/^T/);
    expect(isValidAddress(result)).toBe(true);
  });

  it("result of USDT conversion passes isValidAddress()", () => {
    expect(isValidAddress(hexToBase58(USDT_HEX_BARE))).toBe(true);
  });

  it("throws on hex string that is too short", () => {
    expect(() => hexToBase58("a614f8")).toThrow(Error);
  });

  it("throws on hex string that is too long (not 40 or 42)", () => {
    // 44 hex chars — not a valid address
    expect(() => hexToBase58("a614f803b6fd780986a42c78ec9c7f77e6ded13c0000")).toThrow(Error);
  });

  it("throws on empty string", () => {
    expect(() => hexToBase58("")).toThrow(Error);
  });
});
