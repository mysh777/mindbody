import { Dashboard } from './components/Dashboard';
import { ReportFiltersProvider } from './lib/reportFiltersContext';

function App() {
  return (
    <ReportFiltersProvider>
      <Dashboard />
    </ReportFiltersProvider>
  );
}

export default App;
