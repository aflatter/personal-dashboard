import { useCallback, useEffect, useRef, useState } from 'react';
import type { Inbox, Settings } from '../domain';
import { createSeed, type DashboardState } from './seed';

const STORAGE_KEY = 'dashboard-areas-v2';

function loadState(now: number): DashboardState {
  const seed = createSeed(now);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed;
    const saved = JSON.parse(raw) as Partial<DashboardState>;
    return {
      ...seed,
      ...saved,
      emails: saved.emails ?? seed.emails,
      bank: saved.bank ?? seed.bank,
      clients: saved.clients ?? seed.clients,
      settings: { ...seed.settings, ...saved.settings },
    };
  } catch {
    return seed;
  }
}

function saveState(state: DashboardState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota / unavailable storage — persistence is best-effort.
  }
}

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Fake re-fetch: nudge totals/unread and append today's point to both series. */
function nudgeInbox(inbox: Inbox): Inbox {
  const total = Math.max(0, inbox.total + randomInt(-3, 5));
  const unread = Math.max(0, Math.min(total, inbox.unread + randomInt(-3, 4)));
  return {
    ...inbox,
    total,
    unread,
    history: [...inbox.history.slice(-10), unread],
    totalHistory: [...inbox.totalHistory.slice(-10), total],
  };
}

export interface DashboardStore {
  state: DashboardState;
  /** Wall-clock, refreshed every second (drives the clock + day counters). */
  now: number;
  syncing: boolean;
  sync: () => void;
  markRent: () => void;
  markTax: () => void;
  markBank: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
}

/** Single source of truth for the dashboard: seeded state + actions. */
export function useDashboard(): DashboardStore {
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<DashboardState>(() => loadState(Date.now()));
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live clock — also keeps day counters current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Persist on every state change.
  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => () => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
  }, []);

  const sync = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    syncTimer.current = setTimeout(() => {
      setState((s) => ({
        ...s,
        emails: { personal: nudgeInbox(s.emails.personal), work: nudgeInbox(s.emails.work) },
        bank: { ...s.bank, unchecked: Math.max(0, s.bank.unchecked + randomInt(-1, 3)) },
        lastSyncAt: Date.now(),
      }));
      syncingRef.current = false;
      setSyncing(false);
    }, 650);
  }, []);

  const markRent = useCallback(() => setState((s) => ({ ...s, rentDoneAt: Date.now() })), []);
  const markTax = useCallback(() => setState((s) => ({ ...s, taxDoneAt: Date.now() })), []);
  const markBank = useCallback(
    () => setState((s) => ({ ...s, bank: { unchecked: 0, lastCheckedAt: Date.now() } })),
    [],
  );
  const updateSettings = useCallback(
    (partial: Partial<Settings>) =>
      setState((s) => ({ ...s, settings: { ...s.settings, ...partial } })),
    [],
  );

  return { state, now, syncing, sync, markRent, markTax, markBank, updateSettings };
}
