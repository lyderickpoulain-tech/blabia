import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ProjectLayout, { useProjectPanel } from '../components/ProjectLayout';
import MeetingCloseModal from '../components/MeetingCloseModal';
import DecisionCard from '../components/DecisionCard';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import ExportModal from '../components/ExportModal';
import TimelineStepsModal from '../components/TimelineStepsModal';
import MeetingHeader from '../components/meeting/MeetingHeader';
import MeetingInputBar from '../components/meeting/MeetingInputBar';
import { MeetingDecisionPanel, MeetingSuggestCloseBanner } from '../components/meeting/MeetingDecisionFlow';
import AgentScopeSelector from '../components/meeting/AgentScopeSelector';
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
  open:      { label: 'En cours',   cls: 'bg-blue-100 text-blabia-blue'   },
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
  const [form,  setForm]  = useState(suggestion.createForm || { name: suggestion.name, role: suggestion.role, systemPrompt: '' });
  const [scope, setScope] = useState('project');

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
          <AgentScopeSelector scope={scope} onChange={setScope} size="xs" />
          <div className="flex gap-2">
            <button
              onClick={() => onCreateAndInvite(idx, form, scope)}
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
        <p className="text-xs font-semibold text-blabia-blue">📅 Étape timeline suggérée</p>
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
                ? 'bg-blabia-blue text-white'
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
                ? 'bg-blabia-blue text-white border-blabia-blue'
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
          className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {suggestion.adding
            ? <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : '+ Ajouter à la timeline'}
        </button>
        <button
          onClick={() => onDismiss(idx)}
          className="border border-blue-300 text-blabia-blue text-xs font-medium py-1.5 px-3 rounded-lg hover:bg-blue-100"
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}

// ── ConversationFeed ──────────────────────────────────────────────────────────

function ConversationFeed({ messages, activeAgents, streamingAgent, streamingText, streamingReason, agentSuggestions, onInviteSuggested, onDismissSuggestion, onCreateAndInvite, stepSuggestions, onAddStep, onDismissStep, session, project, onAutoLaunch, isClosed, pendingDecisionId, onAnswerDecision, onDeferDecision, onDelegateDecision }) {

  if (messages.length === 0 && !streamingAgent) {
    const intentionKey0 = Array.isArray(session?.intention) ? session.intention[0]
      : (() => { try { const p = JSON.parse(session?.intention || '[]'); return p[0] || 'synthesis'; } catch { return 'synthesis'; } })();
    const intentionMeta0 = DELIVERABLE_TYPES.find(d => d.id === intentionKey0) || DELIVERABLE_TYPES[0];
    const modelLabel = session?.model?.includes('opus') ? 'Claude Opus'
      : session?.model?.includes('haiku') ? 'Claude Haiku'
      : 'Claude Sonnet';

    return (
      <div className="flex flex-col items-center justify-center h-full px-6 py-8">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">🎙 Réunion prête à démarrer</h3>

          <div className="space-y-2.5">
            <div className="flex items-start gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0 pt-0.5">Objectif</span>
              <span className="text-xs text-gray-700 font-medium leading-snug">{session?.task}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">Livrable</span>
              <span className="text-xs text-gray-700">{intentionMeta0.icon} {intentionMeta0.label}</span>
            </div>
            {activeAgents.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-400 w-16 shrink-0 pt-0.5">Agents</span>
                <div className="flex flex-wrap gap-1">
                  {activeAgents.map(a => (
                    <span key={a.id} className="text-xs bg-blabia-blue-light text-blabia-blue px-2 py-0.5 rounded-full font-medium">{a.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">Modèle</span>
              <span className="text-xs text-gray-700">{modelLabel}</span>
            </div>
          </div>

          {!isClosed && (
            <div className="space-y-2 pt-1">
              <button
                onClick={onAutoLaunch}
                disabled={!session || !project}
                className="w-full flex items-center justify-center gap-2 bg-blabia-blue hover:bg-blabia-blue-dark text-white font-semibold py-3 px-4 rounded-xl transition text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🎙 Lancer automatiquement
              </button>
              <p className="text-xs text-gray-400 text-center">— ou tape ton premier message —</p>
            </div>
          )}
        </div>
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
              onDelegate={onDelegateDecision}
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
                    {msg.attachments.map((a, i) => {
                      const fileIcon = a.isPdf ? '📕'
                        : a.isImage ? '🖼️'
                        : (a.name?.toLowerCase().endsWith('.docx')) ? '📘'
                        : (a.name?.toLowerCase().endsWith('.xlsx') || a.name?.toLowerCase().endsWith('.csv')) ? '📗'
                        : '📄';
                      return a.isImage && a.dataUrl ? (
                        <a key={i} href={a.dataUrl} target="_blank" rel="noopener noreferrer" title={a.name}>
                          <img src={a.dataUrl} alt={a.name} className="w-20 h-20 rounded-xl object-cover border border-blue-200 hover:opacity-90 transition cursor-zoom-in" />
                        </a>
                      ) : (
                        <div key={i} className="flex items-center gap-1.5 bg-blue-100 border border-blue-200 rounded-lg px-2.5 py-1.5 text-xs text-blue-800 max-w-[160px]">
                          <span>{fileIcon}</span>
                          <span className="truncate">{a.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed ${
                  msg.pinned
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : 'bg-blabia-blue text-white'
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
                <p className={`text-xs font-semibold ${msg.reason ? 'mb-0.5' : 'mb-1'} ${color.text}`}>{msg.agentName}</p>
                {msg.reason && (
                  <p className={`text-xs italic mb-1 ${/vulgarise|reformule/i.test(msg.reason) ? 'text-blue-400' : 'text-gray-400'}`}>↳ {msg.reason}</p>
                )}
                <div className={`px-4 py-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed whitespace-pre-wrap ${
                  isDecision
                    ? 'bg-amber-50 border border-amber-200 text-amber-900'
                    : `${color.bg} ${color.text}`
                }`}>
                  {msg.content}
                </div>
                {msg.sources?.length > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    {msg.sources.map((s, i) => (
                      <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate">
                        🌐 <span className="truncate">{s.title || s.url}</span>
                      </a>
                    ))}
                  </div>
                )}
                {msg.interrupted ? (
                  <p className="text-xs text-blabia-orange mt-1 flex items-center gap-1">
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
            <p className={`text-xs font-semibold ${streamingReason ? 'mb-0.5' : 'mb-1'} ${agentColor(streamingAgent, activeAgents).text} flex items-center gap-1.5`}>
              {streamingAgent}
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </p>
            {streamingReason && (
              <p className="text-xs italic text-gray-400 mb-1">↳ {streamingReason}</p>
            )}
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
  const [inputText,          setInputText]          = useState('');
  const [mentionSuggestions,  setMentionSuggestions]  = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSelectedIdx,  setMentionSelectedIdx]  = useState(0);
  const [sendError,  setSendError]  = useState('');

  // États streaming
  const [streamingAgent,  setStreamingAgent]  = useState(null);
  const [streamingText,   setStreamingText]   = useState('');
  const [streamingReason, setStreamingReason] = useState('');
  const [isStreaming,     setIsStreaming]      = useState(false);

  // Pièces jointes (max 3 par message)
  const [attachments, setAttachments] = useState([]);
  const [isDragging,  setIsDragging]  = useState(false);
  const fileInputRef    = useRef(null);
  const attachmentsRef  = useRef([]);
  attachmentsRef.current = attachments;

  // Refs pour capturer text et reason dans la closure SSE sans dépendance stale
  const streamingTextRef    = useRef('');
  const streamingReasonRef  = useRef('');
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
  const [dropdownCreateForm, setDropdownCreateForm] = useState({ open: false, name: '', role: '', creating: false, error: '', scope: 'project' });

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
  const pendingDecisionIdRef       = useRef(null);
  pendingDecisionIdRef.current     = pendingDecisionId; // sync pour accès dans les callbacks SSE
  const handleSendRef              = useRef(null);  // évite TDZ (handleSend déclaré après)
  const decisionQueueRef           = useRef([]);    // accès synchrone sans closure stale
  decisionQueueRef.current         = decisionQueue;
  const decisionJustEmittedRef     = useRef(false); // empêche AbortError d'effacer pendingDecisionId

  // Modal de clôture
  const [showCloseModal,  setShowCloseModal]  = useState(false);
  // Modal livrable (section isClosed)
  const [showDeliverable, setShowDeliverable] = useState(false);
  // Bannière suggest_close émise par l'orchestrateur
  const [suggestClose,    setSuggestClose]    = useState(null); // { reason: string } | null
  // Menu ⋮ + modale réinitialisation réunion
  const [showMenuDots,       setShowMenuDots]       = useState(false);
  const [showResetModal,     setShowResetModal]     = useState(false);
  const [resettingSession,   setResettingSession]   = useState(false);
  const menuDotsRef = useRef(null);
  // Tokens consommés (cumulés par les turn_complete SSE)
  const [tokensUsed,      setTokensUsed]      = useState(null); // { input, output, total } | null

  const handleSessionClosed = useCallback((newStatus) => {
    setSession(prev => prev ? { ...prev, status: newStatus } : prev);
    setShowCloseModal(false);
    refreshPanel();
  }, [refreshPanel]);

  const handleResetSession = useCallback(async () => {
    setResettingSession(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/reset`);
      setShowResetModal(false);
      setSession(prev => prev ? { ...prev, status: 'open', summary: null } : prev);
      setMessages([]);
      refreshPanel();
    } catch {
      // silence — l'utilisateur verra simplement que rien n'a changé
    } finally {
      setResettingSession(false);
    }
  }, [projectId, sessionId, refreshPanel]);

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

  useEffect(() => {
    if (!showMenuDots) return;
    const handler = (e) => {
      if (menuDotsRef.current && !menuDotsRef.current.contains(e.target)) {
        setShowMenuDots(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenuDots]);

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
      setDropdownCreateForm({ open: false, name: '', role: '', creating: false, error: '', scope: 'project' });
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
  const handleCreateAndInvite = useCallback(async (idx, form, scope = 'project') => {
    const s = agentSuggestionsRef.current[idx];
    if (!s || s.inviting) return;
    setAgentSuggestions(prev => prev.map((x, i) => i === idx ? { ...x, inviting: true } : x));
    try {
      console.log('[handleCreateAndInvite] POST /agents', { name: form.name, role: form.role, scope });
      const { data: agent } = await api.post('/agents', {
        name:         form.name.trim(),
        role:         form.role.trim(),
        systemPrompt: form.systemPrompt.trim()
      });
      console.log('[handleCreateAndInvite] agent créé', agent.id, agent.name);
      await api.post(`/projects/${projectId}/agents`, { agentId: agent.id, source: scope === 'global' ? 'global' : 'suggestion' });
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
    // Lire la queue via ref (synchrone, pas de closure stale ni de side-effect dans un updater)
    const queue = decisionQueueRef.current;
    if (queue.length > 0) {
      setPendingDecisionId(queue[0].messageId);
      setDecisionQueue(queue.slice(1));
    } else {
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

  // Déléguer une décision aux agents
  const handleDelegateDecision = useCallback(async (messageId) => {
    try {
      const { data } = await api.post(
        `/projects/${projectId}/sessions/${sessionId}/answer-decision`,
        { messageId, answer: 'delegated', status: 'delegated' }
      );
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, ...data.message } : m);
        return data.systemMessage ? [...updated, data.systemMessage] : updated;
      });
    } catch {
      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, status: 'delegated', answer: 'delegated', answeredAt: new Date().toISOString() }
          : m
      ));
    }
    setPendingDecisionId(null);
    const queue = decisionQueueRef.current;
    if (queue.length > 0) {
      setPendingDecisionId(queue[0].messageId);
      setDecisionQueue(queue.slice(1));
    } else {
      handleSendRef.current?.('', { resume: true, delegated: true });
    }
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
  const delegatedDecisions   = decisions.filter(m => m.status === 'delegated');

  const currentIntention = (() => {
    const i = session?.intention;
    if (Array.isArray(i) && i.length > 0) return i[0];
    try { const p = JSON.parse(i || '[]'); return Array.isArray(p) && p.length > 0 ? p[0] : 'synthesis'; }
    catch { return 'synthesis'; }
  })();
  const intentionMeta = DELIVERABLE_TYPES.find(d => d.id === currentIntention) || DELIVERABLE_TYPES[0];

  // ── Envoi + streaming SSE ─────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText, { resume = false, delegated = false } = {}) => {
    const text              = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    const currentAttachments = attachmentsRef.current;
    // resume:true = reprise silencieuse après décision, bypass guards normaux
    if (isClosed) return;
    if (!resume && !isStreaming && (!text && currentAttachments.length === 0)) return;
    if (!resume && pendingDecisionId) return;

    // Si streaming en cours — interrompre avant d'envoyer
    if (isStreaming && !resume) {
      abortControllerRef.current?.abort();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Après abort éventuel : si pas de contenu à envoyer, on s'arrête là
    if (!resume && !text && currentAttachments.length === 0) return;

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
          ? currentAttachments.map(a => ({ name: a.name, type: a.type, isImage: a.isImage, isPdf: !!a.isPdf, dataUrl: a.isImage ? a.dataUrl : null }))
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
      ? currentAttachments.map(a => {
          if (a.isImage)  return { name: a.name, type: a.type, isImage: true,  isPdf: false, base64: a.base64, mediaType: a.type };
          if (a.isPdf)    return { name: a.name, type: a.type, isImage: false, isPdf: true,  base64: a.base64 };
          if (a.extractedText) return { name: a.name, type: a.type, isImage: false, isPdf: false, extractedText: a.extractedText };
          return { name: a.name, type: a.type, isImage: false, isPdf: false, text: a.text };
        })
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
            ...(resume    ? { resume: true }    : {}),
            ...(delegated ? { delegated: true } : {}),
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
              streamingReasonRef.current = ev.reason || '';
              setStreamingReason(ev.reason || '');
              streamingTextRef.current = '';
              setStreamingText('');

            } else if (ev.type === 'chunk') {
              streamingTextRef.current += ev.text;
              setStreamingText(streamingTextRef.current);

            } else if (ev.type === 'agent_done') {
              const finalContent  = streamingTextRef.current;
              const finalReason   = streamingReasonRef.current;
              setMessages(prev => [...prev, {
                id:        ev.messageId,
                role:      'agent',
                agentName: ev.agentName,
                ...(finalReason ? { reason: finalReason } : {}),
                content:   finalContent,
                timestamp: new Date().toISOString(),
                type:      'message',
                pinned:    false
              }]);
              setStreamingAgent(null);
              streamingReasonRef.current = '';
              setStreamingReason('');
              streamingTextRef.current = '';
              setStreamingText('');

            } else if (ev.type === 'decision') {
              // Nouveau format v3.2 : décision structurée avec question + choix
              decisionJustEmittedRef.current = true; // signaler avant abort pour protéger pendingDecisionId
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

            } else if (ev.type === 'suggest_close') {
              setSuggestClose({ reason: ev.reason || '' });

            } else if (ev.type === 'turn_complete') {
              setIsStreaming(false);
              if (ev.tokensUsed) setTokensUsed(ev.tokensUsed);

            } else if (ev.type === 'sources') {
              setMessages(prev => {
                const idx = [...prev].reverse().findIndex(m => m.role === 'agent' && m.agentName === ev.agentName);
                if (idx === -1) return prev;
                const realIdx = prev.length - 1 - idx;
                const updated = [...prev];
                updated[realIdx] = { ...updated[realIdx], sources: ev.sources || [] };
                return updated;
              });

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
        const wasDecision    = decisionJustEmittedRef.current;
        decisionJustEmittedRef.current = false;
        setStreamingAgent(null);
        streamingTextRef.current = '';
        setStreamingText('');
        setIsStreaming(false);
        // Ne pas effacer pendingDecisionId si l'abort a été déclenché par une décision
        if (!wasDecision) setPendingDecisionId(null);
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

  const handleSelectMention = useCallback((agent) => {
    setInputText(prev => prev.replace(/@\w*$/, `@${agent.name} `));
    setShowMentionDropdown(false);
    setMentionSuggestions([]);
  }, []);

  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setInputText(value);
    const atMatch = value.match(/@(\w*)$/);
    if (atMatch) {
      const search = atMatch[1].toLowerCase();
      const filtered = activeAgents.filter(a => a.name.toLowerCase().startsWith(search));
      setMentionSuggestions(filtered);
      setShowMentionDropdown(filtered.length > 0);
      setMentionSelectedIdx(0);
    } else {
      setShowMentionDropdown(false);
      setMentionSuggestions([]);
    }
  }, [activeAgents]);

  const handleKeyDown = useCallback((e) => {
    if (showMentionDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIdx(i => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (mentionSuggestions[mentionSelectedIdx]) handleSelectMention(mentionSuggestions[mentionSelectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, showMentionDropdown, mentionSuggestions, mentionSelectedIdx, handleSelectMention]);

  const handleAbort = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const handleReopen = useCallback(async () => {
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/reopen`);
      setSession(prev => ({ ...prev, status: 'open' }));
    } catch (err) {
      console.error('[reopen]', err.message);
    }
  }, [projectId, sessionId]);

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
      const intentionNote = {
        claude_code: 'INSTRUCTION : Cette réunion doit préparer un prompt Claude Code. Tu NE dois PAS rédiger ou structurer le prompt pendant les échanges. Pose uniquement des questions pour clarifier les besoins.',
        summary: 'INSTRUCTION : Cette réunion doit produire un compte-rendu à la clôture. Contribue à la conversation sans rédiger le compte-rendu toi-même.',
        timeline_steps: 'INSTRUCTION : Cette réunion doit identifier des étapes pour la timeline. Utilise [SUGGEST_STEP: titre] pour signaler une étape au fil des échanges.',
      }[Array.isArray(session?.intention) ? session.intention[0] : ''] || '';
      if (intentionNote) parts.push(intentionNote);
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

  const processFiles = useCallback(async (fileList) => {
    const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const ACCEPTED_EXTRACT     = ['.docx', '.xlsx', '.csv'];
    const ACCEPTED_TEXT_TYPES  = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    const MAX = 3;
    const remaining = MAX - attachmentsRef.current.length;
    if (remaining <= 0) return;

    const isAccepted = (f) => {
      if (ACCEPTED_IMAGE_TYPES.includes(f.type)) return true;
      if (f.type === 'application/pdf') return true;
      if (ACCEPTED_TEXT_TYPES.includes(f.type) || f.type.startsWith('text/')) return true;
      const name = f.name.toLowerCase();
      return ACCEPTED_EXTRACT.some(ext => name.endsWith(ext));
    };

    const files = Array.from(fileList).filter(isAccepted).slice(0, remaining);
    const results = [];

    for (const file of files) {
      const name = file.name.toLowerCase();
      const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
      const isPdf   = file.type === 'application/pdf';
      const needsExtract = name.endsWith('.docx') || name.endsWith('.xlsx') || name.endsWith('.csv');

      if (isImage || isPdf) {
        // Lecture base64
        const att = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => {
            const dataUrl = e.target.result;
            resolve({ name: file.name, type: file.type, size: file.size,
              isImage, isPdf: isPdf && !isImage,
              dataUrl: isImage ? dataUrl : null,
              base64: dataUrl.split(',')[1] });
          };
          reader.onerror = () => resolve({ name: file.name, error: true });
          reader.readAsDataURL(file);
        });
        if (!att.error) results.push(att);

      } else if (needsExtract) {
        // Extraction serveur
        try {
          const formData = new FormData();
          formData.append('file', file);
          const token = localStorage.getItem('token');
          const resp = await fetch(
            `/api/projects/${projectId}/sessions/${sessionId}/extract-file`,
            { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData }
          );
          if (resp.ok) {
            const { text: extractedText } = await resp.json();
            results.push({ name: file.name, type: file.type, size: file.size,
              isImage: false, isPdf: false, extractedText });
          } else {
            setSendError(`Impossible d'extraire : ${file.name}`);
          }
        } catch {
          setSendError(`Erreur extraction : ${file.name}`);
        }

      } else {
        // Texte brut
        const att = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = e => resolve({ name: file.name, type: file.type, size: file.size, isImage: false, isPdf: false, text: e.target.result });
          reader.onerror = () => resolve({ name: file.name, error: true });
          reader.readAsText(file);
        });
        if (!att.error) results.push(att);
      }
    }

    setAttachments(prev => [...prev, ...results].slice(0, MAX));
  }, [projectId, sessionId]);

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
          <div className="w-8 h-8 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
        </div>
      </ProjectLayout>
    );
  }

  if (loadError || !session) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
          <p className="text-sm">{loadError || 'Réunion introuvable.'}</p>
          <Link to={`/projects/${projectId}`} className="text-sm text-blabia-blue hover:underline">
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

        <MeetingDecisionPanel
          showDecisions={showDecisions}
          setShowDecisions={setShowDecisions}
          decisions={decisions}
          pendingDecisions={pendingDecisions}
          answeredDecisions={answeredDecisions}
          delegatedDecisions={delegatedDecisions}
          isClosed={isClosed}
          panelExpandedDecisionId={panelExpandedDecisionId}
          setPanelExpandedDecisionId={setPanelExpandedDecisionId}
          setPendingDecisionId={setPendingDecisionId}
          handleAnswerDecision={handleAnswerDecision}
          handleDeferDecision={handleDeferDecision}
        />

        {/* ── Chat principal ────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden min-w-0">

        <MeetingHeader
          projectId={projectId}
          session={session}
          isClosed={isClosed}
          badge={badge}
          editingTask={editingTask}
          setEditingTask={setEditingTask}
          taskDraft={taskDraft}
          setTaskDraft={setTaskDraft}
          savingTask={savingTask}
          handleSaveTask={handleSaveTask}
          intentionMeta={intentionMeta}
          currentIntention={currentIntention}
          deliverableTypes={DELIVERABLE_TYPES}
          showIntentionDropdown={showIntentionDropdown}
          setShowIntentionDropdown={setShowIntentionDropdown}
          savingIntention={savingIntention}
          handleSaveIntention={handleSaveIntention}
          intentionDropdownRef={intentionDropdownRef}
          showDecisions={showDecisions}
          setShowDecisions={setShowDecisions}
          decisions={decisions}
          pendingDecisionCount={pendingDecisionCount}
          tokensUsed={tokensUsed}
          showMenuDots={showMenuDots}
          setShowMenuDots={setShowMenuDots}
          setShowResetModal={setShowResetModal}
          menuDotsRef={menuDotsRef}
          activeAgents={activeAgents}
          agentColors={AGENT_COLORS}
          showAgentDropdown={showAgentDropdown}
          setShowAgentDropdown={setShowAgentDropdown}
          dropdownRef={dropdownRef}
          loadingAvailable={loadingAvailable}
          availableForAdd={availableForAdd}
          addingAgentId={addingAgentId}
          handleAddAgent={handleAddAgent}
          dropdownCreateForm={dropdownCreateForm}
          setDropdownCreateForm={setDropdownCreateForm}
          handleDropdownCreateAgent={handleDropdownCreateAgent}
        />

        <MeetingSuggestCloseBanner
          suggestClose={suggestClose}
          setSuggestClose={setSuggestClose}
          isClosed={isClosed}
          currentIntention={currentIntention}
          setShowCloseModal={setShowCloseModal}
        />

        {/* ── Fil de conversation ─────────────────────────────────────────── */}
        <div ref={feedRef} className="flex-1 overflow-y-auto" onScroll={handleFeedScroll}>
          <ConversationFeed
            messages={messages}
            activeAgents={activeAgents}
            streamingAgent={streamingAgent}
            streamingText={streamingText}
            streamingReason={streamingReason}
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
            onDelegateDecision={handleDelegateDecision}
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
              className="text-xs font-medium text-white bg-blue-500 hover:bg-blabia-blue shadow-md px-3.5 py-1.5 rounded-full transition flex items-center gap-1.5"
            >
              ⬇ Nouveau message
            </button>
          </div>
        )}

        <MeetingInputBar
          isClosed={isClosed}
          session={session}
          currentIntention={currentIntention}
          handleReopen={handleReopen}
          setShowDeliverable={setShowDeliverable}
          sendError={sendError}
          fileInputRef={fileInputRef}
          processFiles={processFiles}
          attachments={attachments}
          setAttachments={setAttachments}
          showMentionDropdown={showMentionDropdown}
          mentionSuggestions={mentionSuggestions}
          mentionSelectedIdx={mentionSelectedIdx}
          handleSelectMention={handleSelectMention}
          activeAgents={activeAgents}
          agentColors={AGENT_COLORS}
          handleDragOver={handleDragOver}
          handleDragLeave={handleDragLeave}
          handleDrop={handleDrop}
          isDragging={isDragging}
          isStreaming={isStreaming}
          pendingDecisionId={pendingDecisionId}
          inputText={inputText}
          handleInputChange={handleInputChange}
          handleKeyDown={handleKeyDown}
          handleSend={handleSend}
          setShowCloseModal={setShowCloseModal}
        />

        </div>
        {/* ── fin chat principal ──────────────────────────────────────── */}

      </div>
      {/* ── fin wrapper flex ────────────────────────────────────────────── */}
    </ProjectLayout>

    {/* Modale réinitialisation réunion */}
    {showResetModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">⚠️ Réinitialiser cette réunion ?</h3>
          <p className="text-sm text-gray-600">Cette action va :</p>
          <ul className="text-sm text-gray-700 space-y-1 pl-4 list-disc">
            <li>Effacer tous les échanges de cette réunion</li>
            <li>Supprimer sa contribution à la mémoire du projet</li>
            <li>Réinitialiser la mémoire des étapes suivantes</li>
          </ul>
          <p className="text-sm text-gray-500 italic">Les étapes précédentes sont conservées.</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowResetModal(false)}
              disabled={resettingSession}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Annuler
            </button>
            <button
              onClick={handleResetSession}
              disabled={resettingSession}
              className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {resettingSession ? 'Réinitialisation…' : '🔄 Réinitialiser'}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de clôture v3.0 */}
    {showCloseModal && session && (
      <MeetingCloseModal
        session={session}
        projectId={projectId}
        onClose={() => setShowCloseModal(false)}
        onClosed={handleSessionClosed}
      />
    )}

    {/* ── Modaux livrables ────────────────────────────────────────────── */}
    {showDeliverable && session?.status === 'accepted' && currentIntention === 'summary' && (
      <SummaryDisplayModal
        title={session.task}
        date={session.createdAt
          ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          : ''}
        content={session.summary}
        onClose={() => setShowDeliverable(false)}
      />
    )}
    {showDeliverable && session?.status === 'accepted' && currentIntention === 'claude_code' && (
      <ExportModal
        directContent={session.summary}
        projectId={projectId}
        onClose={() => setShowDeliverable(false)}
      />
    )}
    {showDeliverable && session?.status === 'accepted' && currentIntention === 'timeline_steps' && (
      <TimelineStepsModal
        session={session}
        projectId={projectId}
        onClose={() => setShowDeliverable(false)}
      />
    )}
    </>
  );
}
