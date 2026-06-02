import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';

// ── Formulaire création / modification ────────────────────────────────────────
function AgentForm({ initial = {}, onSave, onCancel }) {
  const [name,         setName]         = useState(initial.name         || '');
  const [role,         setRole]         = useState(initial.role         || '');
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt || '');
  const [emoji,        setEmoji]        = useState(initial.emoji        || '🤖');
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  const isValid = name.trim() && role.trim() && systemPrompt.trim();
  const isEdit  = !!initial.id;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || loading) return;
    setError('');
    setLoading(true);
    try {
      await onSave({
        name:         name.trim(),
        role:         role.trim(),
        systemPrompt: systemPrompt.trim(),
        emoji:        emoji.trim() || '🤖'
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Emoji + Nom */}
      <div className="flex items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Emoji</label>
          <input
            type="text"
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            maxLength={2}
            className="w-14 text-center text-2xl px-1 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Nom <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            placeholder="Ex : Juriste, Data Scientist, Coach…"
            autoFocus={!isEdit}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
          />
        </div>
      </div>

      {/* Rôle */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Rôle <span className="text-red-400">*</span>
          <span className="font-normal text-gray-400 ml-1">— courte description affichée dans la liste</span>
        </label>
        <input
          type="text"
          value={role}
          onChange={e => setRole(e.target.value)}
          maxLength={200}
          placeholder="Ex : Analyse les aspects légaux et identifie les risques juridiques"
          className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm"
        />
      </div>

      {/* Prompt système */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Prompt système <span className="text-red-400">*</span>
        </label>
        <textarea
          value={systemPrompt}
          onChange={e => setSystemPrompt(e.target.value)}
          rows={5}
          placeholder="Ex : Tu es un expert en droit des affaires. Tu analyses les aspects légaux, identifies les risques juridiques et proposes des solutions conformes à la réglementation en vigueur. Tu réponds en français de façon précise et structurée."
          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">
          Définit le comportement de l'agent pendant les sessions. Commence par "Tu es…"
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-none sm:px-6 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
          >
            Annuler
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid || loading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl transition text-sm font-medium disabled:opacity-50"
        >
          {loading ? 'Enregistrement…' : isEdit ? 'Enregistrer les modifications' : 'Créer l\'agent'}
        </button>
      </div>
    </form>
  );
}

// ── Modale de modification ─────────────────────────────────────────────────────
function EditModal({ agent, onSave, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-gray-900">Modifier l'agent</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <AgentForm initial={agent} onSave={onSave} onCancel={onClose} />
      </div>
    </div>
  );
}

// ── Carte d'agent ──────────────────────────────────────────────────────────────
function AgentCard({ agent, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isDefault = agent.isDefault;

  return (
    <div className={`rounded-xl border p-4 transition ${
      isDefault
        ? 'bg-gray-50 border-gray-200'
        : 'bg-white border-gray-200 shadow-sm hover:shadow-md'
    }`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0 mt-0.5 select-none">{agent.emoji || '🤖'}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className={`font-semibold text-sm ${isDefault ? 'text-gray-600' : 'text-gray-900'}`}>
              {agent.name}
            </h3>
            {isDefault && (
              <span className="text-xs font-medium bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                Défaut
              </span>
            )}
          </div>
          <p className={`text-xs leading-relaxed ${isDefault ? 'text-gray-400' : 'text-gray-500'}`}>
            {agent.role}
          </p>

          {/* Prompt système — agents personnels uniquement */}
          {!isDefault && (
            <div className="mt-2">
              <p className={`text-xs text-gray-400 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                {agent.systemPrompt}
              </p>
              {agent.systemPrompt.length > 100 && (
                <button
                  onClick={() => setExpanded(v => !v)}
                  className="text-xs text-blue-500 hover:text-blue-700 mt-0.5"
                >
                  {expanded ? 'Réduire' : 'Voir plus'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Boutons actions — agents personnels */}
        {!isDefault && onEdit && onDelete && (
          <div className="flex items-center gap-1 shrink-0 -mt-0.5">
            <button
              onClick={() => onEdit(agent)}
              className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="Modifier"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => onDelete(agent)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
              title="Supprimer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modale de confirmation de suppression ─────────────────────────────────────
function DeleteModal({ agent, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-2">Supprimer l'agent</h2>
        <p className="text-sm text-gray-600 mb-5">
          Supprimer <strong className="text-gray-900">{agent.name}</strong> ?
          Cet agent ne sera plus disponible pour les nouvelles sessions.
          <br />
          <span className="text-gray-400 text-xs mt-1 block">Cette action est irréversible.</span>
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl transition text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [agents,        setAgents]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [showCreate,    setShowCreate]    = useState(false);
  const [editingAgent,  setEditingAgent]  = useState(null);
  const [deletingAgent, setDeletingAgent] = useState(null);
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    api.get('/agents')
      .then(({ data }) => setAgents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const defaultAgents  = agents.filter(a =>  a.isDefault);
  const personalAgents = agents.filter(a => !a.isDefault);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCreate = async (data) => {
    const { data: newAgent } = await api.post('/agents', data);
    setAgents(prev => [...prev, newAgent]);
    setShowCreate(false);
  };

  const handleEdit = async (data) => {
    const { data: updated } = await api.patch(`/agents/${editingAgent.id}`, data);
    setAgents(prev => prev.map(a => a.id === updated.id ? updated : a));
    setEditingAgent(null);
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/agents/${deletingAgent.id}`);
      setAgents(prev => prev.filter(a => a.id !== deletingAgent.id));
      setDeletingAgent(null);
    } catch {
      alert('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">

        {/* Navigation */}
        <Link to="/dashboard" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
          ← Tableau de bord
        </Link>

        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bibliothèque d'agents</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Créez et gérez vos agents personnalisés. Les agents par défaut sont disponibles pour tous.
            </p>
          </div>
          {!showCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
            >
              + Créer un agent
            </button>
          )}
        </div>

        {/* Formulaire de création */}
        {showCreate && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-6 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Nouvel agent personnalisé</h2>
            <AgentForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {!loading && (
          <>
            {/* Section agents personnels */}
            {personalAgents.length > 0 && (
              <section className="mb-8">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Mes agents ({personalAgents.length})
                </p>
                <div className="space-y-3">
                  {personalAgents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onEdit={setEditingAgent}
                      onDelete={setDeletingAgent}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state agents personnels */}
            {personalAgents.length === 0 && !showCreate && (
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 mb-8 text-center">
                <p className="text-sm font-medium text-blue-700 mb-1">Aucun agent personnalisé</p>
                <p className="text-xs text-blue-500 mb-4">
                  Créez vos propres agents pour enrichir vos sessions.
                </p>
                <button
                  onClick={() => setShowCreate(true)}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition font-medium"
                >
                  Créer mon premier agent
                </button>
              </div>
            )}

            {/* Section agents par défaut */}
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Agents par défaut ({defaultAgents.length})
              </p>
              <div className="space-y-3">
                {defaultAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Modale de modification */}
      {editingAgent && (
        <EditModal
          agent={editingAgent}
          onSave={handleEdit}
          onClose={() => setEditingAgent(null)}
        />
      )}

      {/* Modale de confirmation de suppression */}
      {deletingAgent && (
        <DeleteModal
          agent={deletingAgent}
          onConfirm={handleDelete}
          onCancel={() => setDeletingAgent(null)}
          loading={deleting}
        />
      )}
    </Layout>
  );
}
