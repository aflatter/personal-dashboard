import type { ReactNode } from 'react';

/** Neutral rounded pill (mono), e.g. "geprüft vor 5 T". */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="tnum text-[11px] text-secondary bg-[#F4F1EB] rounded-full px-[10px] py-[5px] whitespace-nowrap">
      {children}
    </span>
  );
}
