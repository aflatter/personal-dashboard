/** A project line: color dot + name + dotted leader + mono hours. */
export function ProjectRow({ name, hours, color }: { name: string; hours: string; color: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[12.5px] text-secondary">
      <span
        className="w-[6px] h-[6px] rounded-full flex-none"
        style={{ background: color, transform: 'translateY(-1px)' }}
      />
      <span className="whitespace-nowrap overflow-hidden text-ellipsis">{name}</span>
      <span
        className="flex-1 border-b border-dotted border-[#DAD7D0]"
        style={{ transform: 'translateY(-3px)' }}
      />
      <span className="tnum text-[12px] whitespace-nowrap">{hours}</span>
    </div>
  );
}
