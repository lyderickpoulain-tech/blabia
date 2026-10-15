import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Radio, Archive, ArchiveRestore, MessagesSquare, CalendarDays, FolderOpen, Coins, UserRound, Coffee } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, Badge, Card } from '../components/ui';
import { formatUSD } from '../utils/cost';
import api from '../utils/api';
import { notifyError } from '../utils/notify';
import { useTour } from '../tour/TourContext';
import NewProjectChoiceModal from '../components/NewProjectChoiceModal';

const STATUS_TABS = [
  { key: 'active',   label: 'Actifs' },
  { key: 'archived', label: 'Archivés' },
  { key: 'all',      label: 'Tous' },
];

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const projectCost = p => (p.realCostUSD || 0) + (p.legacyCostUSD || 0);

// Dernière venue sur le projet : « il y a 12 min », « il y a 3 h », « il y a 2 j »
function sinceLabel(d) {
  if (!d) return 'pas encore venu';
  const min = Math.max(1, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

// Participants d'un projet à plusieurs : voyant vert (sur le projet) ou gris + dernière venue
function People({ people }) {
  const shown = people.slice(0, 6);
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-3" aria-label="Participants du projet">
      {shown.map(p => (
        <li key={p.userId} className="inline-flex items-center gap-1.5 text-xs text-ink-soft"
          title={p.online ? `${p.name} est sur le projet` : `${p.name} : dernière venue ${sinceLabel(p.lastSeenAt)}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${p.online ? 'bg-ok' : 'bg-muted'}`} aria-hidden="true" />
          <span className="font-bold">{p.isYou ? 'Vous' : p.name}</span>
          {!p.online && <span className="text-ink-faint">{sinceLabel(p.lastSeenAt)}</span>}
          <span className="sr-only">{p.online ? ' : sur le projet' : ''}</span>
        </li>
      ))}
      {people.length > shown.length && <li className="text-xs text-ink-faint">+{people.length - shown.length}</li>}
    </ul>
  );
}

function ProjectCard({ project, archiving, onArchive, onOpen }) {
  const open      = (project.openSessionCount ?? 0) > 0;
  const prepReady = (project.prepReadyCount ?? 0) > 0; // v5.1 : conclusions préparées par les agents
  const sessions  = project.sessionCount ?? 0;
  const archived  = project.status !== 'active';
  return (
    <Card data-tour={project.isDemo ? 'project-card-demo' : undefined}
      className={`group flex flex-col p-4 transition hover:border-action-border hover:shadow-sm ${archived ? 'opacity-75' : ''} ${project.isDemo ? 'border-ai-border' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/projects/${project.id}`} className="min-w-0 flex-1 focus-visible:outline-none">
          <h2 className="text-base font-extrabold text-ink leading-snug group-hover:text-action transition break-words">{project.name}</h2>
        </Link>
        {project.isDemo
          ? <Badge tone="ai">Exemple</Badge>
          : archived
          ? <Badge tone="muted">Archivé</Badge>
          : prepReady ? <Badge tone="ok"><Coffee size={12} aria-hidden="true" /> {project.prepReadyCount > 1 ? `${project.prepReadyCount} réunions préparées` : 'Réunion préparée'}</Badge>
          : project.delegateRunning ? <Badge tone="ai"><Coffee size={12} aria-hidden="true" /> Le bras droit tient une réunion</Badge>
          : project.prepRunning ? <Badge tone="ai"><Coffee size={12} aria-hidden="true" /> Préparation en cours</Badge>
          : open && <Badge tone="await"><Radio size={12} aria-hidden="true" /> Réunion en cours</Badge>}
      </div>
      {project.description && (
        <p className="text-sm text-ink-muted mt-1 line-clamp-2">{project.description}</p>
      )}
      {project.people?.length > 0 && <People people={project.people} />}

      <div className="flex-1" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1"><MessagesSquare size={13} aria-hidden="true" /> {sessions} réunion{sessions !== 1 ? 's' : ''}</span>
        <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" /> {formatDate(project.createdAt)}</span>
        {project.createdBy && <span className="inline-flex items-center gap-1"><UserRound size={13} aria-hidden="true" /> Créé par {project.createdBy}</span>}
        <span className="inline-flex items-center gap-1" title={project.legacyCostUSD > 0
            ? `Coût de l'IA : ${formatUSD(project.realCostUSD)} réels + ${formatUSD(project.legacyCostUSD)} estimés avant le suivi`
            : 'Coût réel de l’IA pour ce projet'}>
          <Coins size={13} aria-hidden="true" /> {formatUSD(projectCost(project))}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
        <Button size="sm" variant={prepReady ? 'primary' : open ? 'await' : 'secondary'} className="flex-1" onClick={onOpen}>
          {prepReady ? 'Voir les conclusions préparées' : open ? 'Rejoindre la réunion' : 'Ouvrir'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onArchive} disabled={archiving}
          aria-label={archived ? 'Réactiver le projet' : 'Archiver le projet'} title={archived ? 'Réactiver' : 'Archiver'}>
          {archiving ? '…' : archived ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
        </Button>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('active');
  const [archiving, setArchiving] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const navigate = useNavigate();
  const tour = useTour();
  // « Nouveau projet » : choix projet de démo / formulaire (direct pendant la visite guidée)
  const newProject = () => (tour?.active ? navigate('/projects/new') : setChoosing(true));

  useEffect(() => {
    const load = () => api.get('/projects')
      .then(({ data }) => setProjects(data))
      .catch(err => notifyError(err, 'Impossible de charger vos projets.'))
      .finally(() => setLoading(false));
    load();
    // Visite guidée : projet exemple créé ou supprimé
    window.addEventListener('blabia:demo-changed', load);
    // Voyants de présence des participants : rafraîchis chaque minute, sans message d'erreur
    const refresh = setInterval(() => {
      if (document.visibilityState === 'visible') api.get('/projects').then(({ data }) => setProjects(data)).catch(() => {});
    }, 60000);
    return () => { window.removeEventListener('blabia:demo-changed', load); clearInterval(refresh); };
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects
      .filter(p => p.name.toLowerCase().includes(q) && (statusTab === 'all' || p.status === statusTab))
      // Réunions préparées prêtes, puis réunions en cours : ce sont elles qui attendent l'humain
      .sort((a, b) => ((b.prepReadyCount ?? 0) > 0) - ((a.prepReadyCount ?? 0) > 0) || ((b.openSessionCount ?? 0) > 0) - ((a.openSessionCount ?? 0) > 0));
  }, [projects, search, statusTab]);

  const counts = useMemo(() => ({
    active:   projects.filter(p => p.status === 'active').length,
    archived: projects.filter(p => p.status !== 'active').length,
    all:      projects.length,
  }), [projects]);

  const totalCost = useMemo(() => projects.reduce((s, p) => s + projectCost(p), 0), [projects]);

  const handleArchive = async (project) => {
    if (!confirm(`${project.status === 'active' ? 'Archiver' : 'Réactiver'} le projet « ${project.name} » ?`)) return;
    setArchiving(project.id);
    try {
      const { data } = await api.patch(`/projects/${project.id}/archive`);
      setProjects(prev => prev.map(p => p.id === data.id ? { ...p, status: data.status } : p));
    } catch {
      alert('Erreur lors de l\'opération');
    } finally {
      setArchiving(null);
    }
  };

  // « Rejoindre » : le tableau de bord du projet met la réunion en cours en tête
  const openProject = (project) => navigate(`/projects/${project.id}`);

  return (
    <Layout wide>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Mes projets</h1>
          <p className="text-sm text-ink-muted mt-1">
            {counts.active} actif{counts.active !== 1 ? 's' : ''}
            {totalCost > 0 && <> · {formatUSD(totalCost)} de coût IA au total</>}
          </p>
        </div>
        <Button data-tour="new-project" variant="primary" onClick={newProject}>
          <Plus size={18} aria-hidden="true" /> Nouveau projet
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <label className="relative flex-1">
          <span className="sr-only">Rechercher un projet</span>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher un projet…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent"
          />
        </label>
        <div role="tablist" aria-label="Filtrer par statut" className="flex bg-white border border-line rounded-[10px] p-1 gap-1">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} role="tab" aria-selected={statusTab === tab.key} onClick={() => setStatusTab(tab.key)}
              className={`px-3 h-9 rounded-lg text-sm transition ${
                statusTab === tab.key ? 'bg-action-light text-action font-extrabold' : 'text-ink-muted font-semibold hover:bg-canvas'
              }`}>
              {tab.label} <span className="text-xs opacity-70">{counts[tab.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(project => (
            <ProjectCard key={project.id} project={project}
              archiving={archiving === project.id}
              onArchive={() => handleArchive(project)}
              onOpen={() => openProject(project)} />
          ))}
        </div>
      ) : (
        <Card className="text-center py-14 px-6">
          <FolderOpen size={32} className="mx-auto text-ink-faint mb-3" aria-hidden="true" />
          {projects.length === 0 ? (
            <>
              <p className="text-base font-extrabold text-ink mb-1">Aucun projet pour l'instant</p>
              <p className="text-sm text-ink-muted mb-4">Décrivez votre idée : BlabIA compose une équipe d'agents et propose un plan de réunions.</p>
              <Button variant="primary" onClick={newProject}>
                <Plus size={18} aria-hidden="true" /> Créer mon premier projet
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              {search ? 'Aucun projet ne correspond à votre recherche.' : statusTab === 'archived' ? 'Aucun projet archivé.' : 'Aucun projet actif.'}
            </p>
          )}
        </Card>
      )}
      {choosing && <NewProjectChoiceModal onClose={() => setChoosing(false)} />}
    </Layout>
  );
}
