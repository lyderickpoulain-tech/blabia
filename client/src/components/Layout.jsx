import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { FolderKanban, Bot, Shield, LogOut, LifeBuoy } from 'lucide-react';
import Tutorial from './Tutorial';
import ThemeToggle from './ThemeToggle';
import { useTour } from '../tour/TourContext';
import { useAuth } from '../contexts/AuthContext';
import { APP_VERSION, APP_BUILD } from '../version';

const navCls = ({ isActive }) => `shrink-0 inline-flex items-center gap-2 px-3 h-10 rounded-[10px] text-sm transition ${
  isActive ? 'bg-action-light text-action font-extrabold' : 'text-ink-soft font-semibold hover:bg-canvas'
}`;

export default function Layout({ children, wide = false }) {
  const { user, logout, markTutorialSeen } = useAuth();
  // Guide : ouvert d'office tant qu'il n'a jamais été vu (tutorialSeenAt === null), sinon à la demande
  // Ouvert à la demande : directement sur les chapitres de la visite guidée
  const [guideOpen, setGuideOpen] = useState(false);
  const tour = useTour();
  const firstVisit = user?.tutorialSeenAt === null;
  const showGuide = (guideOpen || firstVisit) && !tour?.active;
  const closeGuide = () => { setGuideOpen(false); if (!user?.tutorialSeenAt) markTutorialSeen(); };
  const startTour = chapterIds => { closeGuide(); tour?.start(chapterIds); };
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
    ...(isAdmin ? [{ to: '/admin/users', label: 'Administration', icon: Shield }] : []),
  ];

  // « Projets » reste actif dans les pages d'un projet
  const isProjectsActive = (to, isActive) => isActive || (to === '/dashboard' && pathname.startsWith('/projects'));

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* Accès direct au contenu, au clavier (audit d'accessibilité) */}
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-action focus:font-bold focus:px-4 focus:py-2 focus:rounded-[10px] focus:shadow-lg">Aller au contenu</a>
      <header className="bg-white border-b border-line">
        <div className="px-4 py-1.5 flex items-center gap-4">
          <Link to="/dashboard" className="shrink-0" aria-label="BlabIA, accueil">
            {/* TODO: migrer le logo en SVG currentColor */}
            <span className="logo-chip"><img src="/logo.png" alt="BlabIA" className="h-11" /></span>
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
            <ThemeToggle />
            <button data-tour="nav-guide" onClick={() => setGuideOpen(true)} aria-label="Guide de prise en main" title="Guide de prise en main"
              className="inline-flex items-center gap-2 h-10 px-3 rounded-[10px] text-sm font-semibold text-ai hover:bg-ai-bg transition">
              <LifeBuoy size={17} aria-hidden="true" />
              <span className="hidden md:inline">Guide</span>
            </button>
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

      <main id="contenu" tabIndex={-1} className={`flex-1 w-full mx-auto px-4 py-6 pb-24 outline-none ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
        {children}
      </main>

      {showGuide && user && (
        <Tutorial role={user.role} tourProgress={user.tourProgress} initialScreen={firstVisit ? 'welcome' : 'chapters'}
          onClose={closeGuide} onStart={startTour} />
      )}

      <footer className="text-center py-2 text-[11px] text-ink-faint select-none">
        BlabIA v{APP_VERSION} — {APP_BUILD}
      </footer>
    </div>
  );
}
