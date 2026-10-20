import { AuthProvider, useAuth } from './lib/auth';
import { Dashboard } from './components/Dashboard';
import { SignIn } from './components/SignIn';
import { ResetPassword } from './components/ResetPassword';
import { ReportFiltersProvider } from './lib/reportFiltersContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Loader2 } from 'lucide-react';

function isResetPasswordRoute() {
  return window.location.hash.replace(/^#\/?/, '') === 'reset-password';
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (isResetPasswordRoute()) {
    return <ResetPassword />;
  }

  if (!session) {
    return <SignIn />;
  }

  return (
    <ReportFiltersProvider>
      <Dashboard />
    </ReportFiltersProvider>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
