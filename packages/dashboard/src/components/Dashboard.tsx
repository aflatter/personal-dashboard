import type { ReactNode } from "react";
import { ColumnHeader } from "./ui";
import { DashboardHeader } from "./DashboardHeader";
import { InboxCard } from "./InboxCard";
import { BankCard } from "./BankCard";
import { RentCard } from "./RentCard";
import { TaxCard } from "./TaxCard";
import { HoursCard } from "./HoursCard";

/** The dashboard shell: header + three life-area columns. */
export function Dashboard() {
  return (
    <div className="min-h-full px-6 pt-7 pb-10">
      <div className="max-w-[1120px] mx-auto">
        <DashboardHeader />
        <div className="grid grid-cols-1 min-[900px]:grid-cols-3 gap-4 items-start">
          <Column label="Persönlich" accent="#4F6BD8">
            <InboxCard account="personal" />
            <BankCard />
          </Column>
          <Column label="tevim GmbH" accent="#C77A2E">
            <InboxCard account="work" />
            <TaxCard />
            <HoursCard />
          </Column>
          <Column label="Immobilien" accent="#3E8E6B">
            <RentCard />
          </Column>
        </div>
      </div>
    </div>
  );
}

function Column({
  label,
  accent,
  children,
}: {
  label: string;
  accent: string;
  children: ReactNode;
}) {
  return (
    <div>
      <ColumnHeader label={label} accent={accent} />
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}
