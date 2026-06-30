import type { Client } from './types';
import { CLIENT_COLORS } from './constants';
import { formatHours, lighten } from './format';

/** A project's lightened tint within its client's bar/list. */
export interface ProjectView {
  name: string;
  /** de-DE hours, e.g. "18,5". */
  hours: string;
  color: string;
}

/** One segment of a client's stacked bar (a project's share of the client). */
export interface ClientSegment {
  /** CSS width percentage, e.g. "62.7%". */
  width: string;
  color: string;
}

export interface ClientView {
  name: string;
  color: string;
  /** de-DE client total, e.g. "23,5". */
  total: string;
  projects: ProjectView[];
  segments: ClientSegment[];
}

export interface HoursView {
  clients: ClientView[];
  /** de-DE month total across all clients, e.g. "61". */
  monthTotal: string;
  clientCount: number;
}

/**
 * Aggregate the current month's clients → projects: per-client totals, a
 * stacked bar of project shares, and lightened tints (project j is the client
 * base color mixed toward white by j × 32%).
 */
export function hoursView(clients: Client[]): HoursView {
  const totals = clients.map((c) => c.projects.reduce((sum, p) => sum + p.hours, 0));
  const monthTotal = totals.reduce((sum, t) => sum + t, 0);

  const views: ClientView[] = clients.map((client, i) => {
    const base = CLIENT_COLORS[i % CLIENT_COLORS.length];
    const clientTotal = totals[i] || 1;
    const projects: ProjectView[] = client.projects.map((p, j) => ({
      name: p.name,
      hours: formatHours(p.hours),
      color: lighten(base, j * 0.32),
    }));
    const segments: ClientSegment[] = client.projects.map((p, j) => ({
      width: `${((p.hours / clientTotal) * 100).toFixed(1)}%`,
      color: lighten(base, j * 0.32),
    }));
    return { name: client.name, color: base, total: formatHours(totals[i]), projects, segments };
  });

  return { clients: views, monthTotal: formatHours(monthTotal), clientCount: clients.length };
}
