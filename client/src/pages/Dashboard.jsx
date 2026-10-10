import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Radio, Archive, ArchiveRestore, MessagesSquare, CalendarDays, FolderOpen, Coins } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, Badge, Card } from '../components/ui';
import { formatUSD } from '../utils/cost';
import api from '../utils/api';

const STATUS_TABS = [
  { key: 'active',   label: 'Actifs' },
  { key: 'archived', label: 'Archivés' },
  { key: 'all',      label: 'Tous' },
];

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const projectCost = p => (p.realCostUSD || 0) + (p.legacyCostUSD || 0);

function ProjectCard({ project, archiving, onArchive, onOpen }) {
  const open      = (project.openSessionCount ?? 0) > 0;
  const sessions  = project.sessionCount ?? 0;
  const archived  = project.status !== 'active';
  return (
    <Card className={`group flex flex-col p-4 transition hover:border-action-border hover:shadow-sm ${archived ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <Link to={`/projects/${project.id}`} className="min-w-0 flex-1 focus-visible:outline-none">
          <h2 className="text-base font-extrabold text-ink leading-snug group-hover:text-action transition break-words">{project.name}</h2>
        </Link>
        {archived
          ? <Badge tone="muted">Archivé</Badge>
          : open && <Badge tone="await"><Radio size={12} aria-hidden="true" /> Réunion en cours</Badge>}
      </div>
      {project.description && (
        <p className="text-sm text-ink-muted mt-1 line-clamp-2">{project.description}</p>
      )}

      <div className="flex-1" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1"><MessagesSquare size={13} aria-hidden="true" /> {sessions} réunion{sessions !== 1 ? 's' : ''}</span>
        <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" /> {formatDate(project.createdAt)}</span>
        <span className="inline-flex items-center gap-1" title={project.legacyCostUSD > 0
            ? `Coût de l'IA : ${formatUSD(project.realCostUSD)} réels + ${formatUSD(project.legacyCostUSD)} estimés avant le suivi`
            : 'Coût réel de l’IA pour ce projet'}>
          <Coins size={13} aria-hidden="true" /> {formatUSD(projectCost(project))}
        </span>
      </div>

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
        <Button size="sm" variant={open ? 'await' : 'secondary'} className="flex-1" onClick={onOpen}>
          {open ? 'Rejoindre la réunion' : 'Ouvrir'}
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
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/projects')
      .then(({ data }) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return projects
      .filter(p => p.name.toLowerCase().includes(q) && (statusTab === 'all' || p.status === statusTab))
      // Réunions en cours d'abord : ce sont elles qui attendent l'humain
      .sort((a, b) => ((b.openSessionCount ?? 0) > 0) - ((a.openSessionCount ?? 0) > 0));
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
        <Button variant="primary" onClick={() => navigate('/projects/new')}>
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
              <Button variant="primary" onClick={() => navigate('/projects/new')}>
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
    </Layout>
  );
}
