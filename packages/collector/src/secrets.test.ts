import { describe, expect, it } from "vitest";
import { secretsFromEnv } from "./secrets.ts";

describe("secretsFromEnv", () => {
  it("returns null when no secret env vars are present", () => {
    expect(secretsFromEnv({})).toBeNull();
    expect(secretsFromEnv({ PATH: "/usr/bin", HOME: "/root" })).toBeNull();
  });

  it("reads the secrets from their env-var names", () => {
    const secrets = secretsFromEnv({
      FASTMAIL_TOKEN_PERSONAL: "p",
      FASTMAIL_TOKEN_WORK: "w",
      TOGGL_API_TOKEN: "t",
      TOGGL_WORKSPACE_ID: "42",
      MONEYMONEY_ACCOUNT: "DE00",
    });
    expect(secrets).toEqual({
      fastmailTokenPersonal: "p",
      fastmailTokenWork: "w",
      togglApiToken: "t",
      togglWorkspaceId: "42",
      moneyMoneyAccount: "DE00",
    });
  });

  it("switches to env mode on any one var, leaving the rest undefined", () => {
    const secrets = secretsFromEnv({ FASTMAIL_TOKEN_PERSONAL: "only" });
    expect(secrets).not.toBeNull();
    expect(secrets?.fastmailTokenPersonal).toBe("only");
    expect(secrets?.togglApiToken).toBeUndefined();
  });
});
