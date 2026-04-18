import { useAuth } from './hooks/useAuth';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';

/**
 * App.jsx — Auth guard router
 *
 * States:
 *  loading     → show spinner
 *  not logged in → AuthPage
 *  logged in   → DashboardPage
 */
export default function App() {
  const { isLoggedIn, user, loading, login, logout } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-primary)',
        flexDirection: 'column',
        gap: 16,
      }}>
        <div style={{ fontSize: 32, filter: 'drop-shadow(0 0 16px rgba(108,99,255,0.8))' }}>💬</div>
        <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <AuthPage onLogin={login} />;
  }

  return <DashboardPage user={user} onLogout={logout} />;
}
