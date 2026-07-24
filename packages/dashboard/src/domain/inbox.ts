import type { Inbox } from "./types";

/** Chart plot box (SVG user units), matching the design viewBox 0 0 330 72. */
const PLOT = { x0: 2, x1: 328, yTop: 10, yBase: 56 } as const;

export interface SeriesGeom {
  /** `points` for a <polyline>. */
  line: string;
  /** `d` for a filled area <path> (down to the baseline and back). */
  area: string;
  /** Endpoint coordinates for the halo dot. */
  ex: number;
  ey: number;
}

/** Project a value series onto the plot box, scaled to `max` at the top. */
export function buildSeries(values: number[], max: number): SeriesGeom {
  const { x0, x1, yTop, yBase } = PLOT;
  const n = values.length;
  const safeMax = max || 1;
  const points = values.map((v, i) => {
    const x = n > 1 ? x0 + (i / (n - 1)) * (x1 - x0) : (x0 + x1) / 2;
    const y = yBase - (Math.max(0, v) / safeMax) * (yBase - yTop);
    return [round(x), round(y)] as const;
  });
  const line = points.map((p) => `${p[0]},${p[1]}`).join(" ");
  const area = `M${points.map((p) => `${p[0]},${p[1]}`).join(" L")} L${round(x1)},${round(yBase)} L${round(x0)},${round(yBase)} Z`;
  const last = points[points.length - 1];
  return { line, area, ex: last[0], ey: last[1] };
}

/** Diverging bar chart box (SVG user units): received rises from `mid`, processed drops. */
const FLOW = { x0: 2, x1: 328, top: 3, mid: 30, bottom: 57 } as const;

/** One bar as an SVG rect. */
export interface BarRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FlowGeom {
  /** Received-per-day bars, rising from the midline. */
  received: BarRect[];
  /** Processed-per-day bars, dropping from the midline. */
  processed: BarRect[];
  /** Midline y (the shared baseline both series diverge from). */
  mid: number;
  /** The value mapped to a full half-height bar. */
  max: number;
}

/**
 * Project received/processed day series into a diverging bar chart: received
 * bars grow up from the midline, processed bars grow down, both scaled to the
 * same max so they read against each other. Same plot width as the level chart
 * so the two align day-for-day.
 */
export function buildFlow(received: number[], processed: number[]): FlowGeom {
  const { x0, x1, top, mid, bottom } = FLOW;
  const n = Math.max(received.length, processed.length, 1);
  const max = Math.max(1, ...received, ...processed);
  const slot = (x1 - x0) / n;
  const w = Math.max(1.5, slot * 0.56);
  const bar = (v: number, i: number, up: boolean): BarRect => {
    const cx = x0 + (i + 0.5) * slot;
    const h = (Math.max(0, v) / max) * (up ? mid - top : bottom - mid);
    return { x: round(cx - w / 2), y: round(up ? mid - h : mid), w: round(w), h: round(h) };
  };
  return {
    received: received.map((v, i) => bar(v, i, true)),
    processed: processed.map((v, i) => bar(v, i, false)),
    mid,
    max,
  };
}

/** Direction of the week-over-week unread change (down = fewer unread = good). */
export type DeltaDirection = "down" | "up" | "flat";

export interface InboxView {
  unread: number;
  total: number;
  /** Mail that entered the inbox today (latest received point). */
  received: number;
  /** Mail that left the inbox today (latest processed point). */
  processed: number;
  unreadSeries: SeriesGeom;
  totalSeries: SeriesGeom;
  flow: FlowGeom;
  axisMax: number;
  /** Signed change vs ~one week ago (negative = fewer unread = good). */
  delta: number;
  deltaDirection: DeltaDirection;
  hasDelta: boolean;
}

/** Derive everything the inbox card needs from raw inbox state. */
export function inboxView(inbox: Inbox): InboxView {
  const unreadHistory = inbox.history.length ? inbox.history : [inbox.unread];
  const totalHistory = inbox.totalHistory.length ? inbox.totalHistory : [inbox.total];

  // Round the larger of total / max(totalHistory) up to the next 10, min 10.
  const axisMax = Math.max(10, Math.ceil(Math.max(inbox.total, ...totalHistory) / 10) * 10);

  // Compare against the point ~7 days ago (8 back, since today is included).
  const prevIndex = Math.max(0, unreadHistory.length - 8);
  const delta = inbox.unread - unreadHistory[prevIndex];
  const deltaDirection: DeltaDirection = delta < 0 ? "down" : delta > 0 ? "up" : "flat";

  const last = (xs: number[]) => (xs.length ? xs[xs.length - 1] : 0);

  return {
    unread: inbox.unread,
    total: inbox.total,
    received: last(inbox.receivedHistory),
    processed: last(inbox.processedHistory),
    unreadSeries: buildSeries(unreadHistory, axisMax),
    totalSeries: buildSeries(totalHistory, axisMax),
    flow: buildFlow(inbox.receivedHistory, inbox.processedHistory),
    axisMax,
    delta,
    deltaDirection,
    hasDelta: delta !== 0,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
