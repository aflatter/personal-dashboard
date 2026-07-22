import { bankView, sourceProblem } from "../domain";
import { formatDayMonth } from "../presentation";
import { useDashboardStore } from "../store/DashboardContext";
import { Card, CardHeader, Pill, StatNumber, SyncButton } from "./ui";

/**
 * Girokonto (MoneyMoney) — the unreviewed-transaction backlog is the hero.
 * Read-only: MoneyMoney owns the checked/unchecked truth. MoneyMoney is synced
 * on demand (the ↺ button), never on a timer; the pill shows when it was last
 * synced and turns amber once the data is stale (never synced, or > 7 days old).
 *
 * The ↺ button only appears on the Mac: MoneyMoney can only be read by a native
 * process there, so the Mac agent collects and pushes the backlog. Every other
 * device shows the last value the Mac pushed, read-only — hence no control to
 * offer, rather than a button that couldn't work.
 */
export function BankCard() {
  const { state, now, bankSyncing, canSyncBank, bankError, syncBank } = useDashboardStore();
  const view = bankView(state.bank, now);
  // A local collect failure (MoneyMoney locked) never reaches the backend, so it
  // is only in `bankError`; `meta.bank` carries what the backend last recorded.
  // The bank has no staleness budget (it is pushed, not polled) — the pill above
  // already reports its sync age — so `sourceProblem` here only surfaces errors.
  const error = bankError ?? sourceProblem(state.meta.bank, now);
  const label =
    view.syncedAt === null ? "nie synchronisiert" : `Sync: ${formatDayMonth(view.syncedAt)}`;

  return (
    <Card>
      <CardHeader
        title="Girokonto"
        subtitle="MoneyMoney"
        right={
          <div className="flex items-center gap-3">
            <Pill stale={view.stale}>{label}</Pill>
            {canSyncBank ? <SyncButton syncing={bankSyncing} onClick={syncBank} /> : null}
          </div>
        }
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
      {/* The last sync failed (e.g. MoneyMoney locked) — show why; the count above is last-good. */}
      {error ? <p className="text-[11px] text-status-overdue mt-3">{error}</p> : null}
    </Card>
  );
}
