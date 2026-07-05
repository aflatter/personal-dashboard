import { rentCalc } from "../domain";
import { useDashboardStore } from "../store/DashboardContext";
import { TaskCard } from "./ui";

/** Mietbuchhaltung — rent bookkeeping, due by the 4th workday each month. */
export function RentCard() {
  const { state, now, markRent } = useDashboardStore();
  const line = rentCalc(now, state.rentDoneAt);

  return (
    <TaskCard
      title="Mietbuchhaltung"
      line={line}
      doneLabel="✓ erledigt"
      actionLabel="✓ erledigt"
      onAction={markRent}
    />
  );
}
