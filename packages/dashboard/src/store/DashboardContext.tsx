import { createContext, useContext, type ReactNode } from "react";
import { useDashboard, type DashboardStore } from "./useDashboard";

const DashboardContext = createContext<DashboardStore | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const store = useDashboard();
  return <DashboardContext.Provider value={store}>{children}</DashboardContext.Provider>;
}

/** Read the dashboard store from any descendant of <DashboardProvider>. */
export function useDashboardStore(): DashboardStore {
  const store = useContext(DashboardContext);
  if (!store) throw new Error("useDashboardStore must be used within <DashboardProvider>");
  return store;
}
