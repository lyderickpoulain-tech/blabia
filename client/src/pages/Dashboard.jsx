import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';

const STATUS_TABS = [
  { key: 'all', label: 'Tous' },
  { key: 'active', label: 'Actifs' },
  { key: 'archived', label: 'Archivés' }
];

function StatusBadge({ status }) {
  return status === 'active'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Actif</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Archivé</span>;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState('all');
  const [archiving, setArchiving] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/projects')
      .then(({ data }) => setProjects(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusTab === 'all' || p.status === statusTab;
      return matchSearch && matchStatus;
    });
  }, [projects, search, statusTab]);

  const handleArchive = async (e, project) => {
    e.preventDefault();
    e.stopPropagation();
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

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mes projets</h1>
          <p className="text-gray-500 text-sm mt-1">{projects.length} projet{projects.length !== 1 ? 's' : ''} au total</p>
        </div>
        <Link
          to="/projects/new"
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 sm:px-4 py-2 rounded-lg transition text-sm whitespace-nowrap"
        >
          <span className="sm:hidden">+ Projet</span>
          <span className="hidden sm:inline">+ Nouveau projet</span>
        </Link>
      </div>

      {/* Barre de recherche + onglets */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="text"
          placeholder="Rechercher un projet…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
        <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setStatusTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${
                statusTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau desktop */}
      {!loading && filtered.length > 0 && (
        <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Projet</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Sessions</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Créé le</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(project => (
                <tr
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{project.name}</p>
                      <span className="text-xs">{project.isTechnical ? '💻' : '💬'}</span>
                    </div>
                    {project.description && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{project.description}</p>
                    )}
                    {/* Indicateur plan */}
                    {project.todoTotal > 0 ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden shrink-0">
                          <div
                            className="h-1.5 rounded-full bg-green-500 transition-all"
                            style={{ width: `${Math.round((project.todoDone / project.todoTotal) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">{Math.round((project.todoDone / project.todoTotal) * 100)}%</span>
                        {project.todoInProgress > 0 && (
                          <span className="text-xs text-blue-600 font-medium">{project.todoInProgress} en cours</span>
                        )}
                        <Link
                          to={`/projects/${project.id}/plan`}
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-blue-500 hover:text-blue-700 font-medium transition ml-auto"
                        >
                          Plan →
                        </Link>
                      </div>
                    ) : (
                      <Link
                        to={`/projects/${project.id}/plan`}
                        onClick={e => e.stopPropagation()}
                        className="text-xs text-gray-300 hover:text-blue-500 mt-1 inline-block transition"
                      >
                        + Démarrer le plan
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={project.status} /></td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-600">{project.sessionCount ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{formatDate(project.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={e => handleArchive(e, project)}
                      disabled={archiving === project.id}
                      className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2 py-1 transition disabled:opacity-40"
                    >
                      {archiving === project.id ? '…' : project.status === 'active' ? 'Archiver' : 'Réactiver'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cards mobile */}
      {!loading && filtered.length > 0 && (
        <div className="md:hidden space-y-3">
          {filtered.map(project => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-1">
                <p className="font-medium text-gray-900">{project.name}</p>
                <StatusBadge status={project.status} />
              </div>
              {project.description && (
                <p className="text-xs text-gray-400 mb-2 line-clamp-2">{project.description}</p>
              )}
              {/* Indicateur plan mobile */}
              {project.todoTotal > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-green-500"
                        style={{ width: `${Math.round((project.todoDone / project.todoTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{project.todoDone}/{project.todoTotal} tâches</span>
                    {project.todoInProgress > 0 && (
                      <span className="text-xs text-blue-600 font-medium shrink-0">{project.todoInProgress} en cours</span>
                    )}
                  </div>
                  <Link
                    to={`/projects/${project.id}/plan`}
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-blue-500 font-medium"
                  >
                    Voir le plan →
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{project.sessionCount ?? 0} session{(project.sessionCount ?? 0) !== 1 ? 's' : ''} · {formatDate(project.createdAt)}</span>
                <button
                  onClick={e => handleArchive(e, project)}
                  disabled={archiving === project.id}
                  className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-1"
                >
                  {project.status === 'active' ? 'Archiver' : 'Réactiver'}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* États vides */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="text-center py-16">
          {projects.length === 0 ? (
            <>
              <p className="text-gray-400 text-lg mb-2">Aucun projet pour l'instant</p>
              <Link to="/projects/new" className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                Créer votre premier projet →
              </Link>
            </>
          ) : (
            <p className="text-gray-400">Aucun projet ne correspond à votre recherche.</p>
          )}
        </div>
      )}
    </Layout>
  );
}
