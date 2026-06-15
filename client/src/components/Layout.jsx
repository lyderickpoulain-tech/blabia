import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, APP_BUILD } from '../version';

export default function Layout({ children, wide = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <Link to="/dashboard" className="text-xl font-bold text-blue-600 hover:text-blue-700">
          BlabIA
        </Link>
        <div className="flex items-center gap-4">
          <Link
            to="/agents"
            className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
          >
            Agents
          </Link>
          <Link
            to="/profile/environment"
            className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
          >
            Mon environnement
          </Link>
          {user?.role === 'admin' && (
            <Link
              to="/admin/invitations"
              className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
            >
              Invitations
            </Link>
          )}
          <span className="text-sm text-gray-500 hidden sm:block">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition min-h-[40px]"
          >
            <span className="hidden sm:inline">Déconnexion</span>
            <span className="sm:hidden">←</span>
          </button>
        </div>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {children}
      </main>

      <footer className="text-center py-2 text-[10px] text-gray-300 select-none">
        BlabIA v{APP_VERSION} — {APP_BUILD}
      </footer>
    </div>
  );
}
