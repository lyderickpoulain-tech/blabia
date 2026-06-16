import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import api from '../utils/api';

const DELIVERABLES = [
  { id: 'summary',        icon: '📋', label: 'Compte-rendu',    desc: 'Synthèse structurée + mémorisée dans le projet' },
  { id: 'claude_code',    icon: '💻', label: 'Claude Code',     desc: 'Prompt prêt pour le développement' },
  { id: 'timeline_steps', icon: '📅', label: 'Étapes timeline', desc: 'Nouvelles étapes actionnables' },
];

const MT_MAP = {
  summary: 'summary', synthesis: 'summary', meeting: 'summary',
  memory: 'summary',
  claude_code: 'claude_code', technical: 'claude_code',
  timeline_steps: 'timeline_steps',
};

function AgentScopeSelector({ scope, onChange, size = 'sm' }) {
  return (
    <div className="space-y-1">
      <p className={`${size === 'xs' ? 'text-[10px]' : 'text-xs'} font-medium text-gray-500`}>Disponibilité :</p>
      <div className="flex flex-col gap-1">
        {[
          { value: 'project', label: 'Pour ce projet uniquement', desc: null },
          { value: 'global',  label: 'Enregistrer dans BlabIA',   desc: 'Disponible dans tous vos projets' },
        ].map(opt => (
          <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              value={opt.value}
              checked={scope === opt.value}
              onChange={() => onChange(opt.value)}
              className="mt-0.5 shrink-0 accent-blue-600"
            />
            <div>
              <span className={`${size === 'xs' ? 'text-[11px]' : 'text-xs'} font-medium text-gray-700`}>{opt.label}</span>
              {opt.desc && <p className="text-[10px] text-gray-400 leading-tight">{opt.desc}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function StartMeeting() {
  const { id: projectId } = useParams();
  const location = useLocation();
  const navigate  = useNavigate();
  const { refreshPanel } = useProjectPanel();

  // Pré-remplissage depuis la timeline (location.state)
  const milestoneId    = location.state?.milestoneId    || null;
  const milestoneTitle = location.state?.milestoneTitle || '';
  const milestoneType  = location.state?.milestoneType  || null;

  const [task, setTask]               = useState(milestoneTitle);
  const [deliverable, setDeliverable] = useState(
    () => milestoneType && MT_MAP[milestoneType] ? MT_MAP[milestoneType] : 'summary'
  );

  const [availableAgents,   setAvailableAgents]   = useState([]);
  const [selectedAgentIds,  setSelectedAgentIds]  = useState(new Set());
  const [agentsLoading,     setAgentsLoading]     = useState(true);
  const [suggestingAgents,  setSuggestingAgents]  = useState(false);
  const [suggestionReasons, setSuggestionReasons] = useState({});
  const [newAgentForm,      setNewAgentForm]      = useState({ open: false, name: '', role: '', systemPrompt: '', scope: 'project' });
  const [creatingAgent,     setCreatingAgent]     = useState(false);
  const [starting,          setStarting]          = useState(false);
  const [error,             setError]             = useState('');

  // Chargement initial des agents du projet
  useEffect(() => {
    setAgentsLoading(true);
    api.get(`/projects/${projectId}/agents`)
      .then(({ data }) => {
        const enabled = data.filter(a => a.enabled !== false);
        setAvailableAgents(enabled);
        setSelectedAgentIds(new Set(enabled.slice(0, 2).map(a => a.agentId || a.id)));
      })
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, [projectId]);

  // Auto-suggestion si pré-rempli depuis la timeline
  useEffect(() => {
    if (!milestoneTitle) return;
    handleSuggestAgents(milestoneTitle, milestoneType);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSuggestAgents = async (taskValue = task, milType = null) => {
    if (!taskValue.trim() || suggestingAgents) return;
    setSuggestingAgents(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/suggest-agents`, {
        task: taskValue,
        ...(milType ? { milestoneType: milType } : {})
      });
      if (data.length > 0) {
        setSelectedAgentIds(new Set(data.map(s => s.agentId)));
        setSuggestionReasons(data.reduce((acc, s) => ({ ...acc, [s.agentId]: s.reason }), {}));
      }
    } catch {}
    setSuggestingAgents(false);
  };

  const toggleAgent = (id) => {
    setSelectedAgentIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleCreateAgent = async () => {
    if (!newAgentForm.name.trim() || creatingAgent) return;
    setCreatingAgent(true);
    try {
      console.log('[handleCreateAgent] POST /agents', { name: newAgentForm.name, role: newAgentForm.role });
      const { data: agent } = await api.post('/agents', {
        name:         newAgentForm.name.trim(),
        role:         newAgentForm.role.trim(),
        systemPrompt: newAgentForm.systemPrompt.trim()
      });
      console.log('[handleCreateAgent] agent créé', agent.id, agent.name);
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'manual' });
      console.log('[handleCreateAgent] agent lié au projet', projectId);
      setAvailableAgents(prev => [...prev, { ...agent, agentId: agent.id, enabled: true }]);
      setSelectedAgentIds(prev => new Set([...prev, agent.id]));
      setNewAgentForm({ open: false, name: '', role: '', systemPrompt: '' });
    } catch (err) {
      console.error('[handleCreateAgent] erreur', err.response?.data?.error || err.message);
    }
    setCreatingAgent(false);
  };

  const handleStart = async () => {
    if (!task.trim() || selectedAgentIds.size === 0 || starting) return;
    setError('');
    setStarting(true);
    try {
      const activeAgents = availableAgents
        .filter(a => selectedAgentIds.has(a.agentId || a.id))
        .map(a => ({
          id:           a.agentId || a.id,
          name:         a.name,
          role:         a.role,
          systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`,
          emoji:        a.emoji || '🤖'
        }));

      const { data } = await api.post(`/projects/${projectId}/sessions`, {
        task:         task.trim(),
        intention:    [deliverable],
        activeAgents,
        mode:         'meeting',
        ...(milestoneId ? { milestoneId } : {})
      });

      if (milestoneId) refreshPanel();
      navigate(`/projects/${projectId}/meeting/${data.session.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur lors du démarrage de la réunion');
      setStarting(false);
    }
  };

  const canStart = task.trim().length > 0 && selectedAgentIds.size >= 1 && !starting;

  return (
    <ProjectLayout projectId={projectId}>
      <div className="max-w-2xl mx-auto px-4 py-6">

        <Link to={`/projects/${projectId}`}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
          ← Retour au projet
        </Link>

        <h1 className="text-xl font-bold text-gray-900 mb-6">Nouvelle réunion</h1>

        <div className="space-y-5">

          {/* ── Section 1 : Objectif ────────────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-0.5">
                Objectif <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">Quel est l'objectif de cette réunion ?</p>
            </div>
            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              rows={4}
              placeholder="Ex : Définir les fonctionnalités principales du site..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition"
              autoFocus
            />
          </div>

          {/* ── Section 2 : Livrable attendu ────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-0.5">
                Livrable attendu <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-400">Que doit produire cette réunion ?</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {DELIVERABLES.map(d => {
                const active = deliverable === d.id;
                return (
                  <button key={d.id} type="button" onClick={() => setDeliverable(d.id)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left transition ${
                      active
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}>
                    <span className="text-2xl">{d.icon}</span>
                    <p className={`font-semibold text-sm ${active ? 'text-blue-700' : 'text-gray-800'}`}>
                      {d.label}
                    </p>
                    <p className="text-xs text-gray-400 leading-snug">{d.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Section 3 : Agents invités ──────────────────────────────────── */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-0.5">
                  Agents invités <span className="text-red-400">*</span>
                </label>
                <p className="text-xs text-gray-400">Minimum 1 agent requis.</p>
              </div>
              <button
                onClick={() => handleSuggestAgents()}
                disabled={suggestingAgents || !task.trim()}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition disabled:opacity-40 shrink-0"
              >
                {suggestingAgents ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    Suggestion…
                  </>
                ) : '✨ Suggestion IA'}
              </button>
            </div>

            {agentsLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {availableAgents.map(a => {
                  const id     = a.agentId || a.id;
                  const active = selectedAgentIds.has(id);
                  return (
                    <div key={id} onClick={() => toggleAgent(id)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition ${
                        active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                        active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {a.emoji || a.name?.[0] || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${active ? 'text-blue-800' : 'text-gray-700'}`}>
                          {a.name}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{a.role}</p>
                        {active && suggestionReasons[id] && (
                          <p className="text-[10px] text-blue-500 italic mt-0.5 truncate">✨ {suggestionReasons[id]}</p>
                        )}
                      </div>
                      {active && (
                        <svg className="w-4 h-4 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                        </svg>
                      )}
                    </div>
                  );
                })}

                {/* Créer un agent inline */}
                {newAgentForm.open ? (
                  <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2">
                    <input
                      autoFocus type="text" placeholder="Nom de l'agent" value={newAgentForm.name}
                      onChange={e => setNewAgentForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                    <input
                      type="text" placeholder="Rôle / spécialité" value={newAgentForm.role}
                      onChange={e => setNewAgentForm(p => ({ ...p, role: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                    />
                    <textarea
                      placeholder="Prompt système (optionnel)" value={newAgentForm.systemPrompt}
                      onChange={e => setNewAgentForm(p => ({ ...p, systemPrompt: e.target.value }))}
                      rows={2}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 bg-white resize-none"
                    />
                    <AgentScopeSelector
                      scope={newAgentForm.scope}
                      onChange={scope => setNewAgentForm(p => ({ ...p, scope }))}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleCreateAgent}
                        disabled={!newAgentForm.name.trim() || creatingAgent}
                        className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50"
                      >
                        {creatingAgent ? 'Création…' : 'Créer et inviter'}
                      </button>
                      <button
                        onClick={() => setNewAgentForm(p => ({ ...p, open: false }))}
                        className="text-sm text-gray-400 hover:text-gray-600 px-3"
                      >✕</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setNewAgentForm(p => ({ ...p, open: true }))}
                    className="w-full py-2.5 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl text-xs text-gray-400 hover:text-blue-500 transition"
                  >
                    + Créer un agent
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Erreur ──────────────────────────────────────────────────────── */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* ── Bouton démarrer ─────────────────────────────────────────────── */}
          <button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-sm"
          >
            {starting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Démarrage…
              </>
            ) : '🚀 Démarrer la réunion'}
          </button>

        </div>
      </div>
    </ProjectLayout>
  );
}
