import { describe, expect, it } from "vitest";
import { buildJobs } from "./registry.ts";

// The bank gate's coverage lives in bank.test.ts, next to the module it moved to
// — the registry now builds only the polled sources.

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
