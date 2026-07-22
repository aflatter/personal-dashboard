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
export function dashboardAgent(): DashboardAgent | null {
  return typeof window === "undefined" ? null : (window.dashboardAgent ?? null);
}
