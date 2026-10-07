import { Dashboard } from './components/Dashboard';
import { ReportFiltersProvider } from './lib/reportFiltersContext';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <ReportFiltersProvider>
        <Dashboard />
      </ReportFiltersProvider>
    </ErrorBoundary>
  );
}

export default App;
