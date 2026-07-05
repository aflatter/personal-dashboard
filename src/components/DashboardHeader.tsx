import { formatClock, formatHeaderDate } from "../presentation";
import { useDashboardStore } from "../store/DashboardContext";
import { SettingsPopover } from "./SettingsPopover";

/** Page header: greeting + live date/clock + settings. */
export function DashboardHeader() {
  const { now, state } = useDashboardStore();
  const dateStr = formatHeaderDate(now);
  const clock = formatClock(now, state.settings.clockSeconds);

  return (
    <div className="flex items-center justify-between gap-5 flex-wrap mb-6">
      <h1 className="text-[22px] font-bold m-0 tracking-[-0.015em]">Guten Morgen.</h1>
      <div className="flex items-center gap-[14px]">
        <span className="tnum text-[13px] text-secondary capitalize">{dateStr}</span>
        <span className="tnum text-[15px] font-medium text-ink tracking-[0.5px]">{clock}</span>
        <SettingsPopover />
      </div>
    </div>
  );
}
