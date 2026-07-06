// Data shapes the collector produces. The tRPC router's procedures return these,
// so the dashboard infers them from AppRouter — this file is the origin, not a
// separately-maintained "shared" contract. Pure types, no tRPC, no deps.

export type InboxAccount = "personal" | "work";
export type MailProtocol = "IMAP" | "Exchange" | "JMAP";

/** One day-bucketed history sample. `day` is a local calendar date, "YYYY-MM-DD". */
export interface DayPoint {
  day: string;
  value: number;
}

export interface InboxState {
  account: InboxAccount;
  email: string;
  protocol: MailProtocol;
  unread: number;
  total: number;
  /** Unread per day (oldest → newest); the app accumulates this — the source only gives "now". */
  unreadHistory: DayPoint[];
  totalHistory: DayPoint[];
}

export interface BankState {
  /** Unreviewed transactions — the actionable backlog (hero number). */
  unchecked: number;
  /** When MoneyMoney was last successfully synced, or null if never. */
  syncedAt: number | null;
}

export interface Project {
  name: string;
  /** Hours billed this month. */
  hours: number;
}

export interface Client {
  name: string;
  projects: Project[];
}

/** User-configurable thresholds and display options. */
export interface Settings {
  overdueThreshold: number;
  dueSoonThreshold: number;
  clockSeconds: boolean;
}

/** Every polled/derived source, for per-source liveness reporting. */
export type SourceId = "inbox:personal" | "inbox:work" | "bank" | "hours";

export interface SourceStatus {
  /** Last successful poll, or null if never polled. */
  polledAt: number | null;
  ok: boolean;
  /** Present when the last poll failed (e.g. "MoneyMoney locked"). */
  error?: string;
}

/** The full dashboard state (the `state` query's result). */
export interface StateResponse {
  inboxes: { personal: InboxState; work: InboxState };
  bank: BankState;
  hours: { clients: Client[] };
  rent: { doneAt: number | null };
  tax: { doneAt: number | null };
  settings: Settings;
  meta: Record<SourceId, SourceStatus>;
}
