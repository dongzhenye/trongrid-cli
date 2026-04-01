import { describe, it, expect } from "bun:test";
import { isValidAddress } from "../../src/utils/address.js";

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
