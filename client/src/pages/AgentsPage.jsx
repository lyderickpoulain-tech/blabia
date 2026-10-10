import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, X, Bot } from 'lucide-react';
import Layout from '../components/Layout';
import { Button, IconButton, Badge, Card, SectionLabel } from '../components/ui';
import api from '../utils/api';
import { notifyError } from '../utils/notify';

const inputCls = 'w-full px-3.5 py-2.5 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action focus:border-transparent transition';

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
      <div className="flex items-end gap-3">
        <label className="block">
          <span className="block text-sm font-bold text-ink-soft mb-1">Emoji</span>
          <input type="text" value={emoji} onChange={e => setEmoji(e.target.value)} maxLength={2}
            className="w-14 h-11 text-center text-2xl border border-line rounded-[10px] outline-none focus:ring-2 focus:ring-action" />
        </label>
        <label className="block flex-1">
          <span className="block text-sm font-bold text-ink-soft mb-1">Nom</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={100}
            placeholder="Ex : Juriste, Data Scientist, Coach…" autoFocus={!isEdit} className={inputCls} />
        </label>
      </div>

      <label className="block">
        <span className="block text-sm font-bold text-ink-soft mb-1">
          Rôle <span className="font-semibold text-ink-faint">— affiché dans les listes</span>
        </span>
        <input type="text" value={role} onChange={e => setRole(e.target.value)} maxLength={200}
          placeholder="Ex : Analyse les aspects légaux et identifie les risques juridiques" className={inputCls} />
      </label>

      <label className="block">
        <span className="block text-sm font-bold text-ink-soft mb-1">Instructions</span>
        <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={5}
          placeholder="Ex : Tu es un expert en droit des affaires. Tu analyses les aspects légaux, identifies les risques juridiques et proposes des solutions conformes à la réglementation en vigueur."
          className={`${inputCls} resize-y`} />
        <span className="block text-[11px] text-ink-faint mt-1">Ce qui guide le comportement de l'agent en réunion. Commencez par « Tu es… ».</span>
      </label>

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Annuler</Button>}
        <Button type="submit" variant="primary" disabled={!isValid || loading}>
          {loading ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer l\'agent'}
        </Button>
      </div>
    </form>
  );
}

function Modal({ title, onClose, children, size = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl shadow-xl w-full ${size} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-ink">{title}</h2>
          {onClose && <IconButton size="sm" label="Fermer" onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>}
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Carte d'agent ──────────────────────────────────────────────────────────────
function AgentCard({ agent, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const isDefault = agent.isDefault;

  return (
    <Card className={`p-4 ${isDefault ? '' : 'hover:border-action-border transition'}`}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-canvas text-xl inline-flex items-center justify-center shrink-0 select-none">{agent.emoji || '🤖'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-extrabold text-sm text-ink">{agent.name}</h3>
            {isDefault && <Badge tone="muted" className="!text-[10px] !py-0.5">BlabIA</Badge>}
          </div>
          <p className="text-xs text-ink-muted leading-relaxed mt-0.5">{agent.role}</p>

          {!isDefault && agent.systemPrompt && (
            <div className="mt-2">
              <p className={`text-xs text-ink-faint leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>{agent.systemPrompt}</p>
              {agent.systemPrompt.length > 100 && (
                <button onClick={() => setExpanded(v => !v)} className="text-xs font-bold text-action hover:underline mt-0.5">
                  {expanded ? 'Réduire' : 'Voir les instructions'}
                </button>
              )}
            </div>
          )}
        </div>

        {!isDefault && onEdit && onDelete && (
          <div className="flex items-center shrink-0 -mt-1 -mr-1">
            <IconButton size="sm" label="Modifier" onClick={() => onEdit(agent)}><Pencil size={15} aria-hidden="true" /></IconButton>
            <IconButton size="sm" label="Supprimer" onClick={() => onDelete(agent)} className="hover:!text-red-600"><Trash2 size={15} aria-hidden="true" /></IconButton>
          </div>
        )}
      </div>
    </Card>
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
      .catch(err => notifyError(err, 'Impossible de charger les agents.'))
      .finally(() => setLoading(false));
  }, []);

  const defaultAgents  = agents.filter(a =>  a.isDefault);
  const personalAgents = agents.filter(a => !a.isDefault);

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
    <Layout wide>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Agents</h1>
          <p className="text-sm text-ink-muted mt-1">Votre bibliothèque d'agents, à inviter dans les équipes de vos projets.</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} aria-hidden="true" /> Créer un agent
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <SectionLabel className="mb-3">Mes agents · {personalAgents.length}</SectionLabel>
            {personalAgents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
                {personalAgents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} onEdit={setEditingAgent} onDelete={setDeletingAgent} />
                ))}
              </div>
            ) : (
              <Card className="p-6 text-center">
                <Bot size={28} className="mx-auto text-ink-faint mb-2" aria-hidden="true" />
                <p className="text-sm font-extrabold text-ink mb-1">Aucun agent personnalisé</p>
                <p className="text-xs text-ink-muted mb-4">Un expert qui manque à vos réunions ? Créez-le une fois, invitez-le partout.</p>
                <Button size="sm" variant="primary" onClick={() => setShowCreate(true)}>Créer mon premier agent</Button>
              </Card>
            )}
          </section>

          <section>
            <SectionLabel className="mb-3">Fournis par BlabIA · {defaultAgents.length}</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
              {defaultAgents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
            </div>
          </section>
        </div>
      )}

      {showCreate && (
        <Modal title="Nouvel agent" onClose={() => setShowCreate(false)}>
          <AgentForm onSave={handleCreate} onCancel={() => setShowCreate(false)} />
        </Modal>
      )}

      {editingAgent && (
        <Modal title="Modifier l'agent" onClose={() => setEditingAgent(null)}>
          <AgentForm initial={editingAgent} onSave={handleEdit} onCancel={() => setEditingAgent(null)} />
        </Modal>
      )}

      {deletingAgent && (
        <Modal title="Supprimer l'agent" size="max-w-sm" onClose={deleting ? null : () => setDeletingAgent(null)}>
          <p className="text-sm text-ink-soft mb-1">
            Supprimer <strong className="text-ink">{deletingAgent.name}</strong> ? Il ne sera plus disponible pour les nouvelles réunions.
          </p>
          <p className="text-xs text-ink-faint mb-5">Cette action est irréversible.</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setDeletingAgent(null)} disabled={deleting}>Annuler</Button>
            <Button className="flex-1 !bg-red-600 hover:!bg-red-700 !text-white !border-transparent" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </Button>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
