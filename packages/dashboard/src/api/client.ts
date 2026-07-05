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

function mapState(wire: StateResponse, now: number): DashboardState {
  return {
    emails: { personal: toInbox(wire.inboxes.personal), work: toInbox(wire.inboxes.work) },
    clients: wire.hours.clients,
    rentDoneAt: wire.rent.doneAt,
    taxDoneAt: wire.tax.doneAt,
    bank: { unchecked: wire.bank.unchecked, lastCheckedAt: wire.bank.lastCheckedAt ?? now },
    settings: wire.settings,
    meta: wire.meta,
  };
}

export async function fetchState(): Promise<DashboardState> {
  return mapState(await trpc.state.query(), Date.now());
}

export async function markRentDone(): Promise<DashboardState> {
  return mapState(await trpc.rentDone.mutate(), Date.now());
}

export async function markTaxDone(): Promise<DashboardState> {
  return mapState(await trpc.taxDone.mutate(), Date.now());
}

export async function saveSettings(patch: Partial<Settings>): Promise<DashboardState> {
  return mapState(await trpc.settings.mutate(patch), Date.now());
}

export async function requestSync(): Promise<DashboardState> {
  return mapState(await trpc.sync.mutate(), Date.now());
}
