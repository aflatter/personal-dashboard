import type { DeltaDirection } from "../../domain";
import { cx } from "./cx";

const ARROW: Record<DeltaDirection, string> = { down: "▼", up: "▲", flat: "■" };

// Falling unread is good (green), rising is bad (amber).
const TONE: Record<DeltaDirection, string> = {
  down: "text-success",
  up: "text-delta-up",
  flat: "text-muted",
};

/** Week-over-week unread delta, e.g. "▼ 2 ggü. Vorwoche". Hidden when unchanged. */
export function WeekDelta({ delta, direction }: { delta: number; direction: DeltaDirection }) {
  if (delta === 0) return null;
  return (
    <span className={cx("tnum text-[10.5px] font-medium whitespace-nowrap", TONE[direction])}>
      {ARROW[direction]} {Math.abs(delta)} ggü. Vorwoche
    </span>
  );
}
