import { z } from "zod";
import type { DashboardState } from "../api/client";

// The offline cache is the one place the SPA reads data it did not just receive
// over the wire: localStorage outlives deploys, so a cache written by an older
// build can be read by a newer one. `JSON.parse(raw) as DashboardState` asserted
// that away — a lie the compiler happily accepted, leaving a shape change to
// surface as a white screen on first render (inboxView deref'ing an array the
// old shape never had). Parsing through a schema makes the boundary honest: a
// cache that doesn't match is simply discarded and refetched.
const CACHE_KEY = "dashboard-cache-v3";

const daySeries = z.array(z.number());

const inbox = z.object({
  account: z.enum(["personal", "work"]),
  email: z.string(),
  protocol: z.enum(["IMAP", "Exchange", "JMAP"]),
  total: z.number(),
  unread: z.number(),
  history: daySeries,
  totalHistory: daySeries,
  receivedHistory: daySeries,
  processedHistory: daySeries,
});

const sourceStatus = z.object({
  polledAt: z.number().nullable(),
  ok: z.boolean(),
  error: z.string().optional(),
  staleAfter: z.number().optional(),
});

const client = z.object({
  name: z.string(),
  projects: z.array(z.object({ name: z.string(), hours: z.number() })),
});

/**
 * Annotated as `z.ZodType<DashboardState>` deliberately: if the contract grows a
 * field and this schema doesn't, the schema's output stops being assignable and
 * **tsc fails the build** — turning the drift that caused the white screen into a
 * compile error. Keep the annotation when editing.
 */
export const dashboardStateSchema: z.ZodType<DashboardState> = z.object({
  emails: z.object({ personal: inbox, work: inbox }),
  clients: z.array(client),
  rentDoneAt: z.number().nullable(),
  taxDoneAt: z.number().nullable(),
  bank: z.object({ unchecked: z.number(), syncedAt: z.number().nullable() }),
  settings: z.object({
    overdueThreshold: z.number(),
    dueSoonThreshold: z.number(),
    clockSeconds: z.boolean(),
  }),
  meta: z.object({
    "inbox:personal": sourceStatus,
    "inbox:work": sourceStatus,
    bank: sourceStatus,
    hours: sourceStatus,
  }),
});

/** Last-known state from a previous session, or null if absent, unreadable or stale-shaped. */
export function loadCache(): DashboardState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = dashboardStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null; // unavailable storage or malformed JSON
  }
}

export function saveCache(state: DashboardState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort cache — ignore quota / unavailable storage.
  }
}
