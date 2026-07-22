import { describe, expect, it, vi } from "vitest";
import { dashboardAgent, refreshBankThroughAgent, type DashboardState } from "./client";

// The bank refresh is the SPA's one device-specific path: it runs on the Mac
// (where a native process can read MoneyMoney) and is absent everywhere else.
// Both halves are pure over their injected dependencies, so this needs no DOM.

const STATE = { bank: { unchecked: 7, syncedAt: 1 } } as unknown as DashboardState;

describe("dashboardAgent", () => {
  it("finds the bridge the Electron preload exposed", () => {
    const bridge = { refreshBank: vi.fn() };
    expect(dashboardAgent({ dashboardAgent: bridge })).toBe(bridge);
  });

  it("is null off the Mac — a browser tab and a window-less runtime alike", () => {
    expect(dashboardAgent({})).toBeNull();
    expect(dashboardAgent(undefined)).toBeNull();
  });
});

describe("refreshBankThroughAgent", () => {
  it("re-reads state after a successful push", async () => {
    const refetch = vi.fn(async () => STATE);
    const agent = { refreshBank: vi.fn(async () => ({ ok: true }) as const) };

    expect(await refreshBankThroughAgent(agent, refetch)).toEqual({ state: STATE, error: null });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("reports a local failure and does NOT re-read — nothing was pushed", async () => {
    const refetch = vi.fn(async () => STATE);
    const agent = {
      refreshBank: vi.fn(
        async () =>
          ({ ok: false, error: "MoneyMoney is locked — unlock it and sync again" }) as const,
      ),
    };

    expect(await refreshBankThroughAgent(agent, refetch)).toEqual({
      state: undefined,
      error: "MoneyMoney is locked — unlock it and sync again",
    });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("turns a thrown IPC error into a reported one, never a rejection", async () => {
    const agent = { refreshBank: vi.fn(() => Promise.reject(new Error("no ipc handler"))) };

    await expect(refreshBankThroughAgent(agent, async () => STATE)).resolves.toEqual({
      error: "no ipc handler",
    });
  });

  it("does nothing without a bridge — other devices only read what the Mac pushed", async () => {
    const refetch = vi.fn(async () => STATE);

    expect(await refreshBankThroughAgent(null, refetch)).toEqual({ error: null });
    expect(refetch).not.toHaveBeenCalled();
  });
});
