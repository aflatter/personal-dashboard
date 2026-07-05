/** A life-area column header: accent dot + label + 2px accent underline. */
export function ColumnHeader({ label, accent }: { label: string; accent: string }) {
  return (
    <div
      className="flex items-center gap-2 pb-[10px] mb-[14px] border-b-2"
      style={{ borderColor: accent }}
    >
      <span className="w-[9px] h-[9px] rounded-full flex-none" style={{ background: accent }} />
      <span className="text-[13px] font-bold tracking-[0.02em]">{label}</span>
    </div>
  );
}
