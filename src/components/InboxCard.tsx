import { inboxView, type InboxAccount } from '../domain';
import { useDashboardStore } from '../store/DashboardContext';
import { Card, CardHeader, InboxChart, StatNumber, SyncButton, WeekDelta } from './ui';

/** Inbox widget (Posteingang) — used for both the personal and work account. */
export function InboxCard({ account }: { account: InboxAccount }) {
  const { state, syncing, sync } = useDashboardStore();
  const inbox = state.emails[account];
  const view = inboxView(inbox);

  return (
    <Card>
      <CardHeader
        title="Posteingang"
        subtitle={inbox.email}
        right={
          <>
            <WeekDelta text={view.deltaText} color={view.deltaColor} visible={view.hasDelta} />
            <SyncButton syncing={syncing} onClick={sync} />
          </>
        }
      />
      <div className="flex items-baseline gap-5 mt-[13px]">
        <StatNumber value={view.unread} label="ungelesen" valueColor="#4F6BD8" labelColor="#4F6BD8" />
        <StatNumber value={view.total} label="gesamt" valueColor="#5A6473" labelColor="#959DAA" />
      </div>
      <InboxChart unread={view.unreadSeries} total={view.totalSeries} />
    </Card>
  );
}
