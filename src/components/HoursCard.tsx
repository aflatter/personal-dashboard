import { hoursView, MONTHS } from '../domain';
import { useDashboardStore } from '../store/DashboardContext';
import { Card, ClientBlock } from './ui';

/** Arbeitszeit — this month's billed hours, grouped by client → project. */
export function HoursCard() {
  const { state, now } = useDashboardStore();
  const view = hoursView(state.clients);
  const monthLabel = MONTHS[new Date(now).getMonth()];

  return (
    <Card>
      <div className="flex justify-between items-baseline gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold">Arbeitszeit</div>
          <div className="text-[13px] text-secondary">
            {monthLabel} · {view.clientCount} Mandate
          </div>
        </div>
        <span className="tnum text-[18px] font-semibold">{view.monthTotal} h</span>
      </div>
      <div className="flex flex-col gap-[14px] mt-4">
        {view.clients.map((client, i) => (
          <ClientBlock key={i} client={client} />
        ))}
      </div>
    </Card>
  );
}
