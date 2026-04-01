import { describe, it, expect } from "bun:test";
import { sunToTrx, formatKeyValue, formatJson } from "../../src/output/format.js";

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
