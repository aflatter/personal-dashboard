import type { ClientView } from "../../domain";
import { clientTint, formatHours } from "../../presentation";
import { StackedBar } from "./StackedBar";
import { ProjectRow } from "./ProjectRow";

/** One client's hours: swatch + name + total, a stacked bar, then its projects. */
export function ClientBlock({ client }: { client: ClientView }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="inline-flex items-center gap-2 text-[14px] font-semibold min-w-0">
          <span
            className="w-[7px] h-[7px] rounded-[2px] flex-none"
            style={{ background: clientTint(client.clientIndex, 0) }}
          />
          <span className="whitespace-nowrap overflow-hidden text-ellipsis">{client.name}</span>
        </span>
        <span className="tnum text-[13px] font-semibold whitespace-nowrap">
          {formatHours(client.total)} h
        </span>
      </div>
      <StackedBar
        segments={client.segments.map((s) => ({
          width: s.width,
          color: clientTint(s.clientIndex, s.tintLevel),
        }))}
      />
      <div className="flex flex-col gap-[5px] mt-[9px]">
        {client.projects.map((p, i) => (
          <ProjectRow
            key={i}
            name={p.name}
            hours={formatHours(p.hours)}
            color={clientTint(p.clientIndex, p.tintLevel)}
          />
        ))}
      </div>
    </div>
  );
}
