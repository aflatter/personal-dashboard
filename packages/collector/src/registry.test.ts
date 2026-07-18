import { describe, expect, it } from "vitest";
import { buildBankSource, buildJobs } from "./registry.ts";

// Gating coverage migrated from the old sources/index.test.ts "not ready" case:
// the registry now decides what gets constructed, so the reasons live here.

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

describe("buildJobs", () => {
  it("constructs no jobs from an empty secrets bag", () => {
    expect(buildJobs({})).toEqual([]);
  });

  it("constructs only the sources whose secrets are present", () => {
    const jobs = buildJobs({
      fastmailTokenWork: "token-w",
      togglApiToken: "token-t",
      togglWorkspaceId: "123",
    });
    expect(jobs.map((j) => j.source.id)).toEqual(["inbox:work", "hours"]);
  });
});
