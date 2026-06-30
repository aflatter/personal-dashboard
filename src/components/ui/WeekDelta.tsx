/** Week-over-week unread delta, e.g. "▼ 2 ggü. Vorwoche". Hidden when zero. */
export function WeekDelta({ text, color, visible }: { text: string; color: string; visible: boolean }) {
  if (!visible) return null;
  return (
    <span className="tnum text-[10.5px] font-medium whitespace-nowrap" style={{ color }}>
      {text}
    </span>
  );
}
