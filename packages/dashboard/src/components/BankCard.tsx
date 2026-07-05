import { bankView } from "../domain";
import { useDashboardStore } from "../store/DashboardContext";
import { ActionButton, Card, CardHeader, Pill, StatNumber } from "./ui";

/** Spaßkonto (MoneyMoney) — the unreviewed-transaction backlog is the hero. */
export function BankCard() {
  const { state, now, markBank } = useDashboardStore();
  const view = bankView(state.bank, now);

  return (
    <Card>
      <CardHeader
        title="Spaßkonto"
        subtitle="MoneyMoney"
        right={<Pill>geprüft vor {view.sinceDays} T</Pill>}
      />
      <div className="flex items-end justify-between gap-3 mt-4">
        <StatNumber
          value={view.unchecked}
          label="offen"
          valueColor="#B98A3A"
          labelColor="#6E6D68"
          valueClassName="text-[32px]"
          gap="gap-[6px]"
        />
        <ActionButton label="✓ geprüft" onClick={markBank} />
      </div>
    </Card>
  );
}
