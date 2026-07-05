import { taxCalc } from "../domain";
import { useDashboardStore } from "../store/DashboardContext";
import { TaskCard } from "./ui";

/** Firmenbelege · Finanzamt — company receipts upload, a plain day-counter. */
export function TaxCard() {
  const { state, now, markTax } = useDashboardStore();
  const line = taxCalc(now, state.taxDoneAt, state.settings);

  return (
    <TaskCard
      title="Firmenbelege · Finanzamt"
      line={line}
      doneLabel="✓ aktuell"
      actionLabel="✓ erledigt"
      onAction={markTax}
      titleTruncate
    />
  );
}
