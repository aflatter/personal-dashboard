import type { SeriesGeom } from "../../domain";

/**
 * Two-series area chart: slate total line + blue unread line drawn on top, with
 * haloed endpoint dots and Mo/Mi/Fr/So axis ticks. The big numbers above carry
 * the legend, so there is none here.
 */
export function InboxChart({ unread, total }: { unread: SeriesGeom; total: SeriesGeom }) {
  return (
    <svg width="100%" height="72" viewBox="0 0 330 72" className="mt-4 block overflow-visible">
      <line x1="0" y1="10" x2="330" y2="10" stroke="#F4F2ED" strokeWidth="1" />
      <line x1="0" y1="56" x2="330" y2="56" stroke="#E7E4DD" strokeWidth="1" />

      <path d={total.area} fill="#9AA2AE" fillOpacity="0.14" />
      <polyline
        points={total.line}
        fill="none"
        stroke="#9098A4"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path d={unread.area} fill="#4F6BD8" fillOpacity="0.1" />
      <polyline
        points={unread.line}
        fill="none"
        stroke="#4F6BD8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx={total.ex} cy={total.ey} r="4" fill="#fff" />
      <circle cx={total.ex} cy={total.ey} r="2.4" fill="#9098A4" />
      <circle cx={unread.ex} cy={unread.ey} r="4.4" fill="#fff" />
      <circle cx={unread.ex} cy={unread.ey} r="2.8" fill="#4F6BD8" />

      <g className="tnum" style={{ fontSize: "8.5px", fill: "#B4B1A8" }}>
        <text x="2" y="70" textAnchor="start">
          Mo
        </text>
        <text x="110" y="70" textAnchor="middle">
          Mi
        </text>
        <text x="219" y="70" textAnchor="middle">
          Fr
        </text>
        <text x="328" y="70" textAnchor="end" fill="#1B1B1A" fontWeight="600">
          So
        </text>
      </g>
    </svg>
  );
}
