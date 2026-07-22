import { buildBankSource } from "@dash/collector/bank";
import type { BankState } from "@dash/collector/contract";
import type { Secrets } from "@dash/collector/secrets";

/**
 * The backlog the agent collects on the Mac and pushes to the backend. `syncedAt`
 * is stamped by the source at read time (`Date.now()` on the Mac), so the backend
 * records *when MoneyMoney was actually read*, not when the push arrived.
 */
export interface BankBacklog {
  unchecked: number;
  syncedAt: number;
}

/**
 * Build a `collect` for the MoneyMoney backlog on this Mac. Reuses the shared
 * gate (`buildBankSource`): if MoneyMoney can't run here (wrong platform, no
 * configured account) it throws the gate's reason; otherwise it polls the source
 * once. The agent surfaces any failure locally (the person at the Mac can unlock
 * MoneyMoney and retry) — nothing is pushed on failure, so the backend keeps its
 * last-good value and simply goes stale.
 *
 * The `Source` port types `poll()`'s snapshot as `unknown`; here — at the one
 * place that knows it is the bank source — we read it as `BankState`.
 */
export function bankCollector(secrets: Secrets): () => Promise<BankBacklog> {
  const gate = buildBankSource(secrets);
  return async () => {
    if (!gate.source) throw new Error(gate.reason);
    const { snapshot } = await gate.source.poll();
    const bank = snapshot as BankState;
    return { unchecked: bank.unchecked, syncedAt: bank.syncedAt ?? Date.now() };
  };
}
