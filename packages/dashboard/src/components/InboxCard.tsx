import { inboxView, sourceProblem, type InboxAccount } from "../domain";
import { useDashboardStore } from "../store/DashboardContext";
import {
  Card,
  CardHeader,
  InboxChart,
  InboxFlowChart,
  StatNumber,
  SyncButton,
  WeekDelta,
} from "./ui";

/** Inbox widget (Posteingang) — used for both the personal and work account. */
export function InboxCard({ account }: { account: InboxAccount }) {
  const { state, now, syncing, sync } = useDashboardStore();
  const inbox = state.emails[account];
  const view = inboxView(inbox);
  // A failed or long-silent poll leaves the counts above frozen at their
  // last-good values, which look perfectly normal — so say so explicitly.
  const problem = sourceProblem(state.meta[`inbox:${account}`], now);

  return (
    <Card>
      <CardHeader
        title="Posteingang"
        subtitle={inbox.email}
        right={
          <>
            <WeekDelta delta={view.delta} direction={view.deltaDirection} />
            <SyncButton syncing={syncing} onClick={sync} />
          </>
        }
      />
      <div className="flex items-baseline gap-5 mt-[13px]">
        <StatNumber
          value={view.unread}
          label="ungelesen"
          valueColor="#4F6BD8"
          labelColor="#4F6BD8"
        />
        <StatNumber value={view.total} label="gesamt" valueColor="#5A6473" labelColor="#959DAA" />
      </div>
      <InboxChart unread={view.unreadSeries} total={view.totalSeries} />
      <div className="flex items-baseline gap-4 mt-[18px]">
        <StatNumber
          value={view.received}
          label="empfangen"
          valueColor="#5A6473"
          labelColor="#959DAA"
          valueClassName="text-[19px]"
          gap="gap-[5px]"
        />
        <StatNumber
          value={view.processed}
          label="erledigt"
          valueColor="#4F6BD8"
          labelColor="#4F6BD8"
          valueClassName="text-[19px]"
          gap="gap-[5px]"
        />
      </div>
      <InboxFlowChart flow={view.flow} />
      {problem ? <p className="text-[11px] text-status-overdue mt-3">{problem}</p> : null}
    </Card>
  );
}
