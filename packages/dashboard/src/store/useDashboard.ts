import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "../domain";
import {
  dashboardAgent,
  fetchState,
  markRentDone,
  markTaxDone,
  refreshBankThroughAgent,
  requestSync,
  saveSettings,
  subscribeState,
  type DashboardState,
} from "../api/client";

// Bump when the cached DashboardState shape changes so stale-shaped caches are dropped.
const CACHE_KEY = "dashboard-cache-v2";
const POLL_MS = 30_000;

function loadCache(): DashboardState | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as DashboardState) : null;
  } catch {
    return null;
  }
}

function saveCache(state: DashboardState): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort cache — ignore quota / unavailable storage.
  }
}

export interface DashboardStore {
  state: DashboardState;
  /** Wall-clock, refreshed every second (drives the clock + day counters). */
  now: number;
  syncing: boolean;
  /** True while an on-demand MoneyMoney sync is in flight. */
  bankSyncing: boolean;
  /**
   * Whether this device can refresh MoneyMoney at all — i.e. it is the Mac app,
   * where the agent bridge exists. False on the phone / in a browser tab, which
   * read the last-known backlog the Mac pushed.
   */
  canSyncBank: boolean;
  /** Why the last local MoneyMoney refresh failed (locked, not authorised, …). */
  bankError: string | null;
  /** False when the last collector call failed — the UI is showing cached data. */
  online: boolean;
  sync: () => void;
  syncBank: () => void;
  markRent: () => void;
  markTax: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
}

/** Thin client over the collector: fetch + poll state, POST mutations, cache locally. */
export function useDashboard() {
  const [now, setNow] = useState(() => Date.now());
  const [state, setState] = useState<DashboardState | null>(() => loadCache());
  const [syncing, setSyncing] = useState(false);
  const [bankSyncing, setBankSyncing] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const syncingRef = useRef(false);
  const bankSyncingRef = useRef(false);

  const apply = useCallback((next: DashboardState) => {
    setState(next);
    saveCache(next);
    setOnline(true);
  }, []);

  // Live clock — also keeps day counters current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Initial load + background poll. The poll is a safety net behind the live SSE
  // subscription below: if the stream drops, the UI still reconciles every POLL_MS.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchState()
        .then((s) => alive && apply(s))
        .catch(() => alive && setOnline(false));
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [apply]);

  // Live updates: the collector pushes fresh state over SSE the moment it changes
  // (a poll commit — including a Fastmail push — or a mutation), so the widgets
  // track the mailbox within a second rather than on the next poll tick.
  useEffect(() => {
    return subscribeState(apply, () => setOnline(false));
  }, [apply]);

  const mutate = useCallback(
    (p: Promise<DashboardState>) => {
      p.then(apply).catch(() => setOnline(false));
    },
    [apply],
  );

  const sync = useCallback(() => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    requestSync()
      .then(apply)
      .catch(() => setOnline(false))
      .finally(() => {
        syncingRef.current = false;
        setSyncing(false);
      });
  }, [apply]);

  // On-demand MoneyMoney sync. Runs on the *Mac*, not the backend: the agent
  // collects locally (AppleScript — slow, and fails when MoneyMoney is locked)
  // and pushes the result up, so a failure is a local condition the person at
  // this Mac can fix, not a backend error. Own in-flight flag, independent of the
  // inbox refresh. On success we re-read state rather than trust the round trip;
  // the live subscription would deliver it too, just a beat later.
  const syncBank = useCallback(() => {
    if (!dashboardAgent() || bankSyncingRef.current) return;
    bankSyncingRef.current = true;
    setBankSyncing(true);
    setBankError(null);
    refreshBankThroughAgent()
      .then(({ state: fresh, error }) => {
        setBankError(error);
        if (fresh) apply(fresh);
      })
      .finally(() => {
        bankSyncingRef.current = false;
        setBankSyncing(false);
      });
  }, [apply]);

  const markRent = useCallback(() => mutate(markRentDone()), [mutate]);
  const markTax = useCallback(() => mutate(markTaxDone()), [mutate]);
  const updateSettings = useCallback(
    (partial: Partial<Settings>) => mutate(saveSettings(partial)),
    [mutate],
  );

  return {
    state,
    now,
    syncing,
    bankSyncing,
    canSyncBank: dashboardAgent() !== null,
    bankError,
    online,
    sync,
    syncBank,
    markRent,
    markTax,
    updateSettings,
  };
}
