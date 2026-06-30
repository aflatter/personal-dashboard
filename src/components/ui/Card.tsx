import type { ReactNode } from 'react';
import { cx } from './cx';

/** A white widget card: 1px border, 14px radius, 18px padding. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('bg-card border border-card-border rounded-[14px] p-[18px]', className)}>
      {children}
    </div>
  );
}
