import { describe, expect, it } from "vitest";
import { buildBankSource } from "./bank.ts";

// Gating coverage originally from sources/index.test.ts' "not ready" case, then
// registry.test.ts: it follows `buildBankSource` wherever the wiring lives.

describe("buildBankSource", () => {
  it("gates off without a configured account, naming MoneyMoney in the reason", () => {
    const gate = buildBankSource({});
    expect(gate.source).toBeNull();
    // Reason is platform-derived (missing macOS vs. unconfigured account); both
    // name MoneyMoney — assert the invariant, not the OS-specific wording.
    expect(gate.reason).toContain("MoneyMoney");
  });

  it("constructs the source on macOS when the account is configured", () => {
    const gate = buildBankSource({ moneyMoneyAccount: "DE00 0000 0000 0000 0000 00" });
    if (process.platform === "darwin") {
      expect(gate.source?.id).toBe("bank");
    } else {
      expect(gate.source).toBeNull();
      expect(gate.reason).toContain("macOS");
    }
  });
});
