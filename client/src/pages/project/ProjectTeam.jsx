import { useEffect, useState } from 'react';
import { GripVertical, Plus, UserMinus, UserPlus } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';

// Équipe : les agents qui travaillent sur le projet (refonte UX v5.1).
// L'ordre de l'équipe est l'ordre proposé au démarrage des réunions.
export default function ProjectTeam() {
  const { project } = useProject();
  const [agents, setAgents]   = useState(null);
  const [error, setError]     = useState('');
  const [busyId, setBusyId]   = useState(null);
  const [dragId, setDragId]   = useState(null);
  const [overId, setOverId]   = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]       = useState({ name: '', role: '', systemPrompt: '', emoji: '🤖' });
  const [creating, setCreating] = useState(false);

  const load = () => api.get(`/projects/${project.id}/agents`)
    .then(({ data }) => setAgents(data))
    .catch(() => setError('Impossible de charger les agents du projet.'));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const team      = (agents || []).filter(a => a.enabled);
  const available = (agents || []).filter(a => !a.enabled);

  const setEnabled = async (agent, enabled) => {
    setBusyId(agent.id);
    setError('');
    try {
      await api.patch(`/projects/${project.id}/agents/${agent.id}`, { enabled });
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Modification impossible.');
    }
    setBusyId(null);
  };

  const drop = async (targetId) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ordered = [...team];
    const from = ordered.findIndex(a => a.id === dragId);
    const to   = ordered.findIndex(a => a.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return; }
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    setAgents([...ordered, ...available]);
    setDragId(null); setOverId(null);
    try { await api.patch(`/projects/${project.id}/agents/reorder`, { order: ordered.map(a => a.id) }); }
    catch { setError('Le nouvel ordre n’a pas pu être enregistré.'); load(); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.role.trim() || !form.systemPrompt.trim()) return;
    setCreating(true);
    setError('');
    try {
      const { data: agent } = await api.post('/agents', form);
      await api.post(`/projects/${project.id}/agents`, { agentId: agent.id, source: 'manual' });
      setForm({ name: '', role: '', systemPrompt: '', emoji: '🤖' });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Création impossible.');
    }
    setCreating(false);
  };

  const AgentLine = ({ agent, inTeam }) => (
    <li
      draggable={inTeam}
      onDragStart={() => setDragId(agent.id)}
      onDragOver={e => { if (inTeam) { e.preventDefault(); setOverId(agent.id); } }}
      onDrop={e => { e.preventDefault(); drop(agent.id); }}
      onDragEnd={() => { setDragId(null); setOverId(null); }}
      className={`flex items-center gap-3 px-4 py-3 ${overId === agent.id && dragId !== agent.id ? 'bg-action-light' : ''}`}
    >
      {inTeam && <GripVertical size={16} className="text-ink-faint cursor-grab shrink-0" aria-label="Glisser pour réordonner" />}
      <span className="w-9 h-9 rounded-full bg-muted-light flex items-center justify-center text-lg shrink-0" aria-hidden="true">{agent.emoji || '🤖'}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink">{agent.name}{agent.isDefault && <span className="ml-2 text-[11px] font-semibold text-ink-faint">par défaut</span>}</p>
        <p className="text-xs text-ink-muted truncate">{agent.role}</p>
      </div>
      {inTeam ? (
        <Button size="sm" variant="ghost" onClick={() => setEnabled(agent, false)} disabled={busyId === agent.id}>
          <UserMinus size={15} /> Retirer
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setEnabled(agent, true)} disabled={busyId === agent.id}>
          <UserPlus size={15} /> Ajouter
        </Button>
      )}
    </li>
  );

  return (
    <>
      <PageHeader title="Équipe" subtitle="Les agents qui travaillent sur ce projet. Leur ordre est celui proposé au démarrage des réunions.">
        <Button variant="primary" onClick={() => setShowCreate(v => !v)}><Plus size={16} /> Créer un agent</Button>
      </PageHeader>

      {error && <p role="alert" className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {showCreate && (
        <Card as="form" onSubmit={create} className="p-4 mb-4 space-y-3">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="agent-emoji">Emoji</label>
            <input id="agent-emoji" value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} maxLength={4}
              className="w-14 h-11 text-center text-lg border border-line rounded-lg outline-none focus:ring-2 focus:ring-action-border" />
            <label className="sr-only" htmlFor="agent-name">Nom</label>
            <input id="agent-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nom (ex. Expert juridique)"
              className="flex-1 min-w-0 h-11 text-sm border border-line rounded-lg px-3 outline-none focus:ring-2 focus:ring-action-border" />
          </div>
          <label className="sr-only" htmlFor="agent-role">Rôle</label>
          <input id="agent-role" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Rôle en une phrase"
            className="w-full h-11 text-sm border border-line rounded-lg px-3 outline-none focus:ring-2 focus:ring-action-border" />
          <label className="sr-only" htmlFor="agent-prompt">Consignes</label>
          <textarea id="agent-prompt" value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))} rows={3}
            placeholder="Consignes : comment cet agent raisonne, ce qu'il surveille, son style…"
            className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-action-border resize-none" />
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={creating || !form.name.trim() || !form.role.trim() || !form.systemPrompt.trim()}>
              {creating ? 'Création…' : 'Créer et ajouter à l’équipe'}
            </Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Annuler</Button>
          </div>
        </Card>
      )}

      {agents === null ? (
        <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-5">
          <section aria-labelledby="team-in">
            <h2 id="team-in" className="text-sm font-extrabold text-ink mb-2">Dans l'équipe · {team.length}</h2>
            <Card className="overflow-hidden">
              {team.length === 0
                ? <p className="text-sm text-ink-faint px-4 py-6 text-center">Aucun agent. Ajoutez-en depuis la liste ci-dessous.</p>
                : <ul className="divide-y divide-line">{team.map(a => <AgentLine key={a.id} agent={a} inTeam />)}</ul>}
            </Card>
          </section>
          {available.length > 0 && (
            <section aria-labelledby="team-out">
              <h2 id="team-out" className="text-sm font-extrabold text-ink mb-2">Disponibles · {available.length}</h2>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-line">{available.map(a => <AgentLine key={a.id} agent={a} />)}</ul>
              </Card>
            </section>
          )}
        </div>
      )}
    </>
  );
}
