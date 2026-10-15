import { Suspense, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { LayoutDashboard, ListOrdered, History, ScrollText, ListChecks, FileText, Wrench, Users, Settings, GitPullRequest, MessageCircleMore } from 'lucide-react';
import Layout from '../Layout';
import PageLoader from '../PageLoader';
import { Badge } from '../ui';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { attentionCount } from '../../utils/toolsCatalog';
import usePresence from '../../hooks/usePresence';

// Cadre commun des pages d'un projet (refonte UX v5.1) : en-tête du projet,
// barre latérale (Tableau de bord, Plan, Historique, Décisions, Outils,
// Équipe, Paramètres) et contexte partagé (projet, droits, points d'attention).

const ProjectContext = createContext(null);
export const useProject = () => useContext(ProjectContext);

const NAV = [
  { to: '',           end: true, label: 'Tableau de bord', icon: LayoutDashboard },
  { to: 'bras-droit', label: 'Bras droit',  icon: MessageCircleMore }, // v5.1 : interlocuteur principal en tête-à-tête
  { to: 'reunions',   label: 'Plan',        icon: ListOrdered },
  { to: 'historique', label: 'Historique',  icon: History },
  { to: 'decisions',  label: 'Décisions',   icon: ScrollText, badge: 'decisions' },
  { to: 'actions',    label: 'Actions',     icon: ListChecks, badge: 'actions' },
  { to: 'documents',  label: 'Documents',   icon: FileText },
  { to: 'outils',     label: 'Outils',      icon: Wrench,     badge: 'tools' },
  { to: 'developpements', label: 'Développements', icon: GitPullRequest, show: p => !!p.githubRepo, badge: 'dev' }, // dépôt GitHub choisi (Paramètres)
  { to: 'equipe',     label: 'Équipe',      icon: Users },
  { to: 'parametres', label: 'Paramètres',  icon: Settings },
];

export default function ProjectShell() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  usePresence(id); // présence sur le projet (carte du projet : voyant, dernière venue)
  const isAdmin = user?.role === 'admin' || user?.role === 'supervisor';

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts]   = useState({ decisionsReopened: 0, decisionsActive: 0, toolsAttention: 0, actionsOpen: 0, actionsOverdue: 0, devAwaiting: 0, devRunning: false });

  const reloadProject = useCallback(() =>
    api.get(`/projects/${id}`).then(({ data }) => setProject(data)), [id]);

  // Pastilles de la barre latérale : décisions remises en question, outils à revoir
  const refreshCounts = useCallback(() => {
    api.get(`/projects/${id}/decisions`)
      .then(({ data }) => setCounts(c => ({
        ...c,
        decisionsReopened: data.filter(d => d.status === 'reopened').length,
        decisionsActive:   data.filter(d => d.status === 'active').length,
      })))
      .catch(() => {}); // pastille de la barre latérale : la page concernée signale l'erreur
    api.get(`/projects/${id}/actions`)
      .then(({ data }) => {
        const today = new Date().toISOString().slice(0, 10);
        const open = data.filter(a => a.status !== 'done');
        setCounts(c => ({ ...c, actionsOpen: open.length, actionsOverdue: open.filter(a => a.dueDate && String(a.dueDate).slice(0, 10) < today).length }));
      })
      .catch(() => {}); // pastille de la barre latérale : la page concernée signale l'erreur
    api.get(`/projects/${id}/tools`)
      .then(({ data }) => setCounts(c => ({ ...c, toolsAttention: attentionCount(data.tools, data.needs) })))
      .catch(() => {}); // pastille de la barre latérale : la page concernée signale l'erreur
    refreshDevCount();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Développements (dépôt GitHub relié) : à relire / mise en ligne échouée → pastille ;
  // en cours → point animé. État relu auprès de GitHub par le serveur.
  const refreshDevCount = useCallback(() => {
    api.get(`/projects/${id}/dev-tasks`)
      .then(({ data }) => setCounts(c => ({
        ...c,
        devAwaiting: data.tasks.filter(t => ['ready', 'deploy_failed'].includes(t.status)).length,
        devRunning:  data.tasks.some(t => ['running', 'deploying'].includes(t.status)),
      })))
      .catch(() => {}); // pastille de la barre latérale : la page concernée signale l'erreur
  }, [id]);
  useEffect(() => {
    if (!counts.devRunning) return undefined;
    const t = setInterval(refreshDevCount, 30000); // la pastille apparaît quand Claude Code a fini
    return () => clearInterval(t);
  }, [counts.devRunning, refreshDevCount]);

  useEffect(() => {
    setLoading(true);
    reloadProject()
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));
    refreshCounts();
  }, [id, reloadProject, refreshCounts, navigate]);

  if (loading || !project) {
    return (
      <Layout wide>
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  const isOwner   = project.userId === user?.id;
  const canManage = isOwner || isAdmin;
  const badgeOf   = key => key === 'decisions' ? counts.decisionsReopened : key === 'tools' ? counts.toolsAttention : key === 'actions' ? counts.actionsOverdue : key === 'dev' ? counts.devAwaiting : 0;

  return (
    <ProjectContext.Provider value={{ project, setProject, reloadProject, isOwner, isAdmin, canManage, counts, refreshCounts }}>
      <Layout wide>
        <div className="flex flex-wrap gap-6 items-start">
          <aside aria-label="Navigation du projet" className="w-full md:w-56 shrink-0 md:sticky md:top-6">
            <div className="px-3 pb-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint">Projet</p>
              <p className="text-base font-extrabold text-ink leading-snug break-words">{project.name}</p>
              {project.status === 'archived' && <p className="text-xs font-bold text-ink-faint mt-0.5">Archivé</p>}
              {project.isDemo && <Badge tone="ai" className="mt-1">Projet exemple</Badge>}
            </div>
            <nav data-tour="shell-nav" className="flex md:flex-col gap-1 overflow-x-auto pb-1 md:pb-0">
              {NAV.filter(item => !item.show || item.show(project)).map(item => {
                const badge = item.badge ? badgeOf(item.badge) : 0;
                return (
                  <NavLink key={item.label} to={item.to} end={item.end}
                    className={({ isActive }) => `shrink-0 flex items-center gap-2.5 px-3 h-11 rounded-[10px] text-sm transition ${
                      isActive ? 'bg-action-light text-action font-extrabold' : 'text-ink-soft font-semibold hover:bg-white'
                    }`}>
                    <item.icon size={18} aria-hidden="true" />
                    <span className="flex-1 whitespace-nowrap">{item.label}</span>
                    {badge > 0 ? (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-await-light text-await text-xs font-extrabold inline-flex items-center justify-center"
                        title={item.badge === 'decisions' ? 'Décisions remises en question' : item.badge === 'actions' ? 'Actions en retard' : item.badge === 'dev' ? 'Développements à relire ou à reprendre' : 'Points d’attention sur les outils'}>
                        {badge}
                      </span>
                    ) : item.badge === 'dev' && counts.devRunning && (
                      <span className="w-2 h-2 rounded-full bg-ai animate-pulse" title="Claude Code travaille" aria-label="Développement en cours" />
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </aside>

          <main className="flex-1 min-w-0 basis-[560px]">
            {/* Pages du projet chargées à la demande : la barre latérale reste affichée */}
            <Suspense fallback={<PageLoader inline />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </Layout>
    </ProjectContext.Provider>
  );
}

// En-tête de page commun : titre + phrase d'aide + actions
export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
