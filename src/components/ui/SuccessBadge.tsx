/** Green "done" badge, e.g. "✓ aktuell" / "✓ erledigt". */
export function SuccessBadge({ label }: { label: string }) {
  return (
    <span className="tnum text-[10px] font-bold bg-[#EAF7F1] text-success rounded-full px-[10px] py-[4px] whitespace-nowrap flex-none tracking-[0.02em]">
      {label}
    </span>
  );
}
