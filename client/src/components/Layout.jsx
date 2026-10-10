import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, Bot, Wrench, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, APP_BUILD } from '../version';

const navCls = ({ isActive }) => `shrink-0 inline-flex items-center gap-2 px-3 h-10 rounded-[10px] text-sm transition ${
  isActive ? 'bg-action-light text-action font-extrabold' : 'text-ink-soft font-semibold hover:bg-canvas'
}`;

export default function Layout({ children, wide = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const links = [
    { to: '/dashboard', label: 'Projets',   icon: FolderKanban },
    { to: '/agents',    label: 'Agents',    icon: Bot },
    { to: '/outils',    label: 'Mes outils', icon: Wrench },
    ...(isAdmin ? [{ to: '/admin/users', label: 'Administration', icon: Shield }] : []),
  ];

  // « Projets » reste actif dans les pages d'un projet
  const isProjectsActive = (to, isActive) => isActive || (to === '/dashboard' && pathname.startsWith('/projects'));

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="bg-white border-b border-line">
        <div className="px-4 py-1.5 flex items-center gap-4">
          <Link to="/dashboard" className="shrink-0" aria-label="BlabIA, accueil">
            <img src="/logo.png" alt="BlabIA" className="h-11" />
          </Link>
          <nav aria-label="Navigation principale" className="hidden sm:flex items-center gap-1 flex-1">
            {links.map(l => (
              <NavLink key={l.to} to={l.to}
                className={p => navCls({ isActive: isProjectsActive(l.to, p.isActive) })}>
                <l.icon size={17} aria-hidden="true" /> {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 ml-auto">
            <Link to="/profile" title="Mon profil"
              className="hidden sm:inline-flex items-center gap-2 h-10 px-2 rounded-[10px] text-sm font-semibold text-ink-soft hover:bg-canvas transition max-w-[220px]">
              <span className="w-7 h-7 rounded-full bg-ai-light text-ai text-xs font-extrabold inline-flex items-center justify-center shrink-0">
                {(user?.username || user?.email || '?')[0].toUpperCase()}
              </span>
              <span className="truncate">{user?.username ? `@${user.username}` : user?.email}</span>
            </Link>
            <button onClick={handleLogout} aria-label="Déconnexion" title="Déconnexion"
              className="inline-flex items-center gap-2 h-10 px-3 rounded-[10px] text-sm font-semibold text-ink-muted border border-line hover:bg-canvas transition">
              <LogOut size={16} aria-hidden="true" />
              <span className="hidden md:inline">Déconnexion</span>
            </button>
          </div>
        </div>
        {/* Mobile : navigation sur une ligne défilante */}
        <nav aria-label="Navigation principale" className="sm:hidden flex gap-1 overflow-x-auto px-3 pb-2">
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              className={p => navCls({ isActive: isProjectsActive(l.to, p.isActive) })}>
              <l.icon size={16} aria-hidden="true" /> {l.label}
            </NavLink>
          ))}
          <NavLink to="/profile" className={navCls}>Profil</NavLink>
        </nav>
      </header>

      <main className={`flex-1 w-full mx-auto px-4 py-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {children}
      </main>

      <footer className="text-center py-2 text-[10px] text-ink-faint/60 select-none">
        BlabIA v{APP_VERSION} — {APP_BUILD}
      </footer>
    </div>
  );
}
