import type { InboxState, SourceId, SourceStatus, StateResponse } from "@dash/collector/contract";
import type { Bank, Inbox, Settings } from "../domain";
import { trpc } from "./trpc";

/** The SPA's in-memory view of the collector state, mapped to domain shapes. */
export interface DashboardState {
  emails: { personal: Inbox; work: Inbox };
  clients: StateResponse["hours"]["clients"];
  rentDoneAt: number | null;
  taxDoneAt: number | null;
  bank: Bank;
  settings: Settings;
  /** Per-source liveness for staleness indicators. */
  meta: Record<SourceId, SourceStatus>;
}

function toInbox(w: InboxState): Inbox {
  return {
    account: w.account,
    email: w.email,
    protocol: w.protocol,
    total: w.total,
    unread: w.unread,
    history: w.unreadHistory.map((p) => p.value),
    totalHistory: w.totalHistory.map((p) => p.value),
  };
}

function mapState(wire: StateResponse): DashboardState {
  return {
    emails: { personal: toInbox(wire.inboxes.personal), work: toInbox(wire.inboxes.work) },
    clients: wire.hours.clients,
    rentDoneAt: wire.rent.doneAt,
    taxDoneAt: wire.tax.doneAt,
    bank: { unchecked: wire.bank.unchecked, syncedAt: wire.bank.syncedAt },
    settings: wire.settings,
    meta: wire.meta,
  };
}

export async function fetchState(): Promise<DashboardState> {
  return mapState(await trpc.state.query());
}

export async function markRentDone(): Promise<DashboardState> {
  return mapState(await trpc.rentDone.mutate());
}

export async function markTaxDone(): Promise<DashboardState> {
  return mapState(await trpc.taxDone.mutate());
}

export async function saveSettings(patch: Partial<Settings>): Promise<DashboardState> {
  return mapState(await trpc.settings.mutate(patch));
}

export async function requestSync(): Promise<DashboardState> {
  return mapState(await trpc.sync.mutate());
}

/**
 * Subscribe to live state pushed by the collector (SSE). `onState` fires with the
 * current state on connect and again on every change — a poll commit (including a
 * JMAP push) or a mutation — so the UI tracks the mailbox within a second instead
 * of waiting for the fallback poll. Returns an unsubscribe function.
 */
export function subscribeState(
  onState: (state: DashboardState) => void,
  onError?: (err: unknown) => void,
): () => void {
  const sub = trpc.onStateChange.subscribe(undefined, {
    onData: (wire) => onState(mapState(wire)),
    onError,
  });
  return () => sub.unsubscribe();
}

/**
 * The Mac agent bridge, exposed by the Electron preload (`window.dashboardAgent`).
 *
 * MoneyMoney can only be read by a native Mac process, so the bank refresh is not
 * a backend call from the browser: the Mac collects locally and pushes the result
 * to the backend, which then broadcasts it to every device. This is therefore the
 * one device-specific branch in the SPA — present in the Electron shell, absent
 * on the phone and in a plain browser tab (where the ↺ control is hidden).
 */
export interface DashboardAgent {
  refreshBank: () => Promise<{ ok: true } | { ok: false; error: string }>;
}

declare global {
  interface Window {
    dashboardAgent?: DashboardAgent;
  }
}

/** The agent bridge if this device has one (the Mac app), else null. */
export function dashboardAgent(
  win: { dashboardAgent?: DashboardAgent } | undefined = globalThis.window,
): DashboardAgent | null {
  return win?.dashboardAgent ?? null;
}

/** What one bank refresh produced: fresh state, or the reason it didn't land. */
export interface BankRefresh {
  /** Set only when the push succeeded and the re-read came back. */
  state?: DashboardState;
  /** Human-facing failure, else null. */
  error: string | null;
}

/**
 * Run one bank refresh through the Mac agent: it collects MoneyMoney locally and
 * pushes to the backend, so a failure here is a *local* condition (MoneyMoney
 * locked, no Automation grant) rather than a backend error — hence it is
 * reported, not thrown, and never marks the app offline.
 *
 * On success we re-read state instead of trusting the round trip; the live
 * subscription would deliver it too, just a beat later. On failure we
 * deliberately do NOT re-read: nothing was pushed, so the state is unchanged and
 * a fetch would only add a second way to fail.
 *
 * Dependencies are injected so this stays testable without a DOM.
 */
export async function refreshBankThroughAgent(
  agent: DashboardAgent | null = dashboardAgent(),
  refetch: () => Promise<DashboardState> = fetchState,
): Promise<BankRefresh> {
  if (!agent) return { error: null }; // not the Mac — the control isn't offered
  try {
    const result = await agent.refreshBank();
    if (!result.ok) return { error: result.error };
    return { state: await refetch(), error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
