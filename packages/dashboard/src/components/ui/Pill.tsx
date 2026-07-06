import type { ReactNode } from "react";

/**
 * Rounded pill (mono), e.g. "Sync: 1. Juli". `stale` switches it to an amber
 * warning tone to flag out-of-date data.
 */
export function Pill({ children, stale = false }: { children: ReactNode; stale?: boolean }) {
  const tone = stale ? "text-status-overdue bg-[#FBEAE8]" : "text-secondary bg-[#F4F1EB]";
  return (
    <span className={`tnum text-[11px] rounded-full px-[10px] py-[5px] whitespace-nowrap ${tone}`}>
      {children}
    </span>
  );
}
