import type { FlowGeom } from "../../domain";

/**
 * Diverging per-day bar chart of mail flow: arrivals ("empfangen") rise from the
 * midline in slate, departures ("erledigt") drop below it in blue. The gap
 * between the two on a given day is that day's net change in the inbox — so a day
 * handled the moment it lands reads as two near-mirrored bars instead of the flat
 * line a level chart would show. Legend is carried by the numbers above, so there
 * is none here.
 *
 * Deliberately unlabelled on x: this spans FLOW_DAYS (14) days, so the weekday
 * ticks the level chart carries would misdate every bar by up to a week. Better
 * no axis than a wrong one — the component isn't handed the days to label with.
 */
export function InboxFlowChart({ flow }: { flow: FlowGeom }) {
  return (
    <svg width="100%" height="58" viewBox="0 0 330 58" className="mt-3 block overflow-visible">
      {flow.received.map((b, i) => (
        <rect key={`r${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx="1" fill="#9AA2AE" />
      ))}
      {flow.processed.map((b, i) => (
        <rect key={`p${i}`} x={b.x} y={b.y} width={b.w} height={b.h} rx="1" fill="#4F6BD8" />
      ))}
      <line x1="0" y1={flow.mid} x2="330" y2={flow.mid} stroke="#E7E4DD" strokeWidth="1" />
    </svg>
  );
}
