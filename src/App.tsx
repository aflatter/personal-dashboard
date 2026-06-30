import { DashboardProvider } from './store/DashboardContext';
import { Dashboard } from './components/Dashboard';

export function App() {
  return (
    <DashboardProvider>
      <Dashboard />
    </DashboardProvider>
  );
}
