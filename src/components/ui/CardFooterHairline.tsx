import type { ReactNode } from 'react';

/** A hairline-topped footer row pulled to the card's bottom edge. */
export function CardFooterHairline({ children }: { children: ReactNode }) {
  return (
    <div className="pt-[9px] mt-[9px] mb-[-9px] border-t border-hairline">
      <span className="tnum text-[11px] text-faint">{children}</span>
    </div>
  );
}
