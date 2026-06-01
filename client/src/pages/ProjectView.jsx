import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';

function RenameModal({ project, onSave, onClose }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.patch(`/projects/${project.id}`, { name, description });
      onSave(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la modification');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Modifier le projet</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition text-sm font-medium">
              Annuler
            </button>
            <button type="submit" disabled={loading || !name.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg transition text-sm font-medium disabled:opacity-50">
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SessionStatusBadge({ status }) {
  return status === 'complete'
    ? <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Complète</span>
    : <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Interrompue</span>;
}

function SessionRow({ session, projectId }) {
  const truncated = session.task.length > 50 ? session.task.substring(0, 50) + '…' : session.task;
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const isComplete = session.status === 'complete';

  const inner = (
    <>
      {/* Desktop */}
      <tr className={`hidden md:table-row ${isComplete ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-70'}`}>
        <td className="px-4 py-3 text-sm text-gray-800 max-w-xs">
          <span className="truncate block">{truncated}</span>
        </td>
        <td className="px-4 py-3"><SessionStatusBadge status={session.status} /></td>
        <td className="px-4 py-3 text-sm text-gray-500">{session.agentCount ?? '–'} agents</td>
        <td className="px-4 py-3 text-sm text-gray-400">{date}</td>
        <td className="px-4 py-3 text-right">
          {isComplete && (
            <span className="text-xs text-blue-600 font-medium">Relire →</span>
          )}
        </td>
      </tr>

      {/* Mobile */}
      <div className={`md:hidden bg-white rounded-xl border p-4 shadow-sm ${isComplete ? 'border-gray-200 hover:shadow-md' : 'border-orange-100 opacity-75'} transition`}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-sm font-medium text-gray-800 leading-snug flex-1">{truncated}</p>
          <SessionStatusBadge status={session.status} />
        </div>
        <p className="text-xs text-gray-400">{session.agentCount ?? '–'} agents · {date}</p>
        {isComplete && <p className="text-xs text-blue-600 font-medium mt-2">Relire la session →</p>}
      </div>
    </>
  );

  if (!isComplete) return <>{inner}</>;
  return (
    <Link to={`/projects/${projectId}/session/${session.id}`} className="contents">
      {inner}
    </Link>
  );
}

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject]           = useState(null);
  const [loading, setLoading]           = useState(true);
  const [sessions, setSessions]         = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [showRename, setShowRename]     = useState(false);
  const [archiving, setArchiving]       = useState(false);

  useEffect(() => {
    api.get(`/projects/${id}`)
      .then(({ data }) => setProject(data))
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoading(false));

    api.get(`/projects/${id}/sessions`)
      .then(({ data }) => setSessions(data))
      .catch(() => {})
      .finally(() => setSessionsLoading(false));
  }, [id]);

  const handleArchive = async () => {
    const label = project.status === 'active' ? 'archiver' : 'réactiver';
    if (!confirm(`Voulez-vous ${label} ce projet ?`)) return;
    setArchiving(true);
    try {
      const { data } = await api.patch(`/projects/${id}/archive`);
      setProject(prev => ({ ...prev, status: data.status }));
    } catch {
      alert('Erreur lors de l\'opération');
    } finally {
      setArchiving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </Layout>
    );
  }

  if (!project) return null;

  return (
    <Layout>
      {/* Navigation */}
      <Link to="/dashboard" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
        ← Tableau de bord
      </Link>

      {/* En-tête projet */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 break-words">{project.name}</h1>
              {project.status === 'archived' && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 shrink-0">
                  Archivé
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-gray-500 text-sm mt-1">{project.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              {project.sessionCount ?? 0} session{(project.sessionCount ?? 0) !== 1 ? 's' : ''} · Créé le {new Date(project.createdAt).toLocaleDateString('fr-FR')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start">
            <button
              onClick={() => setShowRename(true)}
              className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition min-h-[40px]"
            >
              Modifier
            </button>
            <button
              onClick={handleArchive}
              disabled={archiving}
              className="text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded-lg transition disabled:opacity-40 min-h-[40px]"
            >
              {archiving ? '…' : project.status === 'active' ? 'Archiver' : 'Réactiver'}
            </button>
          </div>
        </div>
      </div>

      {/* Section sessions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="font-semibold text-gray-900">Sessions</h2>
            {!sessionsLoading && (
              <p className="text-xs text-gray-400 mt-0.5">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          {project.status === 'active' && (
            <Link
              to={`/projects/${id}/session/new`}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition"
            >
              + Nouvelle session
            </Link>
          )}
        </div>

        {/* Chargement */}
        {sessionsLoading && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        )}

        {/* Tableau desktop */}
        {!sessionsLoading && sessions.length > 0 && (
          <table className="hidden md:table w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Tâche</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Statut</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Agents</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sessions.map(s => <SessionRow key={s.id} session={s} projectId={id} />)}
            </tbody>
          </table>
        )}

        {/* Cards mobile */}
        {!sessionsLoading && sessions.length > 0 && (
          <div className="md:hidden p-4 space-y-3">
            {sessions.map(s => <SessionRow key={s.id} session={s} projectId={id} />)}
          </div>
        )}

        {/* État vide */}
        {!sessionsLoading && sessions.length === 0 && (
          <div className="text-center py-10 px-5 text-gray-400">
            <p className="text-sm">Aucune session pour l'instant.</p>
            {project.status === 'active' && (
              <Link
                to={`/projects/${id}/session/new`}
                className="inline-block mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Lancer votre première session →
              </Link>
            )}
          </div>
        )}
      </div>

      {showRename && (
        <RenameModal
          project={project}
          onSave={updated => { setProject(prev => ({ ...prev, ...updated })); setShowRename(false); }}
          onClose={() => setShowRename(false)}
        />
      )}
    </Layout>
  );
}
