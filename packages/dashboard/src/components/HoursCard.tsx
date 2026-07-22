import { hoursView, sourceProblem } from "../domain";
import { formatHours, formatMonth } from "../presentation";
import { useDashboardStore } from "../store/DashboardContext";
import { Card, ClientBlock } from "./ui";

/** Arbeitszeit — this month's billed hours, grouped by client → project. */
export function HoursCard() {
  const { state, now } = useDashboardStore();
  const view = hoursView(state.clients);
  const monthLabel = formatMonth(now);
  // Hours poll hourly, so a silent stop is invisible in the numbers themselves.
  const problem = sourceProblem(state.meta.hours, now);

  return (
    <Card>
      <div className="flex justify-between items-baseline gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Arbeitszeit</div>
          <div className="text-[13px] text-secondary">
            {monthLabel} · {view.clientCount} Mandate
          </div>
        </div>
        <span className="tnum text-[18px] font-semibold">{formatHours(view.monthTotal)} h</span>
      </div>
      <div className="flex flex-col gap-[14px] mt-4">
        {view.clients.map((client, i) => (
          <ClientBlock key={i} client={client} />
        ))}
      </div>
      {problem ? <p className="text-[11px] text-status-overdue mt-3">{problem}</p> : null}
    </Card>
  );
}
