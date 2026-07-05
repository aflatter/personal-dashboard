import type { InboxState, SourceId, SourceStatus, StateResponse } from "@dash/shared";
import type { Bank, Inbox, Settings } from "../domain";

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

const BASE = "/api";

async function readState(res: Response): Promise<DashboardState> {
  if (!res.ok) throw new Error(`collector ${res.status}`);
  const wire = (await res.json()) as StateResponse;
  return mapState(wire, Date.now());
}

async function post(path: string, body: unknown = {}): Promise<DashboardState> {
  return readState(
    await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function fetchState(): Promise<DashboardState> {
  return readState(await fetch(`${BASE}/state`));
}

export const markRentDone = (): Promise<DashboardState> => post("/rent/done");
export const markTaxDone = (): Promise<DashboardState> => post("/tax/done");
export const saveSettings = (patch: Partial<Settings>): Promise<DashboardState> =>
  post("/settings", patch);
export const requestSync = (): Promise<DashboardState> => post("/sync");
