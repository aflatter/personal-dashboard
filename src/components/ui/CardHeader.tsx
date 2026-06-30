import type { ReactNode } from 'react';

/** Card title (15/600) + optional subtitle (13px secondary) with a right slot. */
export function CardHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        {subtitle != null && <div className="text-[13px] text-secondary">{subtitle}</div>}
      </div>
      {right != null && <div className="flex items-center gap-3">{right}</div>}
    </div>
  );
}
