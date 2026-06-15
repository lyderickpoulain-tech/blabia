// Sessions legacy v1/v2 — moteur SSE multi-tours avec formation d'équipe automatique.
// Conservé pour les sessions existantes. Nouvelles sessions → StartMeeting + MeetingRoom (v3.0).
import { useState, useEffect } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import SessionRunner from '../components/SessionRunner';
import ExportModal from '../components/ExportModal';
import AcceptSessionModal from '../components/AcceptSessionModal';
import api from '../utils/api';

const INTENTIONS = [
  { id: 'synthesis',      icon: '📄', label: 'Synthèse',      desc: 'Compte-rendu structuré archivé' },
  { id: 'memory',         icon: '🧠', label: 'Souvenir',       desc: 'Résumé injecté dans la mémoire projet' },
  { id: 'claude_code',    icon: '💻', label: 'Claude Code',    desc: 'Prompt pour développement' },
  { id: 'timeline_steps', icon: '📅', label: 'Étapes',         desc: 'Nouvelles étapes dans la timeline' },
];

// Composants Markdown stylés Tailwind
const MD = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 mb-3 mt-6 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold text-gray-800 mb-2 mt-5 pb-1 border-b border-gray-100">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-800 mb-2 mt-4">{children}</h3>,
  p:  ({ children }) => <p className="text-sm text-gray-700 mb-3 leading-relaxed last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-4 space-y-1 list-none">{children}</ul>,
  ol: ({ children }) => <ol className="mb-4 space-y-1 list-decimal list-inside text-sm text-gray-700">{children}</ol>,
  li: ({ children }) => (
    <li className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
      <span className="text-blue-400 font-bold mt-0.5 shrink-0">·</span>
      <span>{children}</span>
    </li>
  ),
  strong:     ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
  em:         ({ children }) => <em className="italic text-gray-600">{children}</em>,
  hr:         ()             => <hr className="my-5 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-200 pl-4 my-3 text-gray-600 italic text-sm">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="text-sm w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left font-semibold text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border border-gray-200 text-gray-700">{children}</td>,
};

// Palette par agent
const AGENT_PALETTE = {
  Analyste:     { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-800',    dot: 'bg-blue-500' },
  Créatif:      { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-800',  dot: 'bg-purple-500' },
  Critique:     { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  dot: 'bg-orange-500' },
  Expert:       { bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-800',   dot: 'bg-green-500' },
  Synthésiseur: { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-800',  dot: 'bg-indigo-500' },
  Chercheur:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-800',    dot: 'bg-cyan-500' },
  Stratège:     { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-800',    dot: 'bg-rose-500' },
  Rédacteur:    { bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-800',    dot: 'bg-pink-500' },
};
const DEFAULT_PALETTE = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', dot: 'bg-gray-400' };

function AgentChip({ agent }) {
  const p = AGENT_PALETTE[agent.name] || DEFAULT_PALETTE;
  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-xl border ${p.bg} ${p.border} transition`}>
      <div className={`w-9 h-9 rounded-full ${p.dot} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
        {agent.name[0]}
      </div>
      <div className="min-w-0">
        <p className={`font-semibold text-sm ${p.text}`}>{agent.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{agent.role}</p>
      </div>
    </div>
  );
}

export default function NewSession() {
  const { id: projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const parentSessionId = location.state?.parentSessionId || null;
  const initialTask     = location.state?.initialTask     || '';
  const milestoneId     = location.state?.milestoneId     || null;
  const milestoneType   = location.state?.milestoneType   || null;

  const [phase, setPhase]                 = useState('intention');
  const [task, setTask]                   = useState(initialTask);
  const [mode, setMode]                   = useState('realtime');
  const [model, setModel]                 = useState('claude-sonnet-4-6');
  const [fullContext, setFullContext]      = useState(false);
  const [cachedTeam, setCachedTeam]       = useState(null);
  const [session, setSession]             = useState(null);
  const [plan, setPlan]                   = useState('');
  const [error, setError]                 = useState('');
  const [summaries, setSummaries]               = useState([]);
  const [additionalPrompt, setAdditionalPrompt] = useState('');
  const [isRelaunching, setIsRelaunching]       = useState(false);
  const [streamingSummary, setStreamingSummary] = useState('');
  const [relaunchError, setRelaunchError]       = useState('');
  const [sessionHasCode, setSessionHasCode]       = useState(false);
  const [showExport, setShowExport]               = useState(false);
  const [showCodeConfirm, setShowCodeConfirm]     = useState(false);
  const [savingCodeStatus, setSavingCodeStatus]   = useState(false);
  const [planSuggestions, setPlanSuggestions]     = useState(null);
  const [addedToPlan, setAddedToPlan]             = useState(false);
  const [planIgnored, setPlanIgnored]             = useState(false);
  const [addingToPlan, setAddingToPlan]           = useState(false);
  const [intentions, setIntentions]               = useState(() => {
    const MT_MAP = {
      synthesis: 'synthesis', meeting: 'synthesis',
      memory: 'memory',
      claude_code: 'claude_code', technical: 'claude_code',
      timeline_steps: 'timeline_steps',
    };
    const initial = milestoneType && MT_MAP[milestoneType] ? MT_MAP[milestoneType] : 'synthesis';
    return new Set([initial]);
  });
  const [availableAgents, setAvailableAgents]     = useState([]);
  const [selectedAgentIds, setSelectedAgentIds]   = useState(new Set());
  const [agentsLoading, setAgentsLoading]         = useState(false);
  const [suggestingAgents, setSuggestingAgents]   = useState(false);
  const [newAgentForm, setNewAgentForm]           = useState({ open: false, name: '', role: '', systemPrompt: '' });
  const [creatingAgent, setCreatingAgent]         = useState(false);
  const [showAcceptModal, setShowAcceptModal]     = useState(false);
  const [sessionStatus, setSessionStatus]         = useState('open');
  const [abandonConfirm, setAbandonConfirm]       = useState(false);
  const { refreshPanel } = useProjectPanel();

  const basePayload = () => {
    const p = { task: task.trim(), mode, model, fullContext };
    if (parentSessionId) p.parentSessionId = parentSessionId;
    if (milestoneId)     p.milestoneId     = milestoneId;
    return p;
  };

  useEffect(() => {
    if (phase !== 'agents') return;
    setAgentsLoading(true);
    api.get(`/projects/${projectId}/agents`)
      .then(({ data }) => {
        const enabled = data.filter(a => a.enabled !== false);
        setAvailableAgents(enabled);
        setSelectedAgentIds(new Set(enabled.slice(0, 2).map(a => a.agentId || a.id)));
      })
      .catch(() => {})
      .finally(() => setAgentsLoading(false));
  }, [phase, projectId]);

  const handleSuggestAgents = async () => {
    if (!task.trim() || suggestingAgents) return;
    setSuggestingAgents(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/suggest-agents`, { task });
      if (data.length > 0) setSelectedAgentIds(new Set(data.map(s => s.agentId)));
    } catch {}
    setSuggestingAgents(false);
  };

  const handleCreateAgent = async () => {
    if (!newAgentForm.name.trim() || creatingAgent) return;
    setCreatingAgent(true);
    try {
      const { data: agent } = await api.post('/agents', {
        name: newAgentForm.name.trim(),
        role: newAgentForm.role.trim(),
        systemPrompt: newAgentForm.systemPrompt.trim()
      });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'manual' });
      setAvailableAgents(prev => [...prev, { ...agent, agentId: agent.id, enabled: true }]);
      setSelectedAgentIds(prev => new Set([...prev, agent.id]));
      setNewAgentForm({ open: false, name: '', role: '', systemPrompt: '' });
    } catch {}
    setCreatingAgent(false);
  };

  const handleFormTeam = async () => {
    if (!task.trim()) return;
    setError('');
    setPhase('forming');
    try {
      const agentsForSession = availableAgents
        .filter(a => selectedAgentIds.has(a.agentId || a.id))
        .map(a => ({ name: a.name, role: a.role, systemPrompt: a.systemPrompt || `Tu es ${a.name}. ${a.role}.`, emoji: a.emoji || '🤖' }));
      const { data } = await api.post(`/projects/${projectId}/sessions`, {
        ...basePayload(),
        ...(agentsForSession.length > 0 ? { selectedAgents: agentsForSession } : {}),
        intention: [...intentions],
      });
      if (data.cached) {
        setCachedTeam({ agents: data.agents, plan: data.plan });
        setPhase('cached');
      } else {
        setSession(data.session);
        setPlan(data.plan);
        setPhase('formed');
        if (milestoneId) refreshPanel();
      }
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de la formation de l'équipe");
      setPhase('input');
    }
  };

  const handleAcceptCache = async () => {
    setError('');
    setPhase('forming');
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions`, {
        ...basePayload(), cachedAgents: cachedTeam.agents
      });
      setSession(data.session);
      setPlan(cachedTeam.plan);
      setCachedTeam(null);
      setPhase('formed');
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de la création de la réunion");
      setPhase('input');
    }
  };

  const handleRejectCache = async () => {
    setError('');
    setPhase('forming');
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions`, {
        ...basePayload(), forceNew: true
      });
      setSession(data.session);
      setPlan(data.plan);
      setCachedTeam(null);
      setPhase('formed');
    } catch (err) {
      setError(err.response?.data?.error || "Erreur lors de la formation de l'équipe");
      setPhase('input');
    }
  };

  const handleStartRun    = () => setPhase('running');
  const handleComplete    = (summary) => { setSummaries([summary]); setPhase('complete'); };
  const handleConversationEnd = () => navigate(`/projects/${projectId}`);

  const handleRelaunch = async () => {
    if (!additionalPrompt.trim() || isRelaunching) return;
    setRelaunchError('');
    setIsRelaunching(true);
    setStreamingSummary('');
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sessions/${session.id}/run`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ humanInput: additionalPrompt.trim() })
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRelaunchError(body.error || 'Erreur lors du relancement');
        setIsRelaunching(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === 'summary_chunk') {
              setStreamingSummary(prev => prev + ev.text.replace('[HAS_CODE]', ''));
            } else if (ev.type === 'has_code' && ev.value) {
              setSessionHasCode(true);
            } else if (ev.type === 'plan_suggestions') {
              initSuggestions(ev);
            } else if (ev.type === 'summary_done') {
              setSummaries(prev => [...prev, ev.summary]);
              setAdditionalPrompt('');
              setStreamingSummary('');
              setIsRelaunching(false);
            } else if (ev.type === 'error') {
              setRelaunchError(ev.message);
              setIsRelaunching(false);
              setStreamingSummary('');
            }
          } catch {}
        }
      }
    } catch (err) {
      setRelaunchError('Connexion interrompue : ' + err.message);
      setIsRelaunching(false);
      setStreamingSummary('');
    }
  };

  const initSuggestions = (data) => {
    if ((data.milestones || []).length === 0 && (data.standalone_todos || []).length === 0) return;
    setPlanSuggestions(data);
  };

  const handleAddToPlan = async () => {
    if (addingToPlan || !planSuggestions) return;
    setAddingToPlan(true);
    try {
      await api.post(`/projects/${projectId}/plan/bulk`, {
        milestones:       planSuggestions.milestones       || [],
        standalone_todos: planSuggestions.standalone_todos || [],
        sessionId:        session?.id,
        sourceSessionId:  session?.id
      });
      setAddedToPlan(true);
      refreshPanel();
    } catch (err) {
      console.error('[addToPlan]', err.message);
    } finally {
      setAddingToPlan(false);
    }
  };

  const handleExport = () => { setShowExport(true); setShowCodeConfirm(true); };

  const handleCodeStatus = async (status) => {
    if (savingCodeStatus || !session) return;
    setSavingCodeStatus(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${session.id}/code-status`, { status });
      setShowCodeConfirm(false);
    } catch (err) {
      console.error('[code-status]', err.message);
    } finally {
      setSavingCodeStatus(false);
    }
  };

  return (
    <ProjectLayout projectId={projectId}>
      <div className="max-w-2xl mx-auto">
        <Link to={`/projects/${projectId}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-5">
          ← Retour au projet
        </Link>

        {/* PHASE INTENTION */}
        {phase === 'intention' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Que doit produire cette réunion ?</h1>
              <p className="text-gray-400 text-sm mt-1">Sélectionne une ou plusieurs intentions — au moins une requise.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INTENTIONS.map(intent => {
                const active = intentions.has(intent.id);
                return (
                  <button key={intent.id} type="button"
                    onClick={() => setIntentions(prev => {
                      const s = new Set(prev);
                      s.has(intent.id) ? s.delete(intent.id) : s.add(intent.id);
                      return s;
                    })}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left transition ${
                      active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}>
                    <span className="text-2xl">{intent.icon}</span>
                    <p className={`font-semibold text-sm ${active ? 'text-blue-700' : 'text-gray-800'}`}>{intent.label}</p>
                    <p className="text-xs text-gray-400 leading-snug">{intent.desc}</p>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPhase('agents')} disabled={intentions.size === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 text-sm">
              Continuer → Choisir les agents
            </button>
          </div>
        )}

        {/* PHASE AGENTS */}
        {phase === 'agents' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setPhase('intention')} className="text-gray-400 hover:text-gray-600 text-sm">←</button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Quels agents pour cette réunion ?</h1>
                <p className="text-gray-400 text-sm mt-0.5">Sélectionne les agents qui interviendront.</p>
              </div>
            </div>
            {agentsLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {availableAgents.map(a => {
                  const id = a.agentId || a.id;
                  const active = selectedAgentIds.has(id);
                  return (
                    <div key={id} onClick={() => setSelectedAgentIds(prev => {
                      const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s;
                    })}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition ${
                        active ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${active ? 'bg-blue-600 text-white' : 'bg-gray-300 text-white'}`}>
                        {(a.emoji || a.name?.[0] || '?')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${active ? 'text-blue-800' : 'text-gray-700'}`}>{a.name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.role}</p>
                      </div>
                      {active && <svg className="w-4 h-4 text-blue-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                    </div>
                  );
                })}
                {newAgentForm.open ? (
                  <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-2">
                    <input autoFocus type="text" placeholder="Nom de l'agent" value={newAgentForm.name}
                      onChange={e => setNewAgentForm(p => ({ ...p, name: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400" />
                    <input type="text" placeholder="Rôle / spécialité" value={newAgentForm.role}
                      onChange={e => setNewAgentForm(p => ({ ...p, role: e.target.value }))}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400" />
                    <textarea placeholder="Prompt système (optionnel)" value={newAgentForm.systemPrompt}
                      onChange={e => setNewAgentForm(p => ({ ...p, systemPrompt: e.target.value }))}
                      rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    <div className="flex gap-2">
                      <button onClick={handleCreateAgent} disabled={!newAgentForm.name.trim() || creatingAgent}
                        className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">
                        {creatingAgent ? 'Création…' : 'Créer et sélectionner'}
                      </button>
                      <button onClick={() => setNewAgentForm(p => ({ ...p, open: false }))}
                        className="text-sm text-gray-400 hover:text-gray-600 px-3">✕</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setNewAgentForm(p => ({ ...p, open: true }))}
                    className="w-full py-2 border-2 border-dashed border-gray-200 hover:border-blue-300 rounded-xl text-xs text-gray-400 hover:text-blue-500 transition">
                    + Créer un agent
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={handleSuggestAgents} disabled={suggestingAgents || !task.trim()}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                {suggestingAgents ? 'Suggestion…' : '✨ Suggestion IA'}
              </button>
              <button onClick={() => setPhase('input')} disabled={selectedAgentIds.size === 0}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                Continuer ({selectedAgentIds.size}) →
              </button>
            </div>
          </div>
        )}

        {/* PHASE INPUT / FORMING */}
        {(phase === 'input' || phase === 'forming') && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            {parentSessionId ? (
              <>
                <h1 className="text-xl font-bold text-gray-900">Suite de réunion</h1>
                <div className="mt-2 mb-5 flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Les agents auront accès au contexte complet de la réunion précédente.</span>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold text-gray-900">Nouvelle réunion</h1>
                <p className="text-gray-500 text-sm mt-1 mb-6">Décrivez votre tâche — les agents IA vont collaborer pour vous.</p>
              </>
            )}
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Votre tâche ou idée <span className="text-red-400">*</span></label>
                <textarea value={task} onChange={e => setTask(e.target.value)} disabled={phase === 'forming'} rows={5}
                  placeholder="Ex : Rédiger une stratégie de lancement pour notre nouveau produit…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition resize-none disabled:bg-gray-50 disabled:text-gray-400" autoFocus />
                <p className="text-xs text-gray-400 mt-1 text-right">{task.length} caractère{task.length !== 1 ? 's' : ''}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'conversation', label: '💬 Conversation', desc: 'Échanges libres avec les agents (recommandé)' },
                    { value: 'realtime',     label: '⚡ Synthèse directe', desc: 'Les agents produisent directement sans échange' },
                  ].map(opt => (
                    <button key={opt.value} type="button" onClick={() => setMode(opt.value)}
                      className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border-2 text-left transition ${
                        mode === opt.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}>
                      <span className={`text-sm font-semibold ${mode === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>{opt.label}</span>
                      <span className="text-xs text-gray-400 leading-snug">{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Modèle IA</label>
                <div className="flex gap-2">
                  {[
                    { id: 'claude-sonnet-4-6', label: 'Sonnet', desc: 'Rapide · Recommandé', color: 'blue' },
                    { id: 'claude-opus-4-8',   label: 'Opus',   desc: 'Plus puissant · Plus lent', color: 'purple' }
                  ].map(m => {
                    const active = model === m.id;
                    return (
                      <button key={m.id} type="button" onClick={() => setModel(m.id)}
                        className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm transition ${
                          active
                            ? m.color === 'blue' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                        }`}>
                        <span className="font-semibold">{m.label}</span>
                        <span className="text-xs text-gray-400 hidden sm:inline">{m.desc}</span>
                        {active && <span className={`ml-auto text-xs ${m.color === 'blue' ? 'text-blue-500' : 'text-purple-500'}`}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-gray-700">Contexte complet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Injecter tout le contexte projet (plus lent, plus coûteux)</p>
                </div>
                <button type="button" onClick={() => setFullContext(v => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${fullContext ? 'bg-blue-500' : 'bg-gray-200'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${fullContext ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
                  <span className="mt-0.5">⚠️</span><span>{error}</span>
                </div>
              )}
              <div className="flex gap-2">
                {phase !== 'forming' && (
                  <button type="button" onClick={() => setPhase('agents')}
                    className="border border-gray-200 text-gray-500 hover:bg-gray-50 py-3 px-4 rounded-xl text-sm transition">
                    ← Agents
                  </button>
                )}
                <button onClick={handleFormTeam} disabled={!task.trim() || phase === 'forming'}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-3.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm">
                  {phase === 'forming' ? (
                    <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Création de la réunion…</>
                  ) : 'Lancer les agents →'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PHASE CACHED */}
        {phase === 'cached' && cachedTeam && (
          <div className="space-y-4">
            <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-5">
              <div className="flex items-start gap-3 mb-4">
                <span className="text-2xl shrink-0">♻️</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">Tâche identique détectée</p>
                  <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">Une réunion précédente utilisait exactement cette tâche. Voulez-vous réutiliser la même équipe ?</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {cachedTeam.agents.map((agent, i) => {
                  const p = AGENT_PALETTE[agent.name] || DEFAULT_PALETTE;
                  return (
                    <div key={i} className={`flex items-center gap-2.5 p-3 rounded-xl border ${p.bg} ${p.border}`}>
                      <div className={`w-7 h-7 rounded-full ${p.dot} flex items-center justify-center text-white font-bold text-xs shrink-0`}>{agent.name[0]}</div>
                      <div className="min-w-0">
                        <p className={`font-semibold text-xs ${p.text}`}>{agent.name}</p>
                        <p className="text-xs text-gray-400 truncate">{agent.role}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3">
                <button onClick={handleAcceptCache} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2.5 rounded-xl transition text-sm">Réutiliser cette équipe →</button>
                <button onClick={handleRejectCache} className="flex-1 border border-amber-300 text-amber-700 hover:bg-amber-50 font-medium py-2.5 rounded-xl transition text-sm">Former une nouvelle équipe</button>
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>}
          </div>
        )}

        {/* PHASE FORMED */}
        {phase === 'formed' && session && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-green-500">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                </span>
                <span className="text-sm font-semibold text-gray-700">Équipe prête</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{session.task}</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h2 className="font-semibold text-gray-900 text-sm mb-3">{session.agents.length} agents mobilisés</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {session.agents.map((agent, i) => <AgentChip key={i} agent={agent} />)}
              </div>
            </div>
            <button onClick={handleStartRun}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 rounded-xl transition flex items-center justify-center gap-2 text-sm shadow-sm">
              Démarrer les échanges →
            </button>
          </div>
        )}

        {/* PHASE RUNNING */}
        {phase === 'running' && session && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${session.mode === 'realtime' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {session.mode === 'realtime' ? '⚡ Synthèse' : '💬 Conversation'}
              </span>
              <p className="text-sm text-gray-600 truncate flex-1">{session.task}</p>
            </div>
            <SessionRunner
              session={session} projectId={projectId}
              onComplete={handleComplete} onConversationEnd={handleConversationEnd}
              onRetry={() => setPhase('formed')}
              onHasCode={(v) => setSessionHasCode(v)}
              onPlanSuggestions={initSuggestions}
            />
          </div>
        )}

        {/* PHASE COMPLETE */}
        {phase === 'complete' && session && summaries.length > 0 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3">
              <p className="text-sm text-gray-700 truncate flex-1">{session.task}</p>
              <span className="text-xs font-medium bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full shrink-0">Sauvegardée</span>
            </div>
            {summaries.map((summary, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-b border-blue-100">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-1">
                    {idx === 0 ? 'Restitution finale' : `Approfondissement — Tour ${idx + 1}`}
                  </p>
                  {idx === 0 && <h2 className="font-bold text-gray-900 text-base leading-snug">{session.task}</h2>}
                </div>
                <div className="px-6 py-5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{summary}</ReactMarkdown>
                </div>
              </div>
            ))}
            {isRelaunching && (
              <div className="bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-b border-blue-100">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide animate-pulse">Synthèse en cours…</p>
                </div>
                <div className="px-6 py-5">
                  {streamingSummary
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{streamingSummary}</ReactMarkdown>
                    : <div className="flex items-center gap-2 py-4 text-gray-400"><span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /><span className="text-sm">Les agents travaillent…</span></div>}
                </div>
              </div>
            )}
            {relaunchError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2"><span>⚠️</span><span>{relaunchError}</span></div>}
            {planSuggestions && !addedToPlan && !planIgnored && (
              <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-800">📋 Plan généré par les agents</h3>
                <div className="flex gap-2 pt-1">
                  <button onClick={handleAddToPlan} disabled={addingToPlan}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50">
                    {addingToPlan ? 'Ajout…' : '+ Ajouter à la timeline'}
                  </button>
                  <button onClick={() => setPlanIgnored(true)}
                    className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl text-sm transition">Ignorer</button>
                </div>
              </div>
            )}
            {!isRelaunching && sessionStatus === 'open' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
                <p className="text-sm font-semibold text-gray-700">Approfondir ou compléter</p>
                <textarea value={additionalPrompt} onChange={e => setAdditionalPrompt(e.target.value)} rows={3}
                  placeholder="Approfondir ce point ou ajouter un prompt complémentaire…"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition" />
                <button onClick={handleRelaunch} disabled={!additionalPrompt.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  Relancer les agents →
                </button>
              </div>
            )}
            {sessionStatus === 'open' && !isRelaunching && (
              <div className="space-y-2">
                {!abandonConfirm ? (
                  <div className="flex gap-2">
                    <button onClick={() => setShowAcceptModal(true)}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                      ✅ Accepter cette réunion
                    </button>
                    <button onClick={() => setAbandonConfirm(true)}
                      className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-medium py-3 px-4 rounded-xl text-sm transition">
                      🚫 Abandonner
                    </button>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm text-gray-600">Cette réunion sera close sans impact sur le projet.</p>
                    <div className="flex gap-2">
                      <button onClick={() => setAbandonConfirm(false)} className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">Annuler</button>
                      <button onClick={async () => {
                        await api.patch(`/projects/${projectId}/sessions/${session.id}/status`, { status: 'abandoned' }).catch(() => {});
                        setSessionStatus('abandoned');
                        setAbandonConfirm(false);
                      }} className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 rounded-xl text-sm">
                        Confirmer l'abandon
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {(sessionStatus === 'accepted' || sessionStatus === 'abandoned') && (
              <div className={`rounded-xl p-3 text-sm text-center font-medium ${
                sessionStatus === 'accepted' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'
              }`}>
                {sessionStatus === 'accepted' ? '✅ Réunion acceptée' : '🚫 Réunion abandonnée'}
              </div>
            )}
            <Link to={`/projects/${projectId}/session/${session.id}/summary`}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm shadow-sm">
              Voir le compte-rendu
            </Link>
            {sessionHasCode && (
              <div className="space-y-2">
                <button onClick={handleExport}
                  className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-xl transition text-sm">
                  Exporter vers Claude Code
                </button>
                {showCodeConfirm && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-600 text-center">Le code a-t-il été implémenté ?</p>
                    <div className="flex gap-2">
                      <button onClick={() => handleCodeStatus('implemented')} disabled={savingCodeStatus}
                        className="flex-1 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50">
                        ✅ Code implémenté et commité
                      </button>
                      <button onClick={() => handleCodeStatus('not_generated')} disabled={savingCodeStatus}
                        className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50">
                        ❌ Ce code n'a pas été généré
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <Link to={`/projects/${projectId}`} className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition py-1">
              ← Retour au projet
            </Link>
          </div>
        )}
      </div>

      {showExport && summaries.length > 0 && (
        <ExportModal summary={summaries[summaries.length - 1]} projectId={projectId} onClose={() => setShowExport(false)} />
      )}
      {showAcceptModal && session && (
        <AcceptSessionModal
          session={{ ...session, intention: [...intentions], summary: summaries[summaries.length - 1] || '' }}
          projectId={projectId}
          planSuggestions={planSuggestions}
          onClose={() => setShowAcceptModal(false)}
          onAccepted={() => { setSessionStatus('accepted'); setShowAcceptModal(false); refreshPanel(); }}
        />
      )}
    </ProjectLayout>
  );
}
