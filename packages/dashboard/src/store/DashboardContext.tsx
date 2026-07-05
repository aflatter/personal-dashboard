import { createContext, useContext, type ReactNode } from "react";
import { useDashboard, type DashboardStore } from "./useDashboard";

const DashboardContext = createContext<DashboardStore | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const store = useDashboard();
  if (!store.state) {
    return (
      <div className="min-h-full grid place-items-center text-secondary text-[13px]">Lädt …</div>
    );
  }
  const ready: DashboardStore = { ...store, state: store.state };
  return <DashboardContext.Provider value={ready}>{children}</DashboardContext.Provider>;
}

/** Read the dashboard store from any descendant of <DashboardProvider>. */
export function useDashboardStore(): DashboardStore {
  const store = useContext(DashboardContext);
  if (!store) throw new Error("useDashboardStore must be used within <DashboardProvider>");
  return store;
}
