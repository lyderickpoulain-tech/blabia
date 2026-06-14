import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import MeetingCloseModal from '../components/MeetingCloseModal';
import api from '../utils/api';

// ── Palette agent (initiale + couleur de bulle) ───────────────────────────────

const AGENT_COLORS = [
  { bg: 'bg-blue-100',   text: 'text-blue-800',   avatar: 'bg-blue-500'   },
  { bg: 'bg-purple-100', text: 'text-purple-800',  avatar: 'bg-purple-500' },
  { bg: 'bg-green-100',  text: 'text-green-800',   avatar: 'bg-green-500'  },
  { bg: 'bg-rose-100',   text: 'text-rose-800',    avatar: 'bg-rose-500'   },
  { bg: 'bg-amber-100',  text: 'text-amber-800',   avatar: 'bg-amber-500'  },
  { bg: 'bg-cyan-100',   text: 'text-cyan-800',    avatar: 'bg-cyan-500'   },
];

function agentColor(name, activeAgents) {
  const idx = activeAgents.findIndex(a => a.name === name);
  return AGENT_COLORS[(idx >= 0 ? idx : 0) % AGENT_COLORS.length];
}

// ── Statut badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  open:      { label: 'En cours',   cls: 'bg-blue-100 text-blue-700'   },
  accepted:  { label: 'Acceptée',   cls: 'bg-green-100 text-green-700'  },
  abandoned: { label: 'Abandonnée', cls: 'bg-gray-100 text-gray-500'    },
};

// ── Types de jalons ──────────────────────────────────────────────────────────

const MILESTONE_TYPES = [
  { id: 'meeting',    icon: '🤝', label: 'Réunion'     },
  { id: 'technical',  icon: '⚙️', label: 'Technique'   },
  { id: 'milestone',  icon: '🎯', label: 'Jalon'       },
  { id: 'stack_check',icon: '🔧', label: 'Stack check' },
  { id: 'synthesis',  icon: '📄', label: 'Synthèse'    },
  { id: 'claude_code',icon: '💻', label: 'Claude Code' },
];

// ── SuggestionAgentCard ───────────────────────────────────────────────────────

function SuggestionAgentCard({ suggestion, idx, onInvite, onDismiss, onCreateAndInvite }) {
  const [form, setForm] = useState(suggestion.createForm || { name: suggestion.name, role: suggestion.role, systemPrompt: '' });

  if (suggestion.invited) {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          ✅ {suggestion.name} a rejoint la réunion
        </span>
      </div>
    );
  }

  return (
    <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-amber-800">
            💡 {suggestion.reason || 'Suggestion d\'agent'}
          </p>
          <p className="text-sm font-medium text-gray-800 mt-0.5">
            {suggestion.name}
            {suggestion.role && <span className="text-xs text-gray-500 font-normal ml-1">— {suggestion.role}</span>}
          </p>
        </div>
        <button onClick={() => onDismiss(idx)} className="text-gray-300 hover:text-gray-500 text-xs shrink-0 mt-0.5">✕</button>
      </div>

      {suggestion.showCreate ? (
        <div className="space-y-1.5">
          <input
            type="text" placeholder="Nom" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <input
            type="text" placeholder="Rôle" value={form.role}
            onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white"
          />
          <textarea
            placeholder="Prompt système (optionnel)" value={form.systemPrompt}
            onChange={e => setForm(p => ({ ...p, systemPrompt: e.target.value }))}
            rows={2} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onCreateAndInvite(idx, form)}
              disabled={!form.name.trim() || suggestion.inviting}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
            >
              {suggestion.inviting ? 'Création…' : 'Créer et inviter'}
            </button>
            <button onClick={() => onDismiss(idx)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Annuler</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => onInvite(idx)}
            disabled={suggestion.inviting}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
          >
            {suggestion.inviting ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '+ Inviter'}
          </button>
          <button onClick={() => onDismiss(idx)} className="border border-amber-300 text-amber-700 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-amber-100">
            Ignorer
          </button>
        </div>
      )}
    </div>
  );
}

// ── SuggestionStepCard ────────────────────────────────────────────────────────

const POSITION_OPTIONS = [
  { id: 'end',    label: 'À la fin de la timeline' },
  { id: 'after',  label: 'Après l\'étape en cours' },
];

function SuggestionStepCard({ suggestion, idx, onAdd, onDismiss }) {
  const [form, setForm] = useState({
    title:    suggestion.title || '',
    type:     suggestion.type || 'meeting',
    position: 'end',
  });

  if (suggestion.added) {
    return (
      <div className="flex justify-center mx-4">
        <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1">
          ✅ Étape ajoutée à la timeline
        </span>
      </div>
    );
  }

  return (
    <div className="mx-4 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-blue-700">📅 Étape timeline suggérée</p>
        <button onClick={() => onDismiss(idx)} className="text-gray-300 hover:text-gray-500 text-xs shrink-0">✕</button>
      </div>

      {/* Titre éditable */}
      <input
        type="text"
        value={form.title}
        onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
        placeholder="Titre de l'étape"
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
      />

      {/* Sélecteur de type (6 boutons) */}
      <div className="grid grid-cols-3 gap-1">
        {MILESTONE_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setForm(p => ({ ...p, type: t.id }))}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition ${
              form.type === t.id
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            <span>{t.icon}</span>
            <span className="truncate">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Sélecteur de position */}
      <div className="flex gap-1.5">
        {POSITION_OPTIONS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => setForm(f => ({ ...f, position: p.id }))}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition ${
              form.position === p.id
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onAdd(idx, form)}
          disabled={!form.title.trim() || suggestion.adding}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {suggestion.adding
            ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : '+ Ajouter à la timeline'}
        </button>
        <button
          onClick={() => onDismiss(idx)}
          className="border border-blue-300 text-blue-700 text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-blue-100"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}

// ── ConversationFeed ──────────────────────────────────────────────────────────

function ConversationFeed({ messages, activeAgents, streamingAgent, streamingText, agentSuggestions, onInviteSuggested, onDismissSuggestion, onCreateAndInvite, stepSuggestions, onAddStep, onDismissStep, onPin, pinningMessageId }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, agentSuggestions, stepSuggestions]);

  if (messages.length === 0 && !streamingAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
        <span className="text-3xl">☕</span>
        <p>La réunion vient de commencer.</p>
        <p className="text-xs text-gray-300">Envoie ton premier message pour lancer les échanges.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {messages.map((msg) => {
        if (msg.role === 'system') {
          return (
            <div key={msg.id} className="flex justify-center">
              <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
                {msg.content}
              </span>
            </div>
          );
        }

        if (msg.role === 'human') {
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[75%]">
                <div className={`px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${
                  msg.pinned
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-blue-600 text-white'
                }`}>
                  {msg.content}
                </div>
                {msg.pinned && (
                  <p className="text-xs text-amber-600 text-right mt-1 flex items-center justify-end gap-1">
                    📌 Décision
                  </p>
                )}
              </div>
            </div>
          );
        }

        if (msg.role === 'agent') {
          const color = agentColor(msg.agentName, activeAgents);
          const agent = activeAgents.find(a => a.name === msg.agentName);
          const isDecision = msg.type === 'decision' || msg.pinned;

          return (
            <div key={msg.id} className="flex items-start gap-3 group">
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${color.avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
                {agent?.emoji || msg.agentName?.[0] || '?'}
              </div>
              <div className="max-w-[75%]">
                <p className={`text-xs font-semibold mb-1 ${color.text}`}>{msg.agentName}</p>
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
                  isDecision
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : `${color.bg} ${color.text}`
                }`}>
                  {msg.content}
                </div>
                {isDecision ? (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    📌 Décision
                  </p>
                ) : (
                  <button
                    onClick={() => onPin(msg.id)}
                    disabled={pinningMessageId === msg.id}
                    className="opacity-0 group-hover:opacity-100 mt-1 text-xs text-gray-400 hover:text-amber-500 transition flex items-center gap-1 disabled:opacity-40"
                  >
                    {pinningMessageId === msg.id
                      ? <span className="inline-block w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      : '📌 Épingler'}
                  </button>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}

      {/* Streaming en cours */}
      {streamingAgent && (
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full ${agentColor(streamingAgent, activeAgents).avatar} flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5`}>
            {activeAgents.find(a => a.name === streamingAgent)?.emoji || streamingAgent?.[0] || '?'}
          </div>
          <div className="max-w-[75%]">
            <p className={`text-xs font-semibold mb-1 ${agentColor(streamingAgent, activeAgents).text} flex items-center gap-1.5`}>
              {streamingAgent}
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${agentColor(streamingAgent, activeAgents).bg} ${agentColor(streamingAgent, activeAgents).text}`}>
              {streamingText || <span className="opacity-50">Rédaction…</span>}
            </div>
          </div>
        </div>
      )}

      {/* Cartes suggestion agent (non-bloquantes) */}
      {agentSuggestions?.filter(s => !s.dismissed).map((s, i) => (
        <SuggestionAgentCard
          key={i} suggestion={s} idx={i}
          onInvite={onInviteSuggested}
          onDismiss={onDismissSuggestion}
          onCreateAndInvite={onCreateAndInvite}
        />
      ))}

      {/* Cartes suggestion étape timeline (non-bloquantes) */}
      {stepSuggestions?.filter(s => !s.dismissed).map((s, i) => (
        <SuggestionStepCard
          key={i} suggestion={s} idx={i}
          onAdd={onAddStep}
          onDismiss={onDismissStep}
        />
      ))}

      <div ref={bottomRef} />
    </div>
  );
}

// ── MeetingRoom ───────────────────────────────────────────────────────────────

export default function MeetingRoom() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  const { refreshPanel } = useProjectPanel();

  const [session,      setSession]      = useState(null);
  const [messages,     setMessages]     = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');

  // États saisie
  const [inputText,  setInputText]  = useState('');
  const [sendError,  setSendError]  = useState('');

  // États streaming
  const [streamingAgent, setStreamingAgent] = useState(null);
  const [streamingText,  setStreamingText]  = useState('');
  const [isStreaming,    setIsStreaming]     = useState(false);

  // Ref pour capturer streamingText dans la closure SSE sans dépendance stale
  const streamingTextRef = useRef('');

  // ── États + ref pour le dropdown + Agent ─────────────────────────────────
  const dropdownRef                                 = useRef(null);
  const [showAgentDropdown,  setShowAgentDropdown]  = useState(false);
  const [availableForAdd,    setAvailableForAdd]    = useState([]);
  const [loadingAvailable,   setLoadingAvailable]   = useState(false);
  const [addingAgentId,      setAddingAgentId]      = useState(null);

  // États suggestions d'agent SSE
  const [agentSuggestions, setAgentSuggestions] = useState([]);

  // États épinglage + suggestions d'étape SSE
  const [pinningMessageId, setPinningMessageId] = useState(null);
  const [stepSuggestions,  setStepSuggestions]  = useState([]);

  // Modal de clôture
  const [showCloseModal, setShowCloseModal] = useState(false);

  const handleSessionClosed = useCallback((newStatus) => {
    setSession(prev => prev ? { ...prev, status: newStatus } : prev);
    setShowCloseModal(false);
    refreshPanel();
  }, [refreshPanel]);

  // Chargement des agents disponibles (non encore actifs) quand le dropdown s'ouvre
  const loadAvailableForAdd = useCallback(async (currentActive) => {
    setLoadingAvailable(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/agents`);
      const enabled    = data.filter(a => a.enabled !== false);
      const activeIds  = new Set((currentActive || activeAgents).map(a => a.id));
      setAvailableForAdd(enabled.filter(a => !activeIds.has(a.agentId || a.id)));
    } catch {}
    setLoadingAvailable(false);
  }, [projectId, activeAgents]);

  useEffect(() => {
    if (showAgentDropdown) loadAvailableForAdd();
  }, [showAgentDropdown]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fermeture du dropdown au clic extérieur
  useEffect(() => {
    if (!showAgentDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowAgentDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAgentDropdown]);

  // Ajouter un agent à la session (partagé par dropdown + suggestion cards)
  const handleAddAgent = useCallback(async (agentId) => {
    if (addingAgentId) return;
    setAddingAgentId(agentId);
    try {
      const { data } = await api.post(
        `/projects/${projectId}/sessions/${sessionId}/add-agent`,
        { agentId }
      );
      setActiveAgents(prev => [...prev, data.agent]);
      setMessages(prev => [...prev, {
        id:        `sys-${Date.now()}`,
        role:      'system',
        agentName: null,
        content:   `${data.agent.emoji || '🤖'} ${data.agent.name} a rejoint la réunion.`,
        timestamp: new Date().toISOString(),
        type:      'message',
        pinned:    false
      }]);
      setShowAgentDropdown(false);
      return data.agent;
    } catch {
      return null;
    } finally {
      setAddingAgentId(null);
    }
  }, [addingAgentId, projectId, sessionId]);

  // Inviter l'agent suggéré : cherche dans la lib par nom, sinon affiche formulaire
  const handleInviteSuggested = useCallback(async (idx) => {
    const s = agentSuggestions[idx];
    if (!s || s.inviting) return;
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: true } : x));
    try {
      const { data } = await api.get(`/projects/${projectId}/agents`);
      const match = data.find(a => a.name.toLowerCase() === s.name.toLowerCase() && a.enabled !== false);
      if (match) {
        await handleAddAgent(match.agentId || match.id);
        setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, invited: true, inviting: false } : x));
      } else {
        setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, showCreate: true, inviting: false } : x));
      }
    } catch {
      setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: false } : x));
    }
  }, [agentSuggestions, projectId, handleAddAgent]);

  const handleDismissSuggestion = useCallback((idx) => {
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, dismissed: true } : x));
  }, []);

  // Créer un nouvel agent depuis la carte de suggestion puis l'inviter
  const handleCreateAndInvite = useCallback(async (idx, form) => {
    const s = agentSuggestions[idx];
    if (!s || s.inviting) return;
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: true } : x));
    try {
      const { data: agent } = await api.post('/agents', {
        name:         form.name.trim(),
        role:         form.role.trim(),
        systemPrompt: form.systemPrompt.trim()
      });
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'suggestion' });
      await handleAddAgent(agent.id);
      setAgentSuggestions(prev => prev.map((x, i) =>
        i === idx ? { ...x, invited: true, inviting: false, showCreate: false } : x
      ));
    } catch {
      setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: false } : x));
    }
  }, [agentSuggestions, projectId, handleAddAgent]);

  // Épingler un message comme décision
  const handlePinMessage = useCallback(async (messageId) => {
    if (pinningMessageId) return;
    setPinningMessageId(messageId);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/pin-message`, {
        messageId,
        type: 'decision'
      });
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, pinned: true, type: 'decision' } : m
      ));
    } catch {}
    setPinningMessageId(null);
  }, [pinningMessageId, projectId, sessionId]);

  // Ajouter une étape timeline suggérée
  const handleAddStep = useCallback(async (idx, form) => {
    const s = stepSuggestions[idx];
    if (!s || s.adding) return;
    setStepSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, adding: true } : x));
    try {
      await api.post(`/projects/${projectId}/milestones`, {
        title: form.title.trim(),
        type:  form.type,
      });
      setStepSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, added: true, adding: false } : x));
      refreshPanel();
    } catch {
      setStepSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, adding: false } : x));
    }
  }, [stepSuggestions, projectId, refreshPanel]);

  const handleDismissStep = useCallback((idx) => {
    setStepSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, dismissed: true } : x));
  }, []);

  // Chargement initial de la session
  useEffect(() => {
    setLoading(true);
    api.get(`/projects/${projectId}/sessions/${sessionId}`)
      .then(({ data }) => {
        setSession(data);
        setMessages(Array.isArray(data.messages) ? data.messages : []);
        setActiveAgents(Array.isArray(data.activeAgents) ? data.activeAgents : []);
      })
      .catch(() => setLoadError('Session introuvable ou accès refusé.'))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  const isClosed = session?.status === 'accepted' || session?.status === 'abandoned';
  const badge    = STATUS_BADGE[session?.status] || STATUS_BADGE.open;

  // ── Envoi + streaming SSE ─────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming || isClosed) return;

    setSendError('');

    // Optimistic update : message humain affiché immédiatement
    const humanMsg = {
      id:        `temp-${Date.now()}`,
      role:      'human',
      agentName: null,
      content:   text,
      timestamp: new Date().toISOString(),
      type:      'message',
      pinned:    false
    };
    setMessages(prev => [...prev, humanMsg]);
    setInputText('');
    setIsStreaming(true);
    setStreamingAgent(null);
    streamingTextRef.current = '';
    setStreamingText('');

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(
        `/api/projects/${projectId}/sessions/${sessionId}/chat`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSendError(body.error || "Erreur lors de l'envoi");
        setIsStreaming(false);
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
          try {
            const ev = JSON.parse(line.slice(6));

            if (ev.type === 'agent_start') {
              setStreamingAgent(ev.agentName);
              streamingTextRef.current = '';
              setStreamingText('');

            } else if (ev.type === 'chunk') {
              streamingTextRef.current += ev.text;
              setStreamingText(streamingTextRef.current);

            } else if (ev.type === 'agent_done') {
              const finalContent = streamingTextRef.current;
              setMessages(prev => [...prev, {
                id:        ev.messageId,
                role:      'agent',
                agentName: ev.agentName,
                content:   finalContent,
                timestamp: new Date().toISOString(),
                type:      'message',
                pinned:    false
              }]);
              setStreamingAgent(null);
              streamingTextRef.current = '';
              setStreamingText('');

            } else if (ev.type === 'decision') {
              // Mise à jour du type du message (sous-étape 4)
              setMessages(prev => prev.map(m =>
                m.id === ev.messageId ? { ...m, type: 'decision' } : m
              ));

            } else if (ev.type === 'turn_complete') {
              setIsStreaming(false);

            } else if (ev.type === 'suggest_agent') {
              setAgentSuggestions(prev => [...prev, {
                name:       ev.name,
                role:       ev.role,
                reason:     ev.reason || 'Agent suggéré',
                dismissed:  false,
                invited:    false,
                inviting:   false,
                showCreate: false,
                createForm: { name: ev.name, role: ev.role, systemPrompt: '' }
              }]);

            } else if (ev.type === 'suggest_step') {
              setStepSuggestions(prev => [...prev, {
                title:     ev.title || '',
                type:      ev.milestoneType || 'meeting',
                dismissed: false,
                adding:    false,
                added:     false,
              }]);

            } else if (ev.type === 'error') {
              setSendError(ev.message || 'Erreur inconnue');
              setStreamingAgent(null);
              streamingTextRef.current = '';
              setStreamingText('');
              setIsStreaming(false);
            }
          } catch {}
        }
      }
    } catch (err) {
      setSendError('Connexion interrompue : ' + err.message);
      setStreamingAgent(null);
      streamingTextRef.current = '';
      setStreamingText('');
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, isClosed, projectId, sessionId]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
    // Entrée seule = nouvelle ligne (comportement textarea par défaut)
  }, [handleSend]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProjectLayout>
    );
  }

  if (loadError || !session) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
          <p className="text-sm">{loadError || 'Session introuvable.'}</p>
          <Link to={`/projects/${projectId}`} className="text-sm text-blue-600 hover:underline">
            ← Retour au projet
          </Link>
        </div>
      </ProjectLayout>
    );
  }

  return (
    <>
    <ProjectLayout projectId={projectId}>
      {/*
        Structure flex colonne qui remplit l'espace disponible dans le main
        (100vh - header ~53px - py-6 top/bottom ~48px)
      */}
      <div
        className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
        style={{ height: 'calc(100vh - 10rem)' }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 space-y-2">
          {/* Ligne 1 : retour + titre + statut */}
          <div className="flex items-center gap-3">
            <Link
              to={`/projects/${projectId}`}
              className="text-gray-400 hover:text-gray-600 transition text-sm shrink-0"
            >
              ←
            </Link>
            <p className="text-sm font-semibold text-gray-800 truncate flex-1" title={session.task}>
              🎯 {session.task}
            </p>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Ligne 2 : chips agents */}
          <div className="flex items-center gap-2 flex-wrap">
            {activeAgents.map((agent, i) => {
              const color = AGENT_COLORS[i % AGENT_COLORS.length];
              return (
                <span
                  key={agent.id || agent.name}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${color.bg} ${color.text}`}
                >
                  <span>{agent.emoji || '🤖'}</span>
                  {agent.name}
                </span>
              );
            })}
            {/* Dropdown + Agent */}
            {!isClosed && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowAgentDropdown(v => !v)}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition"
                >
                  + Agent
                </button>

                {showAgentDropdown && (
                  <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    {loadingAvailable ? (
                      <div className="flex justify-center py-4">
                        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : availableForAdd.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4 px-3">
                        Tous les agents du projet sont déjà dans la réunion.
                      </p>
                    ) : (
                      <ul className="py-1 max-h-48 overflow-y-auto">
                        {availableForAdd.map(a => {
                          const id = a.agentId || a.id;
                          return (
                            <li key={id}>
                              <button
                                onClick={() => handleAddAgent(id)}
                                disabled={addingAgentId === id}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left transition disabled:opacity-50"
                              >
                                <span className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-sm shrink-0">
                                  {a.emoji || a.name?.[0] || '?'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">{a.name}</p>
                                  <p className="text-xs text-gray-400 truncate">{a.role}</p>
                                </div>
                                {addingAgentId === id && (
                                  <span className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Fil de conversation ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <ConversationFeed
            messages={messages}
            activeAgents={activeAgents}
            streamingAgent={streamingAgent}
            streamingText={streamingText}
            agentSuggestions={agentSuggestions}
            onInviteSuggested={handleInviteSuggested}
            onDismissSuggestion={handleDismissSuggestion}
            onCreateAndInvite={handleCreateAndInvite}
            stepSuggestions={stepSuggestions}
            onAddStep={handleAddStep}
            onDismissStep={handleDismissStep}
            onPin={handlePinMessage}
            pinningMessageId={pinningMessageId}
          />
        </div>

        {/* ── Barre de saisie ─────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-gray-100 p-3 space-y-2">
          {isClosed ? (
            <div className="flex items-center justify-center py-2">
              <p className={`text-sm font-medium ${session.status === 'accepted' ? 'text-green-600' : 'text-gray-400'}`}>
                {session.status === 'accepted' ? '✅ Réunion acceptée' : '🚫 Réunion abandonnée'}
              </p>
            </div>
          ) : (
            <>
              {sendError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <span>⚠️</span> {sendError}
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming || isClosed}
                  placeholder={isStreaming ? '✍️ Les agents répondent…' : 'Tape ton message… (Ctrl+Entrée pour envoyer)'}
                  rows={2}
                  className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 transition disabled:bg-gray-50 disabled:text-gray-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!inputText.trim() || isStreaming || isClosed}
                  className="shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isStreaming
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : '▶'}
                </button>
              </div>
              {/* Bouton Clore la réunion */}
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={isStreaming}
                className="w-full text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 py-2 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🏁 Clore la réunion
              </button>
            </>
          )}
        </div>

      </div>
    </ProjectLayout>

    {/* Modal de clôture v3.0 */}
    {showCloseModal && session && (
      <MeetingCloseModal
        session={session}
        projectId={projectId}
        onClose={() => setShowCloseModal(false)}
        onClosed={handleSessionClosed}
      />
    )}
    </>
  );
}
