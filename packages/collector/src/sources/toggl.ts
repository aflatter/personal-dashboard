import type { Client } from "../contract.ts";
import type { Poll, Source } from "./port.ts";

// Toggl Track Reports API v3 — current-month summary grouped clients → projects.
// Docs: https://engineering.toggl.com/docs/reports/summary_reports
const REPORTS_BASE = "https://api.track.toggl.com/reports/api/v3";

function monthRange(now: number): { start_date: string; end_date: string } {
  const d = new Date(now);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start_date: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end_date: iso(d) };
}

/** This month's billed hours by client → project. Aggregate → no daily history. */
export function togglHours(): Source {
  return {
    id: "hours",
    historyMetrics: [],
    ready: (secrets) => Boolean(secrets.togglApiToken && secrets.togglWorkspaceId),
    poll: async (secrets): Promise<Poll> => {
      const auth = Buffer.from(`${secrets.togglApiToken}:api_token`).toString("base64");
      const { start_date, end_date } = monthRange(Date.now());
      const res = await fetch(
        `${REPORTS_BASE}/workspace/${secrets.togglWorkspaceId}/summary/time_entries`,
        {
          method: "POST",
          headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date,
            end_date,
            grouping: "clients",
            sub_grouping: "projects",
          }),
        },
      );
      if (!res.ok) throw new Error(`Toggl Reports HTTP ${res.status}`);
      // VERIFY against a live response: confirm the grouping keys and where
      // client/project *titles* live (v3 may return ids needing a /clients +
      // /projects name lookup, or a title object per group).
      const body = (await res.json()) as {
        groups: Array<{
          title?: { client?: string | null };
          sub_groups: Array<{ title?: string | null; seconds: number }>;
        }>;
      };
      const clients: Client[] = (body.groups ?? []).map((g) => ({
        name: g.title?.client ?? "—",
        projects: (g.sub_groups ?? []).map((sg) => ({
          name: sg.title ?? "—",
          hours: Math.round((sg.seconds / 3600) * 10) / 10,
        })),
      }));
      return { metrics: {}, snapshot: { clients } };
    },
  };
}
