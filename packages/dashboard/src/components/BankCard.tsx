import { bankView } from "../domain";
import { useDashboardStore } from "../store/DashboardContext";
import { Card, CardHeader, Pill, StatNumber } from "./ui";

/**
 * Spaßkonto (MoneyMoney) — the unreviewed-transaction backlog is the hero.
 * Read-only: MoneyMoney owns the checked/unchecked truth; the count falls as
 * items are reviewed there. When its source is stale the pill says so.
 */
export function BankCard() {
  const { state, now } = useDashboardStore();
  const view = bankView(state.bank, now);
  const stale = !state.meta.bank.ok;

  return (
    <Card>
      <CardHeader
        title="Spaßkonto"
        subtitle="MoneyMoney"
        right={<Pill>{stale ? "MoneyMoney offline" : `geprüft vor ${view.sinceDays} T`}</Pill>}
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
      </div>
    </Card>
  );
}
