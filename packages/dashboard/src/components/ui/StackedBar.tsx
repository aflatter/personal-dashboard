/** A thin stacked bar: one segment per project, tinted toward white. */
export function StackedBar({ segments }: { segments: Array<{ width: string; color: string }> }) {
  return (
    <div className="flex h-[5px] rounded-full overflow-hidden gap-[2px] mt-2">
      {segments.map((seg, i) => (
        <span key={i} style={{ width: seg.width, background: seg.color }} />
      ))}
    </div>
  );
}
