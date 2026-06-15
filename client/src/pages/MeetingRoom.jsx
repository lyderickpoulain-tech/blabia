import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import MeetingCloseModal from '../components/MeetingCloseModal';
import DecisionCard from '../components/DecisionCard';
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

const DELIVERABLE_TYPES = [
  { id: 'synthesis',      icon: '📝', label: 'Synthèse'    },
  { id: 'memory',         icon: '🧠', label: 'Souvenir'    },
  { id: 'claude_code',    icon: '💻', label: 'Claude Code' },
  { id: 'timeline_steps', icon: '📋', label: 'Étapes'      },
];

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

function ConversationFeed({ messages, activeAgents, streamingAgent, streamingText, agentSuggestions, onInviteSuggested, onDismissSuggestion, onCreateAndInvite, stepSuggestions, onAddStep, onDismissStep, session, project, onAutoLaunch, isClosed, pendingDecisionId, onAnswerDecision, onDeferDecision }) {

  if (messages.length === 0 && !streamingAgent) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-6 py-10">
        <div className="text-center">
          <span className="text-4xl">☕</span>
          <p className="mt-2 text-gray-500 text-sm font-medium">La réunion vient de commencer.</p>
        </div>

        {!isClosed && (
          <div className="w-full max-w-md flex flex-col gap-3">
            {/* Option 1 : lancement automatique */}
            <button
              onClick={onAutoLaunch}
              disabled={!session || !project}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🚀 Lancer automatiquement
            </button>
            <p className="text-xs text-gray-400 text-center -mt-1">
              Construit le message d'intro depuis l'objectif et le brief du projet.
            </p>

            {/* Séparateur */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">ou</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Option 2 : message manuel */}
            <p className="text-xs text-gray-400 text-center">
              Écris ton premier message ci-dessous pour lancer les échanges.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 py-4 px-4">
      {messages.map((msg) => {
        // Décision structurée v3.2
        if (msg.role === 'system' && msg.type === 'decision') {
          return (
            <DecisionCard
              key={msg.id}
              message={msg}
              onAnswer={onAnswerDecision}
              onDefer={onDeferDecision}
              disabled={!!pendingDecisionId && pendingDecisionId !== msg.id}
            />
          );
        }

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
          const hasAttachments = msg.attachments?.length > 0;
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[75%] space-y-1.5">
                {/* Pièces jointes */}
                {hasAttachments && (
                  <div className="flex gap-2 flex-wrap justify-end">
                    {msg.attachments.map((a, i) => (
                      a.isImage && a.dataUrl ? (
                        <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer" title={a.name}>
                          <img src={a.dataUrl} alt={a.name} className="w-20 h-20 rounded-xl object-cover border border-blue-200 hover:opacity-90 transition cursor-zoom-in" />
                        </a>
                      ) : (
                        <div key={i} className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs text-blue-800 max-w-[160px]">
                          <span>📄</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${
                  msg.pinned
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-blue-600 text-white'
                }`}>
                  {msg.content || <span className="opacity-60 italic">— fichier joint —</span>}
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
                {msg.interrupted ? (
                  <p className="text-xs text-orange-500 mt-1 flex items-center gap-1">
                    ⚠️ Interrompu
                  </p>
                ) : isDecision ? (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    📌 Décision
                  </p>
                ) : null}
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

    </div>
  );
}

// ── MeetingRoom ───────────────────────────────────────────────────────────────

export default function MeetingRoom() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  const { refreshPanel } = useProjectPanel();

  const [session,      setSession]      = useState(null);
  const [project,      setProject]      = useState(null);
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

  // Pièces jointes (max 3 par message)
  const [attachments, setAttachments] = useState([]);
  const [isDragging,  setIsDragging]  = useState(false);
  const fileInputRef    = useRef(null);
  const attachmentsRef  = useRef([]);
  attachmentsRef.current = attachments;

  // Ref pour capturer streamingText dans la closure SSE sans dépendance stale
  const streamingTextRef    = useRef('');
  const abortControllerRef  = useRef(null);

  // ── Scroll du feed ────────────────────────────────────────────────────────
  const feedRef            = useRef(null);
  const initialScrollDone  = useRef(false);
  const [showNewMessage,  setShowNewMessage]  = useState(false);
  const [showDecisions,   setShowDecisions]   = useState(false);

  // ── États + ref pour le dropdown + Agent ─────────────────────────────────
  const dropdownRef                                 = useRef(null);
  const [showAgentDropdown,  setShowAgentDropdown]  = useState(false);
  const [availableForAdd,    setAvailableForAdd]    = useState([]);
  const [loadingAvailable,   setLoadingAvailable]   = useState(false);
  const [addingAgentId,      setAddingAgentId]      = useState(null);
  const [dropdownCreateForm, setDropdownCreateForm] = useState({ open: false, name: '', role: '', creating: false, error: '' });

  // ── États édition inline objectif + livrable ──────────────────────────────
  const intentionDropdownRef                            = useRef(null);
  const [editingTask,           setEditingTask]           = useState(false);
  const [taskDraft,             setTaskDraft]             = useState('');
  const [savingTask,            setSavingTask]            = useState(false);
  const [showIntentionDropdown, setShowIntentionDropdown] = useState(false);
  const [savingIntention,       setSavingIntention]       = useState(false);

  // États suggestions d'agent SSE
  const [agentSuggestions,    setAgentSuggestions]    = useState([]);
  const agentSuggestionsRef = useRef([]);
  agentSuggestionsRef.current = agentSuggestions; // sync à chaque rendu pour éviter stale closures

  // États suggestions d'étape SSE
  const [stepSuggestions, setStepSuggestions] = useState([]);

  // ID de la décision en attente (bloque la saisie jusqu'à réponse/report)
  const [pendingDecisionId,       setPendingDecisionId]       = useState(null);
  const [panelExpandedDecisionId, setPanelExpandedDecisionId] = useState(null);
  const [decisionQueue,           setDecisionQueue]           = useState([]);
  const pendingDecisionIdRef = useRef(null);
  pendingDecisionIdRef.current = pendingDecisionId; // sync pour accès dans les callbacks SSE
  const handleSendRef = useRef(null); // ref pour éviter la TDZ (handleSend déclaré après)

  // Modal de clôture
  const [showCloseModal, setShowCloseModal] = useState(false);

  const handleSessionClosed = useCallback((newStatus) => {
    setSession(prev => prev ? { ...prev, status: newStatus } : prev);
    setShowCloseModal(false);
    refreshPanel();
  }, [refreshPanel]);

  // Scroll initial vers le bas dès que le chargement est terminé
  useEffect(() => {
    if (!loading && !initialScrollDone.current) {
      initialScrollDone.current = true;
      const feed = feedRef.current;
      if (feed) feed.scrollTop = feed.scrollHeight;
    }
  }, [loading]);

  // Scroll conditionnel à chaque nouveau contenu : uniquement si déjà en bas
  useEffect(() => {
    if (!initialScrollDone.current) return;
    const feed = feedRef.current;
    if (!feed) return;
    const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100;
    if (atBottom) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: isStreaming ? 'instant' : 'smooth' });
      setShowNewMessage(false);
    } else {
      setShowNewMessage(true);
    }
  }, [messages, streamingText, agentSuggestions, stepSuggestions, isStreaming]);

  // Masquer le bouton quand l'utilisateur scrolle jusqu'en bas manuellement
  const handleFeedScroll = useCallback(() => {
    const feed = feedRef.current;
    if (!feed) return;
    if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 100) {
      setShowNewMessage(false);
    }
  }, []);

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

  useEffect(() => {
    if (!showIntentionDropdown) return;
    const handler = (e) => {
      if (intentionDropdownRef.current && !intentionDropdownRef.current.contains(e.target)) {
        setShowIntentionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showIntentionDropdown]);

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

  // Créer un agent depuis le dropdown + Agent et l'ajouter à la réunion
  const handleDropdownCreateAgent = useCallback(async () => {
    const { name, role } = dropdownCreateForm;
    if (!name.trim() || !role.trim()) return;
    setDropdownCreateForm(p => ({ ...p, creating: true, error: '' }));
    try {
      console.log('[dropdownCreate] POST /agents', { name, role });
      const { data: agent } = await api.post('/agents', { name: name.trim(), role: role.trim() });
      console.log('[dropdownCreate] agent créé', agent.id, agent.name);
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'manual' });
      console.log('[dropdownCreate] agent lié au projet', projectId);
      await handleAddAgent(agent.id);
      setDropdownCreateForm({ open: false, name: '', role: '', creating: false, error: '' });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erreur';
      console.error('[dropdownCreate] erreur', msg);
      setDropdownCreateForm(p => ({ ...p, creating: false, error: msg }));
    }
  }, [dropdownCreateForm, projectId, handleAddAgent]);

  // Inviter l'agent suggéré : cherche dans la lib par nom, sinon affiche formulaire
  const handleInviteSuggested = useCallback(async (idx) => {
    const s = agentSuggestionsRef.current[idx];
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
  }, [projectId, handleAddAgent]);

  const handleDismissSuggestion = useCallback((idx) => {
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, dismissed: true } : x));
  }, []);

  // Créer un nouvel agent depuis la carte de suggestion puis l'inviter
  const handleCreateAndInvite = useCallback(async (idx, form) => {
    const s = agentSuggestionsRef.current[idx];
    if (!s || s.inviting) return;
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: true } : x));
    try {
      console.log('[handleCreateAndInvite] POST /agents', { name: form.name, role: form.role });
      const { data: agent } = await api.post('/agents', {
        name:         form.name.trim(),
        role:         form.role.trim(),
        systemPrompt: form.systemPrompt.trim()
      });
      console.log('[handleCreateAndInvite] agent créé', agent.id, agent.name);
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: 'suggestion' });
      console.log('[handleCreateAndInvite] agent lié au projet', projectId);
      await handleAddAgent(agent.id);
      setAgentSuggestions(prev => prev.map((x, i) =>
        i === idx ? { ...x, invited: true, inviting: false, showCreate: false } : x
      ));
    } catch (err) {
      console.error('[handleCreateAndInvite] erreur', err.response?.data?.error || err.message);
      setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: false } : x));
    }
  }, [projectId, handleAddAgent]);

  // Répondre à une décision
  const handleAnswerDecision = useCallback(async (messageId, answer) => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/sessions/${sessionId}/answer-decision`,
        { messageId, answer, status: 'answered' }
      );
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, ...data.message } : m);
        // Ajouter le message système decision_answer retourné par le serveur
        return data.systemMessage ? [...updated, data.systemMessage] : updated;
      });
    } catch {
      // Fallback local si l'API échoue
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, status: 'answered', answer, answeredAt: new Date().toISOString() }
          : m
      ));
    }
    setPendingDecisionId(null);
    // Dépiler la prochaine décision ou relancer les agents si queue vide
    let queueEmpty = false;
    setDecisionQueue(prev => {
      if (prev.length > 0) {
        setPendingDecisionId(prev[0].messageId);
        return prev.slice(1);
      }
      queueEmpty = true;
      return prev;
    });
    if (queueEmpty) {
      // Relancer le tour des agents via ref (handleSend déclaré après → évite TDZ)
      handleSendRef.current?.('', { resume: true });
    }
  }, [projectId, sessionId]);

  // Reporter une décision
  const handleDeferDecision = useCallback(async (messageId) => {
    try {
      await api.post(
        `/projects/${projectId}/sessions/${sessionId}/answer-decision`,
        { messageId, answer: null, status: 'deferred' }
      );
    } catch {}
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, status: 'deferred' } : m
    ));
    setPendingDecisionId(null);
    // Dépiler la prochaine décision en attente si elle existe
    setDecisionQueue(prev => {
      if (prev.length > 0) {
        setPendingDecisionId(prev[0].messageId);
        return prev.slice(1);
      }
      return prev;
    });
  }, [projectId, sessionId]);

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

  // Chargement initial : session + projet en parallèle
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/projects/${projectId}/sessions/${sessionId}`),
      api.get(`/projects/${projectId}`),
    ])
      .then(([{ data: sessionData }, { data: projectData }]) => {
        setSession(sessionData);
        setProject(projectData);
        setMessages(Array.isArray(sessionData.messages) ? sessionData.messages : []);
        setActiveAgents(Array.isArray(sessionData.activeAgents) ? sessionData.activeAgents : []);
      })
      .catch(() => setLoadError('Réunion introuvable ou accès refusé.'))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  const isClosed       = session?.status === 'accepted' || session?.status === 'abandoned';
  const badge          = STATUS_BADGE[session?.status] || STATUS_BADGE.open;
  const decisions            = messages.filter(m => m.type === 'decision');
  const pendingDecisionCount = decisions.filter(m => m.status === 'pending' || m.status === 'deferred').length;
  const pendingDecisions     = decisions.filter(m => m.status === 'pending' || m.status === 'deferred');
  const answeredDecisions    = decisions.filter(m => m.status === 'answered');

  const currentIntention = (() => {
    const i = session?.intention;
    if (Array.isArray(i) && i.length > 0) return i[0];
    try { const p = JSON.parse(i || '[]'); return Array.isArray(p) && p.length > 0 ? p[0] : 'synthesis'; }
    catch { return 'synthesis'; }
  })();
  const intentionMeta = DELIVERABLE_TYPES.find(d => d.id === currentIntention) || DELIVERABLE_TYPES[0];

  // ── Envoi + streaming SSE ─────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText, { resume = false } = {}) => {
    const text              = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    const currentAttachments = attachmentsRef.current;
    // resume:true = reprise silencieuse après décision, bypass guards normaux
    if (isStreaming || isClosed) return;
    if (!resume && (!text && currentAttachments.length === 0)) return;
    if (!resume && pendingDecisionId) return;

    setSendError('');

    // Optimistic update : message humain visible seulement si ce n'est pas un resume
    if (!resume) {
      const humanMsg = {
        id:          `temp-${Date.now()}`,
        role:        'human',
        agentName:   null,
        content:     text,
        timestamp:   new Date().toISOString(),
        type:        'message',
        pinned:      false,
        attachments: currentAttachments.length > 0
          ? currentAttachments.map(a => ({ name: a.name, type: a.type, isImage: a.isImage, dataUrl: a.isImage ? a.dataUrl : null }))
          : undefined,
      };
      setMessages(prev => [...prev, humanMsg]);
      if (typeof overrideText !== 'string') setInputText('');
      setAttachments([]);
    }
    setIsStreaming(true);
    setStreamingAgent(null);
    streamingTextRef.current = '';
    setStreamingText('');

    // Sérialiser les pièces jointes (seulement si pas un resume)
    const serializedAttachments = (!resume && currentAttachments.length > 0)
      ? currentAttachments.map(a =>
          a.isImage
            ? { name: a.name, type: a.type, isImage: true,  base64: a.base64, mediaType: a.type }
            : { name: a.name, type: a.type, isImage: false, text: a.text }
        )
      : [];

    const token = localStorage.getItem('token');
    const ac = new AbortController();
    abortControllerRef.current = ac;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/sessions/${sessionId}/chat`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message:     text,
            attachments: serializedAttachments.length > 0 ? serializedAttachments : undefined,
            ...(resume ? { resume: true } : {}),
          }),
          signal: ac.signal,
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
              // Nouveau format v3.2 : décision structurée avec question + choix
              setMessages(prev => [...prev, {
                id:        ev.messageId,
                role:      'system',
                type:      'decision',
                question:  ev.question  || '',
                choices:   ev.choices   || [],
                context:   ev.context   || '',
                status:    'pending',
                answer:    null,
                agentName: ev.agentName || '',
                timestamp: new Date().toISOString(),
              }]);
              // Interrompre les agents encore en streaming
              abortControllerRef.current?.abort();
              // File d'attente si une autre décision est déjà ouverte
              if (pendingDecisionIdRef.current) {
                setDecisionQueue(prev => [...prev, {
                  messageId: ev.messageId, question: ev.question || '',
                  choices: ev.choices || [], context: ev.context || '', agentName: ev.agentName || '',
                }]);
              } else {
                setPendingDecisionId(ev.messageId);
              }

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
      if (err.name === 'AbortError') {
        // Interruption volontaire : sauvegarder le texte partiel localement
        const partialText    = streamingTextRef.current;
        const partialAgent   = streamingAgent;
        setStreamingAgent(null);
        streamingTextRef.current = '';
        setStreamingText('');
        setIsStreaming(false);
        setPendingDecisionId(null);
        if (partialText.trim() && partialAgent) {
          setMessages(prev => [...prev, {
            id:          `interrupted-${Date.now()}`,
            role:        'agent',
            agentName:   partialAgent,
            content:     partialText.trim(),
            timestamp:   new Date().toISOString(),
            type:        'message',
            pinned:      false,
            interrupted: true,
          }]);
        }
        return;
      }
      setSendError('Connexion interrompue : ' + err.message);
      setStreamingAgent(null);
      streamingTextRef.current = '';
      setStreamingText('');
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, isClosed, streamingAgent, pendingDecisionId, projectId, sessionId]);
  handleSendRef.current = handleSend; // toujours à jour après chaque render

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
    // Entrée seule = nouvelle ligne (comportement textarea par défaut)
  }, [handleSend]);

  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleAutoLaunch = useCallback(async () => {
    const task = session?.task?.trim() ?? '';
    try {
      const { data } = await api.get(`/projects/${projectId}/meeting-context`);
      const parts = [];
      if (data.brief)   parts.push(`Brief du projet :\n${data.brief}`);
      if (data.context) parts.push(`Contexte projet :\n${data.context}`);
      if (data.pastCodePrompts?.length > 0) {
        const prompts = data.pastCodePrompts
          .map((p, i) => `Réunion précédente ${i + 1} — ${p.task} :\n${p.summary}`)
          .join('\n\n');
        parts.push(`Prompts Claude Code des dernières réunions :\n${prompts}`);
      }
      parts.push(`Objectif de cette réunion : ${task}`);
      parts.push('Lance la réunion et présente les points à traiter.');
      handleSend(parts.join('\n\n'));
    } catch {
      const brief = project?.brief?.trim() ?? '';
      handleSend([
        `Voici le contexte du projet :\n${brief}`,
        `Objectif de cette réunion : ${task}`,
        'Lance la réunion et présente les points à traiter.',
      ].join('\n\n'));
    }
  }, [projectId, project, session, handleSend]);

  const processFiles = useCallback((fileList) => {
    const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const MAX = 3;
    const remaining = MAX - attachmentsRef.current.length;
    if (remaining <= 0) return;

    const files = Array.from(fileList)
      .filter(f => ACCEPTED_IMAGE_TYPES.includes(f.type) || f.type.startsWith('text/') || f.type === 'application/json')
      .slice(0, remaining);

    const promises = files.map(file => new Promise(resolve => {
      const reader  = new FileReader();
      const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
      reader.onload  = e => {
        if (isImage) {
          const dataUrl = e.target.result;
          resolve({ name: file.name, type: file.type, size: file.size, isImage: true, dataUrl, base64: dataUrl.split(',')[1] });
        } else {
          resolve({ name: file.name, type: file.type, size: file.size, isImage: false, text: e.target.result });
        }
      };
      reader.onerror = () => resolve({ name: file.name, error: true });
      if (isImage) reader.readAsDataURL(file);
      else         reader.readAsText(file);
    }));

    Promise.all(promises).then(results => {
      const failed = results.filter(r => r?.error);
      if (failed.length > 0) setSendError(`Impossible de lire : ${failed.map(f => f.name).join(', ')}`);
      setAttachments(prev => [...prev, ...results.filter(r => r && !r.error)].slice(0, MAX));
    }).catch(() => setSendError('Erreur lors de la lecture des fichiers'));
  }, []);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true);  }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleSaveTask = useCallback(async () => {
    if (!taskDraft.trim() || savingTask) return;
    setSavingTask(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${sessionId}`, { task: taskDraft.trim() });
      setSession(prev => ({ ...prev, task: taskDraft.trim() }));
      setEditingTask(false);
    } catch {}
    setSavingTask(false);
  }, [taskDraft, savingTask, projectId, sessionId]);

  const handleSaveIntention = useCallback(async (newType) => {
    if (savingIntention) return;
    setSavingIntention(true);
    setShowIntentionDropdown(false);
    try {
      await api.patch(`/projects/${projectId}/sessions/${sessionId}`, { intention: [newType] });
      setSession(prev => ({ ...prev, intention: [newType] }));
    } catch {}
    setSavingIntention(false);
  }, [savingIntention, projectId, sessionId]);

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
          <p className="text-sm">{loadError || 'Réunion introuvable.'}</p>
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
      <div className="flex gap-3" style={{ height: 'calc(100vh - 10rem)' }}>

        {/* ── Panneau Décisions ────────────────────────────────────────── */}
        {showDecisions && (
          <div className="w-[280px] shrink-0 flex flex-col bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                📌 Décisions ({decisions.length})
              </h2>
              <button
                onClick={() => setShowDecisions(false)}
                className="text-gray-400 hover:text-gray-600 text-lg w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {decisions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center mt-6">Aucune décision formelle dans cette réunion.</p>
              ) : (
                <>
                  {/* ⏸ À traiter */}
                  {pendingDecisions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide px-1">
                        ⏸ À traiter ({pendingDecisions.length})
                      </p>
                      {pendingDecisions.map(d => (
                        <div key={d.id} className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                          {panelExpandedDecisionId === d.id ? (
                            <DecisionCard
                              message={d}
                              onAnswer={async (id, ans) => {
                                await handleAnswerDecision(id, ans);
                                setPanelExpandedDecisionId(null);
                              }}
                              onDefer={async (id) => {
                                await handleDeferDecision(id);
                                setPanelExpandedDecisionId(null);
                              }}
                            />
                          ) : (
                            <>
                              {d.agentName && (
                                <p className="text-[10px] text-orange-600 font-semibold">{d.agentName}</p>
                              )}
                              <p className="text-xs text-orange-900 leading-snug">{d.question}</p>
                              {!isClosed && (
                                <button
                                  onClick={() => {
                                    setPanelExpandedDecisionId(d.id);
                                    setPendingDecisionId(d.id);
                                  }}
                                  className="text-xs text-orange-700 font-semibold hover:underline"
                                >
                                  Répondre maintenant →
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ✅ Actées */}
                  {answeredDecisions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide px-1">
                        ✅ Actées ({answeredDecisions.length})
                      </p>
                      {answeredDecisions.map(d => (
                        <div key={d.id} className="bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
                          {d.agentName && (
                            <p className="text-[10px] text-green-700 font-semibold">{d.agentName}</p>
                          )}
                          <p className="text-xs text-gray-600 italic leading-snug">{d.question}</p>
                          <p className="text-xs font-semibold text-green-700">→ {d.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Chat principal ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-w-0">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-100 px-4 py-3 space-y-2">
          {/* Ligne 1 : retour + titre éditable + badges */}
          <div className="flex items-center gap-2">
            <Link
              to={`/projects/${projectId}`}
              className="text-gray-400 hover:text-gray-600 transition text-sm shrink-0"
            >
              ←
            </Link>

            {/* Titre / objectif — éditable si réunion ouverte */}
            {editingTask ? (
              <input
                autoFocus
                value={taskDraft}
                onChange={e => setTaskDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); handleSaveTask(); }
                  if (e.key === 'Escape') setEditingTask(false);
                }}
                disabled={savingTask}
                className="flex-1 text-sm font-semibold text-gray-800 bg-gray-50 border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-400 min-w-0"
              />
            ) : (
              <p
                className={`text-sm font-semibold text-gray-800 truncate flex-1 min-w-0 ${!isClosed ? 'cursor-pointer hover:text-blue-600 transition' : ''}`}
                title={isClosed ? session.task : `${session.task} — cliquer pour modifier`}
                onClick={() => { if (!isClosed) { setTaskDraft(session.task); setEditingTask(true); } }}
              >
                🎯 {session.task}
              </p>
            )}

            {/* Badge livrable — dropdown si réunion ouverte */}
            <div className="relative shrink-0" ref={intentionDropdownRef}>
              <button
                onClick={() => { if (!isClosed) setShowIntentionDropdown(v => !v); }}
                disabled={savingIntention}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                  isClosed
                    ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-default'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100 cursor-pointer'
                }`}
              >
                {intentionMeta.icon} {intentionMeta.label}
              </button>
              {showIntentionDropdown && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                  {DELIVERABLE_TYPES.map(d => (
                    <button
                      key={d.id}
                      onClick={() => handleSaveIntention(d.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition ${d.id === currentIntention ? 'font-semibold text-blue-600' : 'text-gray-700'}`}
                    >
                      <span>{d.icon}</span>
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Badge 📌 Décisions */}
            <button
              onClick={() => setShowDecisions(v => !v)}
              className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border transition flex items-center gap-1.5 ${
                showDecisions
                  ? 'bg-amber-200 border-amber-300 text-amber-800'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
            >
              📌 {decisions.length > 0 ? `(${decisions.length})` : ''}
              {pendingDecisionCount > 0 && (
                <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-semibold leading-none">
                  ⏸ {pendingDecisionCount}
                </span>
              )}
            </button>

            {/* Badge statut */}
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
                      <>
                        <ul className="py-1 max-h-40 overflow-y-auto">
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
                        {/* Formulaire création inline */}
                        <div className="border-t border-gray-100">
                          {dropdownCreateForm.open ? (
                            <div className="p-2 space-y-1.5">
                              <input
                                autoFocus
                                type="text" placeholder="Nom de l'agent"
                                value={dropdownCreateForm.name}
                                onChange={e => setDropdownCreateForm(p => ({ ...p, name: e.target.value }))}
                                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                              />
                              <input
                                type="text" placeholder="Rôle"
                                value={dropdownCreateForm.role}
                                onChange={e => setDropdownCreateForm(p => ({ ...p, role: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') handleDropdownCreateAgent(); }}
                                className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
                              />
                              {dropdownCreateForm.error && (
                                <p className="text-[10px] text-red-500">{dropdownCreateForm.error}</p>
                              )}
                              <div className="flex gap-1.5">
                                <button
                                  onClick={handleDropdownCreateAgent}
                                  disabled={!dropdownCreateForm.name.trim() || !dropdownCreateForm.role.trim() || dropdownCreateForm.creating}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
                                >
                                  {dropdownCreateForm.creating ? '…' : 'Créer et inviter'}
                                </button>
                                <button
                                  onClick={() => setDropdownCreateForm({ open: false, name: '', role: '', creating: false, error: '' })}
                                  className="text-xs text-gray-400 hover:text-gray-600 px-2"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDropdownCreateForm(p => ({ ...p, open: true }))}
                              className="w-full text-xs text-gray-400 hover:text-blue-600 hover:bg-gray-50 py-2 px-3 text-left transition"
                            >
                              + Créer un agent…
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Fil de conversation ─────────────────────────────────────────── */}
        <div ref={feedRef} className="flex-1 overflow-y-auto" onScroll={handleFeedScroll}>
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
            session={session}
            project={project}
            onAutoLaunch={handleAutoLaunch}
            isClosed={isClosed}
            pendingDecisionId={pendingDecisionId}
            onAnswerDecision={handleAnswerDecision}
            onDeferDecision={handleDeferDecision}
          />
        </div>

        {/* ── Bouton "Nouveau message" flottant ───────────────────────────── */}
        {showNewMessage && (
          <div className="shrink-0 flex justify-center py-1.5">
            <button
              onClick={() => {
                feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
                setShowNewMessage(false);
              }}
              className="text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 shadow-md px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5"
            >
              ⬇ Nouveau message
            </button>
          </div>
        )}

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
              {/* Input fichier caché */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,text/*,application/json"
                className="hidden"
                onChange={e => { processFiles(e.target.files); e.target.value = ''; }}
              />

              {/* Bande de prévisualisation */}
              {attachments.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {attachments.map((a, i) => (
                    <div key={i} className="relative group">
                      {a.isImage ? (
                        <img src={a.dataUrl} alt={a.name} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      ) : (
                        <div className="flex items-center gap-1.5 bg-gray-100 border border-gray-200 rounded-lg px-2.5 py-2 text-xs text-gray-700 max-w-[140px]">
                          <span>📄</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-600 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Zone drag + saisie */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex items-end gap-2 rounded-xl transition-colors ${isDragging ? 'ring-2 ring-blue-400 bg-blue-50 p-1' : ''}`}
              >
                {/* Bouton 📎 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || !!pendingDecisionId || attachments.length >= 3}
                  title={attachments.length >= 3 ? 'Maximum 3 fichiers atteint' : 'Joindre une image ou un fichier texte'}
                  className="shrink-0 w-9 h-9 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  📎
                </button>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming || !!pendingDecisionId}
                  placeholder={
                    isStreaming         ? '✍️ Les agents répondent…'
                    : pendingDecisionId ? '🤔 Répondez à la décision ci-dessus pour continuer…'
                    : 'Tape ton message… (Ctrl+Entrée pour envoyer)'
                  }
                  rows={2}
                  className="flex-1 resize-none px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-400 transition disabled:bg-gray-50 disabled:text-gray-400"
                />
                {isStreaming ? (
                  <button
                    onClick={handleAbort}
                    className="shrink-0 px-3 h-10 bg-red-500 hover:bg-red-600 rounded-xl flex items-center justify-center text-white text-sm font-medium transition gap-1.5"
                  >
                    ⏹ Interrompre
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!inputText.trim() && attachments.length === 0) || !!pendingDecisionId}
                    className="shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-700 rounded-xl flex items-center justify-center text-white transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ▶
                  </button>
                )}
              </div>
              {/* Bouton Clore la réunion */}
              <button
                onClick={() => setShowCloseModal(true)}
                disabled={isStreaming || !!pendingDecisionId}
                className="w-full text-xs text-gray-500 hover:text-red-600 hover:bg-red-50 border border-gray-200 hover:border-red-200 py-2 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🏁 Clore la réunion
              </button>
            </>
          )}
        </div>

        </div>
        {/* ── fin chat principal ──────────────────────────────────────── */}

      </div>
      {/* ── fin wrapper flex ────────────────────────────────────────────── */}
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
