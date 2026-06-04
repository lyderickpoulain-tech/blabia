import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';

// ── Palette agents (même que NewSession) ──────────────────────────────────────
const PALETTE = {
  'Analyste':       { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   dot: 'bg-blue-500',   ring: 'ring-blue-300' },
  'Créatif':        { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-500', ring: 'ring-purple-300' },
  'Critique':       { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500', ring: 'ring-orange-300' },
  'Expert':         { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  dot: 'bg-green-500',  ring: 'ring-green-300' },
  'Synthésiseur':   { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500', ring: 'ring-indigo-300' },
  'Chercheur':      { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-800',   dot: 'bg-cyan-500',   ring: 'ring-cyan-300' },
  'Stratège':       { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-800',   dot: 'bg-rose-500',   ring: 'ring-rose-300' },
  'Rédacteur':      { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-800',   dot: 'bg-pink-500',   ring: 'ring-pink-300' },
  'Synthèse finale':{ bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-800', dot: 'bg-violet-500', ring: 'ring-violet-300' },
};
const DEFAULT = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400', ring: 'ring-gray-300' };
const col = (name) => PALETTE[name] || DEFAULT;

// ── Icônes par type d'entrée timeline ─────────────────────────────────────────
const TL_ICON = {
  team_formation: '🤝',
  agent_turn:     '💬',
  question:       '❓',
  synthesis:      '✨',
};

// ── Sous-composants ────────────────────────────────────────────────────────────

function Avatar({ name, pulse = false }) {
  const c = col(name);
  return (
    <div className={`w-8 h-8 rounded-full ${c.dot} flex items-center justify-center text-white text-xs font-bold shrink-0 ${pulse ? 'animate-pulse' : ''}`}>
      {name[0]}
    </div>
  );
}

function AgentBubble({ agentName, content, streaming = false }) {
  const c = col(agentName);
  if (!content && !streaming) return null;
  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={agentName} />
      <div className={`flex-1 rounded-2xl rounded-tl-sm px-4 py-3 border ${c.bg} ${c.border}`}>
        <p className={`text-xs font-semibold ${c.text} mb-1.5`}>{agentName}</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {content}
          {streaming && (
            <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 align-middle animate-pulse" />
          )}
        </p>
      </div>
    </div>
  );
}

function HumanBubble({ content }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
        <p className="text-xs font-semibold text-blue-200 mb-1">Vous</p>
        <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
      </div>
    </div>
  );
}

function QuestionCard({ agent, question, answer, onChange, onSend, sending }) {
  const c = col(agent);
  const onKey = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSend(); };
  return (
    <div className={`rounded-2xl border-2 ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center gap-2 mb-3">
        <Avatar name={agent} />
        <div>
          <p className={`text-sm font-semibold ${c.text}`}>{agent}</p>
          <p className="text-xs text-gray-500">a besoin d'une information</p>
        </div>
        <span className="ml-auto text-lg">❓</span>
      </div>
      <p className="text-sm font-medium text-gray-800 mb-3 leading-relaxed">{question}</p>
      <textarea
        value={answer}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKey}
        placeholder="Votre réponse… (Ctrl+Entrée pour envoyer)"
        rows={3}
        autoFocus
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none"
      />
      <button
        onClick={onSend}
        disabled={!answer.trim() || sending}
        className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 rounded-xl transition disabled:opacity-50"
      >
        {sending ? 'Envoi…' : 'Répondre →'}
      </button>
    </div>
  );
}

function SuggestAgentCard({ suggestion, onAdd, onIgnore, adding }) {
  return (
    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-sm font-semibold text-amber-800">Suggestion d'un nouvel agent</p>
            <p className="text-xs text-gray-500">Un agent propose d'étendre la bibliothèque</p>
          </div>
        </div>
        <button onClick={onIgnore} className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">×</button>
      </div>
      <div className="bg-white rounded-xl border border-amber-200 px-4 py-3 mb-3">
        <p className="text-sm font-semibold text-gray-800">{suggestion.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{suggestion.role}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onIgnore}
          className="flex-1 text-sm text-gray-600 border border-gray-200 py-2 rounded-xl hover:bg-gray-50 transition"
        >
          Ignorer
        </button>
        <button
          onClick={onAdd}
          disabled={adding}
          className="flex-1 text-sm bg-amber-500 hover:bg-amber-600 text-white font-semibold py-2 rounded-xl transition disabled:opacity-50"
        >
          {adding ? 'Création…' : 'Créer cet agent'}
        </button>
      </div>
    </div>
  );
}

function SummarySteps({ exchanges, activeAgent, isSummaryPhase, pendingQuestion }) {
  const agentExchanges = exchanges.filter(e => e.type === 'agent');
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Progression</p>
      {agentExchanges.map((ex) => (
        <div key={ex.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100">
          <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">✓</div>
          <span className="text-sm font-medium text-gray-700">{ex.agent}</span>
          <span className="text-xs text-gray-400 ml-auto">Terminé</span>
        </div>
      ))}
      {pendingQuestion && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base shrink-0">❓</span>
            <span className="text-sm font-semibold text-amber-800">{pendingQuestion.agent}</span>
            <span className="text-xs text-amber-600 ml-auto font-medium">Attend votre réponse</span>
          </div>
          <p className="text-sm text-gray-800 leading-relaxed">{pendingQuestion.question}</p>
        </div>
      )}
      {activeAgent && !pendingQuestion && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-200 animate-pulse">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          </div>
          <span className="text-sm font-medium text-blue-700">
            {isSummaryPhase ? 'Synthèse finale' : activeAgent.name}
          </span>
          <span className="text-xs text-blue-500 ml-auto">En cours…</span>
        </div>
      )}
      {agentExchanges.length === 0 && !activeAgent && !pendingQuestion && (
        <p className="text-sm text-gray-400 py-4 text-center">Démarrage…</p>
      )}
    </div>
  );
}

// ── Timeline compacte live ─────────────────────────────────────────────────────

function LiveTimeline({ entries }) {
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2.5">⏱ Timeline en cours</p>
      <div className="relative pl-5">
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-100" />
        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={e.id || i} className="relative flex items-center gap-2">
              <div className={`relative z-10 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] shrink-0 ${
                e.status === 'done'
                  ? 'bg-green-500 text-white'
                  : e.status === 'in_progress'
                  ? 'bg-blue-500 text-white animate-pulse'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {e.status === 'done' ? '✓' : (TL_ICON[e.type] || '')}
              </div>
              <span className={`text-xs font-medium truncate ${
                e.status === 'done'
                  ? 'text-green-700'
                  : e.status === 'in_progress'
                  ? 'text-blue-700'
                  : 'text-gray-400'
              }`}>{e.label}</span>
              {e.status === 'in_progress' && (
                <span className="text-[10px] text-blue-400 ml-auto shrink-0">En cours…</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function SessionRunner({ session, projectId, onComplete, onConversationEnd, onRetry, onHasCode, onPlanSuggestions }) {
  const [exchanges, setExchanges]               = useState([]);
  const [activeAgent, setActiveAgent]           = useState(null);
  const [streamingText, setStreamingText]       = useState('');
  const [isSummaryPhase, setIsSummaryPhase]     = useState(false);
  const [pendingQuestion, setPendingQuestion]   = useState(null);
  const [humanAnswer, setHumanAnswer]           = useState('');
  const [sending, setSending]                   = useState(false);
  const [error, setError]                       = useState('');
  const [pendingSuggestions, setPendingSuggestions] = useState([]);
  const [addingAgent, setAddingAgent]           = useState(null);
  const [turnComplete, setTurnComplete]         = useState(false);
  const [currentTurn, setCurrentTurn]           = useState(1);
  const [humanInput, setHumanInput]             = useState('');
  const [closingSession, setClosingSession]     = useState(false);
  const [synthesizing, setSynthesizing]         = useState(false);
  const [toastMessage, setToastMessage]         = useState('');
  const [liveTimeline, setLiveTimeline]         = useState([]);
  const [showTimeline, setShowTimeline]         = useState(false);

  const bottomRef            = useRef(null);
  const abortRef             = useRef(null);
  const currentAgentIdRef    = useRef(null);
  const currentQuestionIdRef = useRef(null);
  const streamCompletedRef   = useRef(false);

  const isRealtime     = session.mode === 'realtime';
  const isConversation = session.mode === 'conversation';

  // Auto-scroll vers le bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [exchanges, streamingText, pendingQuestion]);

  // Lancer le SSE au montage
  useEffect(() => {
    run();
    return () => abortRef.current?.abort();
  }, []);

  async function run(humanInputText = null) {
    streamCompletedRef.current = false;
    setError('');
    setTurnComplete(false);
    const token = localStorage.getItem('token');
    abortRef.current = new AbortController();

    try {
      const res = await fetch(
        `/api/projects/${projectId}/sessions/${session.id}/run`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(humanInputText ? { humanInput: humanInputText } : {}),
          signal: abortRef.current.signal
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Erreur ${res.status}`);
        return;
      }

      const reader  = res.body.getReader();
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
          try { dispatch(JSON.parse(line.slice(6))); } catch {}
        }
      }

      // Stream fermé sans événement terminal (timeout Railway, coupure réseau, erreur Anthropic non transmise)
      if (!streamCompletedRef.current) {
        setError('La connexion a été interrompue avant la fin de la session. Consultez les logs Railway pour le détail, puis relancez.');
        setActiveAgent(null);
        setStreamingText('');
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError('Connexion interrompue : ' + err.message);
    }
  }

  function dispatch(ev) {
    switch (ev.type) {
      case 'agent_start': {
        const agentId = `at-${ev.name}-${Date.now()}`;
        currentAgentIdRef.current = agentId;
        setLiveTimeline(prev => {
          const withTF = prev.some(e => e.type === 'team_formation')
            ? prev
            : [...prev, { id: 'tf', type: 'team_formation', label: 'Formation de l\'équipe', status: 'done' }];
          return [...withTF, { id: agentId, type: 'agent_turn', label: ev.name, status: 'in_progress' }];
        });
        setActiveAgent({ name: ev.name, role: ev.role });
        setStreamingText('');
        setIsSummaryPhase(false);
        break;
      }
      case 'chunk':
        if (isRealtime) setStreamingText(p => p + ev.text);
        break;
      case 'agent_done': {
        const id = currentAgentIdRef.current;
        if (id) {
          setLiveTimeline(prev => prev.map(e => e.id === id ? { ...e, status: 'done' } : e));
          currentAgentIdRef.current = null;
        }
        setExchanges(p => [...p, { type: 'agent', agent: ev.name, content: ev.content, id: `${ev.name}-${Date.now()}` }]);
        setActiveAgent(null);
        setStreamingText('');
        break;
      }
      case 'question': {
        const qId = `q-${Date.now()}`;
        currentQuestionIdRef.current = qId;
        setLiveTimeline(prev => [
          ...prev,
          { id: qId, type: 'question', label: `Question de ${ev.agent}`, status: 'in_progress' }
        ]);
        setPendingQuestion({ agent: ev.agent, question: ev.question });
        setActiveAgent(null);
        setStreamingText('');
        break;
      }
      case 'answer_received': {
        const qId = currentQuestionIdRef.current;
        if (qId) {
          setLiveTimeline(prev => prev.map(e => e.id === qId ? { ...e, status: 'done' } : e));
          currentQuestionIdRef.current = null;
        }
        setExchanges(p => [...p, { type: 'human', content: ev.answer, id: `human-${Date.now()}` }]);
        setPendingQuestion(null);
        setHumanAnswer('');
        break;
      }
      case 'summary_start':
        setLiveTimeline(prev => [
          ...prev,
          { id: 'syn', type: 'synthesis', label: 'Synthèse finale', status: 'in_progress' }
        ]);
        setIsSummaryPhase(true);
        setActiveAgent({ name: 'Synthèse finale', role: 'Restitution structurée' });
        setStreamingText('');
        break;
      case 'summary_chunk':
        if (isRealtime) setStreamingText(p => p + ev.text.replace('[HAS_CODE]', ''));
        break;
      case 'has_code':
        onHasCode?.(ev.value);
        break;
      case 'plan_suggestions':
        onPlanSuggestions?.({ milestones: ev.milestones || [], standalone_todos: ev.standalone_todos || [] });
        break;
      case 'summary_done':
        streamCompletedRef.current = true;
        setLiveTimeline(prev => prev.map(e => e.id === 'syn' ? { ...e, status: 'done' } : e));
        setActiveAgent(null);
        setStreamingText('');
        onComplete(ev.summary);
        break;
      case 'suggest_agent':
        setPendingSuggestions(p => [...p, {
          id: `${ev.name}-${Date.now()}`,
          name: ev.name,
          role: ev.role,
          systemPrompt: ev.systemPrompt,
          emoji: ev.emoji || '🤖'
        }]);
        break;
      case 'turn_complete':
        streamCompletedRef.current = true;
        setTurnComplete(true);
        setCurrentTurn(ev.turn + 1);
        setActiveAgent(null);
        setStreamingText('');
        break;
      case 'error':
        setError(ev.message);
        setActiveAgent(null);
        setStreamingText('');
        break;
      default: break;
    }
  }

  const continueConversation = async () => {
    if (!humanInput.trim()) return;
    const text = humanInput.trim();
    setHumanInput('');
    setTurnComplete(false);
    setExchanges(p => [
      ...p,
      { type: 'turn_separator', turn: currentTurn - 1, id: `sep-${Date.now()}` },
      { type: 'human', content: text, id: `human-input-${Date.now()}` }
    ]);
    await run(text);
  };

  const closeConversation = async () => {
    if (closingSession) return;
    setClosingSession(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/projects/${projectId}/sessions/${session.id}/close`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      onConversationEnd?.();
    } catch (e) {
      setError('Erreur fermeture : ' + e.message);
    } finally {
      setClosingSession(false);
    }
  };

  const generateSummary = async () => {
    if (synthesizing) return;
    setSynthesizing(true);
    setTurnComplete(false);
    setIsSummaryPhase(true);
    setActiveAgent({ name: 'Synthèse finale', role: 'Restitution structurée' });
    const token = localStorage.getItem('token');
    abortRef.current = new AbortController();

    try {
      const res = await fetch(
        `/api/projects/${projectId}/sessions/${session.id}/synthesize`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          signal: abortRef.current.signal
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || `Erreur ${res.status}`);
        setSynthesizing(false);
        setActiveAgent(null);
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
          try { dispatch(JSON.parse(line.slice(6))); } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError('Erreur synthèse : ' + err.message);
    } finally {
      setSynthesizing(false);
    }
  };

  const sendAnswer = async () => {
    if (!humanAnswer.trim() || sending) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`/api/projects/${projectId}/sessions/${session.id}/answer`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: humanAnswer.trim() })
      });
    } catch (e) {
      setError('Erreur envoi : ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handleAddAgent = async (suggestion) => {
    setAddingAgent(suggestion.id);
    try {
      const { data: newAgent } = await api.post('/agents', {
        name: suggestion.name,
        role: suggestion.role,
        systemPrompt: suggestion.systemPrompt,
        emoji: suggestion.emoji
      });

      // Ajouter automatiquement au projet avec source 'suggestion'
      try {
        await api.post(`/projects/${projectId}/agents`, {
          agentId: newAgent.id,
          source: 'suggestion'
        });
        setToastMessage(`Agent "${newAgent.name}" ajouté au projet`);
        setTimeout(() => setToastMessage(''), 3000);
      } catch {}

      setPendingSuggestions(p => p.filter(s => s.id !== suggestion.id));
    } catch (e) {
      console.error('[addAgent]', e.message);
    } finally {
      setAddingAgent(null);
    }
  };

  const agentsDone = new Set(exchanges.filter(e => e.type === 'agent').map(e => e.agent));

  return (
    <div className="space-y-4">
      {/* ── Chips agents avec indicateur actif ───────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {session.agents.map((agent, i) => {
            const c = col(agent.name);
            const isActive = activeAgent?.name === agent.name;
            const isDone   = agentsDone.has(agent.name);
            return (
              <div
                key={i}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all duration-300 ${
                  isActive
                    ? `${c.bg} ${c.border} ring-2 ${c.ring}`
                    : isDone
                    ? 'bg-green-50 border-green-100'
                    : 'bg-gray-50 border-gray-100 opacity-50'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${
                  isDone ? 'bg-green-500' : c.dot
                } ${isActive ? 'animate-pulse' : ''}`}>
                  {isDone ? '✓' : agent.name[0]}
                </div>
                <span className={`text-xs font-semibold truncate flex-1 ${isActive ? c.text : isDone ? 'text-green-700' : 'text-gray-400'}`}>
                  {agent.name}
                </span>
                {isActive && (
                  <span className="flex gap-0.5 shrink-0">
                    {[0, 1, 2].map(d => (
                      <span key={d} className={`w-1.5 h-1.5 rounded-full ${c.dot}`}
                        style={{ animation: 'bounce 1s infinite', animationDelay: `${d * 150}ms` }} />
                    ))}
                  </span>
                )}
                {isDone && !isActive && (
                  <span className="text-green-400 text-xs shrink-0">✓</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Indicateur synthèse finale */}
        {isSummaryPhase && activeAgent?.name === 'Synthèse finale' && (
          <div className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-xl bg-violet-50 border border-violet-200 ring-2 ring-violet-300">
            <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center text-white text-xs font-bold animate-pulse">S</div>
            <span className="text-xs font-semibold text-violet-800 flex-1">Synthèse finale</span>
            <span className="flex gap-0.5">
              {[0,1,2].map(d => (
                <span key={d} className="w-1.5 h-1.5 rounded-full bg-violet-500"
                  style={{ animation: 'bounce 1s infinite', animationDelay: `${d*150}ms` }} />
              ))}
            </span>
          </div>
        )}

        {/* Toggle timeline live */}
        {liveTimeline.length > 0 && (
          <button
            onClick={() => setShowTimeline(p => !p)}
            className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 transition flex items-center justify-center gap-1.5 py-1"
          >
            <span>⏱</span>
            <span>{showTimeline ? 'Masquer la timeline' : 'Timeline en cours'}</span>
            <span className="text-gray-300">· {liveTimeline.length} étape{liveTimeline.length > 1 ? 's' : ''}</span>
          </button>
        )}

        {/* Timeline compacte live */}
        {showTimeline && <LiveTimeline entries={liveTimeline} />}
      </div>

      {/* ── Zone d'échanges ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 min-h-64">
        {isRealtime || isConversation ? (
          // Mode temps réel / conversation : bulles de chat
          <div className="space-y-4">
            {exchanges.map(ex => {
              if (ex.type === 'turn_separator') return (
                <div key={ex.id} className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium px-2">Tour {ex.turn} terminé</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              );
              if (ex.type === 'agent') return <AgentBubble key={ex.id} agentName={ex.agent} content={ex.content} />;
              return <HumanBubble key={ex.id} content={ex.content} />;
            })}
            {/* Bulle de streaming en cours */}
            {activeAgent && (streamingText || pendingQuestion === null) && (
              <AgentBubble
                agentName={isSummaryPhase ? 'Synthèse finale' : activeAgent.name}
                content={streamingText}
                streaming
              />
            )}
          </div>
        ) : (
          // Mode résumé : liste d'étapes compactes
          <SummarySteps
            exchanges={exchanges}
            activeAgent={activeAgent}
            isSummaryPhase={isSummaryPhase}
            pendingQuestion={pendingQuestion}
          />
        )}

        {/* Question agent — bloquante */}
        {pendingQuestion && (
          <div className={`${isRealtime ? 'mt-4' : ''}`}>
            <QuestionCard
              agent={pendingQuestion.agent}
              question={pendingQuestion.question}
              answer={humanAnswer}
              onChange={setHumanAnswer}
              onSend={sendAnswer}
              sending={sending}
            />
          </div>
        )}

        {/* Suggestions d'agents — non bloquantes */}
        {pendingSuggestions.length > 0 && (
          <div className={`${isRealtime ? 'mt-4' : ''} space-y-3`}>
            {pendingSuggestions.map(s => (
              <SuggestAgentCard
                key={s.id}
                suggestion={s}
                adding={addingAgent === s.id}
                onAdd={() => handleAddAgent(s)}
                onIgnore={() => setPendingSuggestions(p => p.filter(x => x.id !== s.id))}
              />
            ))}
          </div>
        )}

        {/* Intervention humaine — mode conversation, fin de tour */}
        {turnComplete && isConversation && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-emerald-200" />
              <span className="text-xs text-emerald-600 font-semibold px-2">Tour {currentTurn - 1} terminé</span>
              <div className="flex-1 h-px bg-emerald-200" />
            </div>

            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <p className="text-xs font-semibold text-emerald-700 mb-2">Ton intervention</p>
              <textarea
                value={humanInput}
                onChange={e => setHumanInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) continueConversation(); }}
                placeholder="Oriente la conversation, pose une question, fournis des précisions… (Ctrl+Entrée pour continuer)"
                rows={3}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-emerald-200 bg-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              />
              <button
                onClick={continueConversation}
                disabled={!humanInput.trim()}
                className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                Continuer la conversation →
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={closeConversation}
                disabled={closingSession || synthesizing}
                className="flex-1 text-sm text-gray-600 border border-gray-300 hover:bg-gray-50 py-2.5 rounded-xl transition disabled:opacity-50 font-medium"
              >
                {closingSession ? 'Fermeture…' : 'Terminer la conversation'}
              </button>
              <button
                onClick={generateSummary}
                disabled={synthesizing || closingSession}
                className="flex-1 text-sm bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
              >
                {synthesizing ? 'Synthèse en cours…' : 'Générer une synthèse'}
              </button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Toast de confirmation ────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg flex items-center gap-2">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
          </svg>
          {toastMessage}
        </div>
      )}

      {/* ── Erreur avec bouton relancer ───────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-red-700">⚠️ {error}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setError('');
                if (!isConversation) setExchanges([]);
                setActiveAgent(null);
                setStreamingText('');
                setPendingQuestion(null);
                run();
              }}
              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg transition font-medium"
            >
              Relancer
            </button>
            <button
              onClick={onRetry}
              className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg transition"
            >
              Revenir à la sélection d'équipe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
