import type { BankBacklog } from "./collect.ts";

/** The outcome of one refresh — never thrown, so IPC callers can surface it. */
export type RefreshResult = { ok: true; backlog: BankBacklog } | { ok: false; error: string };

export interface BankAgentDeps {
  /** Read the MoneyMoney backlog on this Mac (throws the gate reason / a locked-etc. error). */
  collect: () => Promise<BankBacklog>;
  /** Send a collected backlog to the backend. */
  push: (backlog: BankBacklog) => Promise<void>;
}

export interface BankAgent {
  /**
   * Collect the MoneyMoney backlog and push it up. **Single-flight:** concurrent
   * callers (a rapid re-click, the button plus an on-launch trigger) coalesce
   * into one collect+push run rather than spawning parallel osascript calls —
   * the same coalescing the in-process `syncBank` had, now on the agent side.
   * Never throws: a failure (MoneyMoney locked, wrong platform, backend
   * unreachable) comes back as `{ ok:false, error }` so the caller can show it on
   * the Mac. On failure nothing is pushed — the backend keeps its last-good value.
   */
  refresh: () => Promise<RefreshResult>;
}

/**
 * The push-only Mac agent for the bank backlog. Pure orchestration over injected
 * `collect`/`push`, so the coalescing and failure handling are unit-testable
 * without osascript or a live backend.
 */
export function createBankAgent(deps: BankAgentDeps): BankAgent {
  let inFlight: Promise<RefreshResult> | null = null;

  const run = async (): Promise<RefreshResult> => {
    try {
      const backlog = await deps.collect();
      await deps.push(backlog);
      return { ok: true, backlog };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  };

  return {
    refresh: () => {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}
