import type { Client } from "./types";

/** A project's share within its client, tagged for color tinting in the view. */
export interface ProjectView {
  name: string;
  hours: number;
  /** Index of the owning client (selects the base color). */
  clientIndex: number;
  /** Tint step within the client (0 = base, higher = lighter). */
  tintLevel: number;
}

/** One segment of a client's stacked bar (a project's share of the client). */
export interface ClientSegment {
  /** CSS width percentage, e.g. "62.7%". */
  width: string;
  clientIndex: number;
  tintLevel: number;
}

export interface ClientView {
  name: string;
  /** Index into the client color cycle (the view maps this to a color). */
  clientIndex: number;
  total: number;
  projects: ProjectView[];
  segments: ClientSegment[];
}

export interface HoursView {
  clients: ClientView[];
  monthTotal: number;
  clientCount: number;
}

/**
 * Aggregate the current month's clients → projects: per-client totals and a
 * stacked bar of project shares. Colors are a view concern — the view derives
 * them from `clientIndex` + `tintLevel` (project j is the client base color
 * mixed toward white by j × 32%).
 */
export function hoursView(clients: Client[]): HoursView {
  const totals = clients.map((c) => c.projects.reduce((sum, p) => sum + p.hours, 0));
  const monthTotal = totals.reduce((sum, t) => sum + t, 0);

  const views: ClientView[] = clients.map((client, i) => {
    const clientTotal = totals[i] || 1;
    const projects: ProjectView[] = client.projects.map((p, j) => ({
      name: p.name,
      hours: p.hours,
      clientIndex: i,
      tintLevel: j,
    }));
    const segments: ClientSegment[] = client.projects.map((p, j) => ({
      width: `${((p.hours / clientTotal) * 100).toFixed(1)}%`,
      clientIndex: i,
      tintLevel: j,
    }));
    return { name: client.name, clientIndex: i, total: totals[i], projects, segments };
  });

  return { clients: views, monthTotal, clientCount: clients.length };
}
