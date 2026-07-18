import type { Client } from "../contract.ts";
import type { Poll, Source } from "./port.ts";

// Toggl Track. The Reports v3 summary returns client/project *ids* + seconds
// (no names), so names are resolved from the v9 clients/projects endpoints.
// Docs: https://engineering.toggl.com/docs/reports/summary_reports
const REPORTS_BASE = "https://api.track.toggl.com/reports/api/v3";
const V9_BASE = "https://api.track.toggl.com/api/v9";

function monthRange(now: number): { start_date: string; end_date: string } {
  const d = new Date(now);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { start_date: iso(new Date(d.getFullYear(), d.getMonth(), 1)), end_date: iso(d) };
}

interface SummaryGroup {
  id: number | null;
  sub_groups: Array<{ id: number | null; seconds: number }>;
}
interface Named {
  id: number;
  name: string;
}

async function togglJson<T>(url: string, auth: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Toggl HTTP ${res.status} (${url})`);
  return (await res.json()) as T;
}

export interface TogglConfig {
  apiToken: string;
  workspaceId: string;
}

/** This month's billed hours by client → project. Aggregate → no daily history. */
export function togglHours(cfg: TogglConfig): Source {
  return {
    id: "hours",
    historyMetrics: [],
    poll: async (): Promise<Poll> => {
      const auth = Buffer.from(`${cfg.apiToken}:api_token`).toString("base64");
      const wid = cfg.workspaceId;
      const { start_date, end_date } = monthRange(Date.now());

      const [summary, clientList, projectList] = await Promise.all([
        togglJson<{ groups: SummaryGroup[] }>(
          `${REPORTS_BASE}/workspace/${wid}/summary/time_entries`,
          auth,
          {
            method: "POST",
            body: JSON.stringify({
              start_date,
              end_date,
              grouping: "clients",
              sub_grouping: "projects",
            }),
          },
        ),
        togglJson<Named[] | null>(`${V9_BASE}/workspaces/${wid}/clients`, auth),
        togglJson<Named[] | null>(`${V9_BASE}/workspaces/${wid}/projects`, auth),
      ]);

      const clientName = new Map((clientList ?? []).map((c): [number, string] => [c.id, c.name]));
      const projectName = new Map((projectList ?? []).map((p): [number, string] => [p.id, p.name]));

      const clients: Client[] = (summary.groups ?? []).map((g) => ({
        name: (g.id != null ? clientName.get(g.id) : undefined) ?? "Ohne Mandat",
        projects: (g.sub_groups ?? []).map((sg) => ({
          name: (sg.id != null ? projectName.get(sg.id) : undefined) ?? "—",
          hours: Math.round((sg.seconds / 3600) * 10) / 10,
        })),
      }));
      return { metrics: {}, snapshot: { clients } };
    },
  };
}
