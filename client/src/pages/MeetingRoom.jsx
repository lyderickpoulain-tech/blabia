import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import MeetingCloseModal from '../components/MeetingCloseModal';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import ExportModal from '../components/ExportModal';
import MeetingHeader from '../components/meeting/MeetingHeader';
import MeetingInputBar from '../components/meeting/MeetingInputBar';
import { MeetingSuggestCloseBanner } from '../components/meeting/MeetingDecisionFlow';
import MeetingSidePanel, { IllustrationPanel } from '../components/meeting/MeetingSidePanel';
import BriefingView from '../components/meeting/BriefingView';
import { DELEGATE } from '../components/DecisionCard';
import ArtifactCard from '../components/meeting/ArtifactCard';
import ConversationFeed from '../components/meeting/ConversationFeed';
import { RotateCcw } from 'lucide-react';
import { Button } from '../components/ui';
import api from '../utils/api';
import { notifyError } from '../utils/notify';

// ── Palette agent (initiale + couleur de bulle) ───────────────────────────────

const AGENT_COLORS = [
  { bg: 'bg-blue-100',    text: 'text-blue-700',    avatar: 'bg-blue-600',    soft: 'bg-blue-50 ring-1 ring-blue-100'       },
  { bg: 'bg-violet-100',  text: 'text-violet-700',  avatar: 'bg-violet-600',  soft: 'bg-violet-50 ring-1 ring-violet-100'   },
  { bg: 'bg-emerald-100', text: 'text-emerald-700', avatar: 'bg-emerald-700', soft: 'bg-emerald-50 ring-1 ring-emerald-100' },
  { bg: 'bg-rose-100',    text: 'text-rose-700',    avatar: 'bg-rose-600',    soft: 'bg-rose-50 ring-1 ring-rose-100'       },
  { bg: 'bg-amber-100',   text: 'text-amber-800',   avatar: 'bg-amber-700',   soft: 'bg-amber-50 ring-1 ring-amber-100'     },
  { bg: 'bg-cyan-100',    text: 'text-cyan-800',    avatar: 'bg-cyan-700',    soft: 'bg-cyan-50 ring-1 ring-cyan-100'       },
];

// ── Statut badge ─────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  open:      { label: 'En cours',   cls: 'bg-blue-100 text-blabia-blue'   },
  accepted:  { label: 'Acceptée',   cls: 'bg-green-100 text-green-700'  },
  abandoned: { label: 'Abandonnée', cls: 'bg-gray-100 text-gray-500'    },
};

// v5.0 phase 3.2 : decision | claude_code (stack : phase 4)
const DELIVERABLE_TYPES = [
  { id: 'decision',    icon: '🤝', label: 'Décision'    },
  { id: 'claude_code', icon: '💻', label: 'Claude Code' },
  { id: 'stack',       icon: '🔧', label: 'Outils'      },
];


// ── MeetingRoom ───────────────────────────────────────────────────────────────

export default function MeetingRoom() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const autoPrepareDone = useRef(false);

  const [session,      setSession]      = useState(null);
  const [project,      setProject]      = useState(null);
  const [demoHint,     setDemoHint]     = useState(''); // projet exemple : ce qui se passerait en vrai
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

  // États streaming (2.1 : plus de texte partiel, juste l'indicateur "en train d'écrire")
  const [streamingAgent,  setStreamingAgent]  = useState(null);
  const [streamingReason, setStreamingReason] = useState('');
  const [isStreaming,     setIsStreaming]      = useState(false);

  // Pièces jointes (max 3 par message)
  const [attachments, setAttachments] = useState([]);
  const [isDragging,  setIsDragging]  = useState(false);
  const fileInputRef    = useRef(null);
  const attachmentsRef  = useRef([]);
  attachmentsRef.current = attachments;

  // Refs pour capturer reason dans la closure SSE sans dépendance stale
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
  const levelsDropdownRef                                 = useRef(null);
  const [showLevelsDropdown,    setShowLevelsDropdown]    = useState(false);

  // États suggestions d'agent SSE
  const [agentSuggestions,    setAgentSuggestions]    = useState([]);
  const agentSuggestionsRef = useRef([]);
  agentSuggestionsRef.current = agentSuggestions; // sync à chaque rendu pour éviter stale closures

  // Réunions suggérées ([SUGGEST_MEETING], phase 3.4)
  const [meetingSuggestions, setStepSuggestions] = useState([]);
  const [planMilestones, setPlanMilestones] = useState([]); // réunions déjà planifiées (pour résoudre/éditer "after")
  // Outils proposés via [NEED_TOOL] (réunion de type stack, phase 4.3) — validés à la clôture
  const [toolSuggestions, setToolSuggestions] = useState([]);

  // ID de la décision en attente (bloque la saisie jusqu'à réponse/report)
  const [pendingDecisionId,       setPendingDecisionId]       = useState(null);
  const [panelExpandedDecisionId, setPanelExpandedDecisionId] = useState(null);
  const [decisionQueue,           setDecisionQueue]           = useState([]);
  const pendingDecisionIdRef       = useRef(null);
  pendingDecisionIdRef.current     = pendingDecisionId; // sync pour accès dans les callbacks SSE
  const isStreamingRef             = useRef(false);
  isStreamingRef.current           = isStreaming; // sync pour handleTextareaFocus sans closure stale
  const handleSendRef              = useRef(null);  // évite TDZ (handleSend déclaré après)
  const decisionQueueRef           = useRef([]);    // accès synchrone sans closure stale
  decisionQueueRef.current         = decisionQueue;
  const decisionJustEmittedRef     = useRef(false); // empêche AbortError d'effacer pendingDecisionId

  // Modal de clôture
  const [showCloseModal,  setShowCloseModal]  = useState(false);
  // Refonte UX v5.1 : panneau latéral, illustration ouverte, préparation, briefing
  const [panelOpen,          setPanelOpen]          = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  const [openArtifactId,     setOpenArtifactId]     = useState(null);
  const [prepExpanded,       setPrepExpanded]       = useState(false);
  const [prepRequested,      setPrepRequested]      = useState(false);
  const [showDebate,         setShowDebate]         = useState(false);
  const [briefingSubmitting, setBriefingSubmitting] = useState(false);
  const inputRef     = useRef(null);
  const questionsRef = useRef(null);
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
  }, []);

  const handleResetSession = useCallback(async () => {
    setResettingSession(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/reset`);
      setShowResetModal(false);
      setSession(prev => prev ? { ...prev, status: 'open', summary: null } : prev);
      setMessages([]);
    } catch {
      // silence — l'utilisateur verra simplement que rien n'a changé
    } finally {
      setResettingSession(false);
    }
  }, [projectId, sessionId]);

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
  }, [messages, streamingAgent, agentSuggestions, meetingSuggestions, isStreaming]);

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
    } catch (err) { notifyError(err, 'Impossible de charger les agents disponibles.'); }
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

  useEffect(() => {
    if (!showLevelsDropdown) return;
    const handler = (e) => {
      if (levelsDropdownRef.current && !levelsDropdownRef.current.contains(e.target)) {
        setShowLevelsDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showLevelsDropdown]);

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
    } catch (err) { notifyError(err, 'La question n’a pas pu être reportée.'); }
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, status: 'deferred' } : m
    ));
    // Dépiler la prochaine décision en attente si elle existe (lecture via ref :
    // pas d'effet de bord dans un updater, qui peut être rejoué par React)
    const queue = decisionQueueRef.current;
    if (queue.length > 0) {
      setPendingDecisionId(queue[0].messageId);
      setDecisionQueue(queue.slice(1));
    } else {
      setPendingDecisionId(null);
    }
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

  // Réunions suggérées ([SUGGEST_MEETING], phase 3.4) — Garder/Modifier/Écarter
  // ne créent rien immédiatement : la matérialisation se fait au "Plan des
  // réunions" (panneau latéral) ou à la clôture.
  const [meetingSuggestionBusyId, setMeetingSuggestionBusyId] = useState(null);
  const patchMeetingSuggestion = useCallback(async (id, body) => {
    setMeetingSuggestionBusyId(id);
    try {
      const { data } = await api.patch(`/projects/${projectId}/sessions/${sessionId}/meeting-suggestions/${id}`, body);
      setStepSuggestions(prev => prev.map(s => s.id === id ? { ...s, ...data } : s));
    } catch (err) { notifyError(err, 'La suggestion de réunion n’a pas pu être mise à jour.'); }
    setMeetingSuggestionBusyId(null);
  }, [projectId, sessionId]);
  const handleKeepMeeting    = useCallback((id) => patchMeetingSuggestion(id, { status: 'kept' }), [patchMeetingSuggestion]);
  const handleDiscardMeeting = useCallback((id) => patchMeetingSuggestion(id, { status: 'discarded' }), [patchMeetingSuggestion]);
  const handleSaveMeeting    = useCallback((id, fields) => patchMeetingSuggestion(id, fields), [patchMeetingSuggestion]);

  // Chargement initial : session + projet + plan (réunions planifiées, pour les
  // références R1/R2… utilisées par [SUGGEST_MEETING]) en parallèle
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/projects/${projectId}/sessions/${sessionId}`),
      api.get(`/projects/${projectId}`),
      api.get(`/projects/${projectId}/plan`),
    ])
      .then(([{ data: sessionData }, { data: projectData }, { data: planData }]) => {
        setSession(sessionData);
        setProject(projectData);
        setMessages(Array.isArray(sessionData.messages) ? sessionData.messages : []);
        setActiveAgents(Array.isArray(sessionData.activeAgents) ? sessionData.activeAgents : []);
        setStepSuggestions(Array.isArray(sessionData.pendingMeetingSuggestions) ? sessionData.pendingMeetingSuggestions : []);
        setToolSuggestions(Array.isArray(sessionData.pendingToolSuggestions) ? sessionData.pendingToolSuggestions : []);
        setPlanMilestones(Array.isArray(planData.milestones) ? planData.milestones : []);
      })
      .catch(() => setLoadError('Réunion introuvable ou accès refusé.'))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  // Références courtes (R1, R2…) — même numérotation que celle vue par les agents
  // côté serveur (chat.js), pour afficher/éditer le positionnement des suggestions.
  const meetingRefs = planMilestones
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((m, i) => ({ ref: `R${i + 1}`, title: m.title }));

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
    try { const p = JSON.parse(i || '[]'); return Array.isArray(p) && p.length > 0 ? p[0] : 'decision'; }
    catch { return 'decision'; }
  })();
  const intentionMeta = DELIVERABLE_TYPES.find(d => d.id === currentIntention) || DELIVERABLE_TYPES[0];
  const effectiveExpertiseLevel = session?.expertiseLevel ?? project?.expertiseLevel ?? 3;
  const effectiveHumorLevel     = session?.humorLevel     ?? project?.humorLevel     ?? 2;
  const effectiveQuestionMode   = session?.questionMode   ?? project?.questionMode   ?? 'balanced';

  // ── Envoi + streaming SSE ─────────────────────────────────────────────────

  const handleSend = useCallback(async (overrideText, { resume = false, delegated = false, artifactRequest = false, prepare = false } = {}) => {
    const text              = (typeof overrideText === 'string' ? overrideText : inputText).trim();
    const currentAttachments = attachmentsRef.current;
    // resume:true = reprise silencieuse après décision, bypass guards normaux
    if (isClosed) return;
    // Un resume ne doit jamais se superposer à un flux déjà actif (ex. double-clic sur
    // "Lancer automatiquement") : deux requêtes /chat concurrentes pousseraient
    // chacune leurs propres messages dans le même état local.
    if (resume && isStreaming) return;
    if (!resume && !isStreaming && (!text && currentAttachments.length === 0)) return;

    // Streaming en cours → abort (déclencheur secondaire si le focus n'a pas suffi)
    if (!resume && isStreaming) {
      abortControllerRef.current?.abort();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Décision en attente → annuler sans abort (aucun agent ne parle)
    if (!resume && pendingDecisionId) {
      setPendingDecisionId(null);
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
            ...(artifactRequest ? { artifactRequest: true } : {}),
            ...(prepare ? { prepare: true } : {}),
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

            if (ev.type === 'agent_typing') {
              setStreamingAgent(ev.agentName);
              streamingReasonRef.current = ev.reason || '';
              setStreamingReason(ev.reason || '');

            } else if (ev.type === 'agent_message') {
              // Messages finaux uniquement (2.1) : la bulle d'attente disparaît
              // dès réception, les bulles de la réponse s'affichent ensuite
              // l'une après l'autre (~400 ms d'écart, 2.2).
              setStreamingAgent(null);
              streamingReasonRef.current = '';
              setStreamingReason('');
              const bubbles = ev.messages || [];
              for (let i = 0; i < bubbles.length; i++) {
                if (i > 0) await new Promise(resolve => setTimeout(resolve, 400));
                const bubble = bubbles[i];
                setMessages(prev => [...prev, bubble]);
              }

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
              // Plusieurs cartes peuvent arriver dans le même tour (questions regroupées) :
              // pas d'abort (le serveur s'arrête de lui-même après les décisions), et la
              // ref est mise à jour tout de suite pour que les cartes suivantes partent en file.
              if (pendingDecisionIdRef.current) {
                const queued = {
                  messageId: ev.messageId, question: ev.question || '',
                  choices: ev.choices || [], context: ev.context || '', agentName: ev.agentName || '',
                };
                decisionQueueRef.current = [...decisionQueueRef.current, queued];
                setDecisionQueue(decisionQueueRef.current);
              } else {
                pendingDecisionIdRef.current = ev.messageId;
                setPendingDecisionId(ev.messageId);
              }

            } else if (ev.type === 'suggest_close') {
              setSuggestClose({ reason: ev.reason || '' });

            } else if (ev.type === 'turn_complete') {
              setIsStreaming(false);
              if (ev.tokensUsed) setTokensUsed(ev.tokensUsed);

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

            } else if (ev.type === 'suggest_meeting') {
              setStepSuggestions(prev => [...prev, ev.suggestion]);

            } else if (ev.type === 'prep_summary') {
              setMessages(prev => [...prev, ev.message]);

            } else if (ev.type === 'suggest_tool') {
              setToolSuggestions(prev => [...prev, ev.tool]);

            } else if (ev.type === 'error') {
              setSendError(ev.message || 'Erreur inconnue');
              setStreamingAgent(null);
              setIsStreaming(false);
            }
          } catch {} // ligne du flux illisible (coupée en deux) : ignorée, la suivante complète
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // Interruption volontaire : plus de texte partiel à conserver (2.1) —
        // l'agent en cours n'est simplement pas enregistré.
        const wasDecision = decisionJustEmittedRef.current;
        decisionJustEmittedRef.current = false;
        setStreamingAgent(null);
        setIsStreaming(false);
        // Ne pas effacer pendingDecisionId si l'abort a été déclenché par une décision
        if (!wasDecision) setPendingDecisionId(null);
        return;
      }
      setSendError('Connexion interrompue : ' + err.message);
      setStreamingAgent(null);
      setIsStreaming(false);
    }
  }, [inputText, isStreaming, isClosed, streamingAgent, pendingDecisionId, projectId, sessionId]);
  handleSendRef.current = handleSend; // toujours à jour après chaque render

  // Interruption au focus du textarea : abort immédiat si streaming, ne rien faire si pendingDecision
  const handleTextareaFocus = useCallback(() => {
    if (isStreamingRef.current) {
      abortControllerRef.current?.abort();
    }
  }, []); // deps vides — isStreamingRef est toujours à jour via sync render

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

  // Aucune consigne d'agent construite ici : le serveur injecte déjà brief,
  // mémoire projet, timeline et intention dans le prompt système (voir
  // server/src/services/prompts/agentPrompt.js). Un simple "resume" silencieux
  // déclenche la première contribution des agents.
  const handleAutoLaunch = useCallback(() => {
    handleSend('', { resume: true });
  }, [handleSend]);

  // Préparation sans l'humain : les agents débattent, puis synthèse + décisions
  const handlePrepare = useCallback(() => {
    handleSend('', { resume: true, prepare: true });
  }, [handleSend]);

  // « Préparer avant mon arrivée » choisi au démarrage : une seule fois, réunion vide
  useEffect(() => {
    if (autoPrepareDone.current || loading || !session || !location.state?.autoPrepare) return;
    autoPrepareDone.current = true;
    if (messages.length === 0 && activeAgents.length >= 2 && !isClosed) {
      setPrepRequested(true);
      handlePrepare();
    }
    navigate(location.pathname, { replace: true, state: {} }); // pas de relance au rechargement
  }, [loading, session, messages.length, activeAgents.length, isClosed, location, handlePrepare, navigate]);

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
    } catch (err) { notifyError(err, 'Le titre de la réunion n’a pas pu être enregistré.'); }
    setSavingTask(false);
  }, [taskDraft, savingTask, projectId, sessionId]);

  const handleSaveIntention = useCallback(async (newType) => {
    if (savingIntention) return;
    setSavingIntention(true);
    setShowIntentionDropdown(false);
    try {
      await api.patch(`/projects/${projectId}/sessions/${sessionId}`, { intention: [newType] });
      setSession(prev => ({ ...prev, intention: [newType] }));
    } catch (err) { notifyError(err, 'Le livrable n’a pas pu être modifié.'); }
    setSavingIntention(false);
  }, [savingIntention, projectId, sessionId]);

  // Curseurs pédagogie/humour : surcharge de cette réunion, effet au tour suivant
  const handleChangeLevel = useCallback(async (field, value) => {
    setSession(prev => ({ ...prev, [field]: value })); // optimiste
    try {
      const { data } = await api.patch(`/projects/${projectId}/sessions/${sessionId}`, { [field]: value });
      // Le mode de questions change le budget : le serveur renvoie le nouveau
      if (data?.decisionBudget) setSession(prev => ({ ...prev, decisionBudget: data.decisionBudget }));
    } catch (err) { notifyError(err, 'Le réglage n’a pas été enregistré : il s’applique seulement à cet écran.'); }
  }, [projectId, sessionId]);

  // ── Refonte UX v5.1 : temps de la réunion, panneau, briefing, illustration ──

  const prepSummaryMsg       = messages.find(m => m.type === 'prep_summary') || null;
  const prepDecisionMsgs     = messages.filter(m => m.type === 'decision' && m.agentName === 'Préparation');
  const pendingPrepDecisions = prepDecisionMsgs.filter(d => d.status === 'pending' || d.status === 'deferred');
  const prepDebateCount      = messages.filter(m => m.role === 'agent' && m.prep).length
    || (prepSummaryMsg ? messages.slice(0, messages.indexOf(prepSummaryMsg)).filter(m => m.role === 'agent').length : 0);
  const prepStarted          = prepRequested || messages.some(m => m.prep) || !!prepSummaryMsg;

  let phase = 'exchanges';
  if (isClosed || showCloseModal)                                  phase = 'conclusion';
  // Préparation arrêtée avant la synthèse : on passe directement aux échanges
  else if (prepStarted && !prepSummaryMsg && isStreaming)          phase = 'preparation';
  else if (prepSummaryMsg && pendingPrepDecisions.length > 0)      phase = 'briefing';
  const skippedPhases = prepStarted ? [] : ['preparation', 'briefing'];

  const artifactMessages = messages.filter(m => m.artifact);
  const openArtifact     = artifactMessages.find(m => m.id === openArtifactId) || null;
  const questionsUsed    = decisions.length;

  // Briefing : toutes les réponses envoyées ensemble, puis une seule reprise
  const submitBriefing = useCallback(async (answersById) => {
    if (briefingSubmitting) return;
    // Projet exemple (visite guidée) : les agents ne sont pas sollicités
    if (project?.isDemo) {
      setDemoHint('Dans un vrai projet, vos réponses partiraient maintenant aux agents et les échanges commenceraient.');
      return;
    }
    setBriefingSubmitting(true);
    setSendError('');
    const anyDelegated = pendingPrepDecisions.some(d => answersById[d.id] === DELEGATE);
    try {
      for (const d of pendingPrepDecisions) {
        const body = answersById[d.id] === DELEGATE
          ? { messageId: d.id, answer: 'delegated', status: 'delegated' }
          : { messageId: d.id, answer: answersById[d.id], status: 'answered' };
        const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/answer-decision`, body);
        setMessages(prev => {
          const updated = prev.map(m => m.id === d.id ? { ...m, ...data.message } : m);
          return data.systemMessage ? [...updated, data.systemMessage] : updated;
        });
      }
      decisionQueueRef.current = [];
      pendingDecisionIdRef.current = null;
      setDecisionQueue([]);
      setPendingDecisionId(null);
      setShowDebate(false);
      handleSendRef.current?.('', { resume: true, ...(anyDelegated ? { delegated: true } : {}) });
    } catch {
      setSendError('Vos réponses n’ont pas pu être envoyées. Réessayez.');
    }
    setBriefingSubmitting(false);
  }, [briefingSubmitting, pendingPrepDecisions, projectId, sessionId, project?.isDemo]);

  // Contradicteur : « J'en tiens compte » / « Écarter »
  const handleVigilance = useCallback(async (messageId, status) => {
    if (project?.isDemo) { setDemoHint('Dans un vrai projet, votre réponse serait transmise aux agents.'); return; }
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/vigilance`, { messageId, status });
      setMessages(prev => {
        const updated = prev.map(m => m.id === messageId ? { ...m, ...data.message } : m);
        return data.systemMessage ? [...updated, data.systemMessage] : updated;
      });
    } catch (err) {
      setSendError(err.response?.data?.error || 'Votre réponse n’a pas pu être enregistrée.');
    }
  }, [projectId, sessionId, project?.isDemo]);

  // « Je contredis » : la saisie s'ouvre adressée à l'agent
  const handleContradict = useCallback((agentName) => {
    setInputText(`@${agentName} je ne suis pas d'accord : `);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 0);
  }, []);

  const handleConclude = useCallback(() => {
    if (pendingDecisionCount > 0 && !window.confirm(
      `${pendingDecisionCount} question${pendingDecisionCount > 1 ? 's sont' : ' est'} encore sans réponse. Les agents attendent vos arbitrages pour avancer. Conclure quand même ?`
    )) return;
    setShowCloseModal(true);
  }, [pendingDecisionCount]);

  const showQuestionsInPanel = useCallback(() => {
    setPanelOpen(true);
    setOpenArtifactId(null);
    setTimeout(() => questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, []);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loadError || !session) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-canvas text-ink-muted">
        <p className="text-sm">{loadError || 'Réunion introuvable.'}</p>
        <Link to={`/projects/${projectId}`} className="text-sm font-bold">Retour au projet</Link>
      </div>
    );
  }

  const showBriefing = phase === 'briefing' && !showDebate;

  return (
    <>
    <div className="h-screen flex flex-col bg-canvas text-ink overflow-hidden">
      <MeetingHeader
        projectId={projectId}
        session={session}
        isClosed={isClosed}
        statusLabel={session.status === 'accepted' ? 'Conclue' : session.status === 'abandoned' ? 'Abandonnée' : badge.label}
        phase={phase}
        skippedPhases={skippedPhases}
        editingTask={editingTask}
        setEditingTask={setEditingTask}
        taskDraft={taskDraft}
        setTaskDraft={setTaskDraft}
        savingTask={savingTask}
        handleSaveTask={handleSaveTask}
        intentionMeta={intentionMeta}
        currentIntention={currentIntention}
        deliverableTypes={DELIVERABLE_TYPES}
        savingIntention={savingIntention}
        handleSaveIntention={handleSaveIntention}
        expertiseLevel={effectiveExpertiseLevel}
        humorLevel={effectiveHumorLevel}
        questionMode={effectiveQuestionMode}
        onChangeLevel={handleChangeLevel}
        questionsUsed={questionsUsed}
        decisionBudget={session?.decisionBudget}
        pendingDecisionCount={pendingDecisionCount}
        tokensUsed={tokensUsed}
        activeAgents={activeAgents}
        panelOpen={panelOpen && !openArtifact}
        onTogglePanel={() => { setOpenArtifactId(null); setPanelOpen(o => !(o && !openArtifact)); }}
        onShowQuestions={showQuestionsInPanel}
        onConclude={handleConclude}
        onReset={() => setShowResetModal(true)}
      />

      {project?.isDemo && (
        <div role="status" className="shrink-0 bg-ai-bg border-b border-ai-border px-4 py-1.5 text-[13px] text-center">
          <span className="font-extrabold text-ai">Projet exemple</span>
          <span className="text-ink-soft"> · {demoHint || 'Les agents ne sont pas sollicités pendant la visite guidée : explorez librement, rien n’est envoyé.'}</span>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 flex flex-col">
          {showBriefing ? (
            <BriefingView
              summary={prepSummaryMsg}
              decisions={pendingPrepDecisions}
              debateCount={prepDebateCount}
              onShowDebate={() => { setShowDebate(true); setPrepExpanded(true); }}
              onSubmit={submitBriefing}
              submitting={briefingSubmitting}
              decisionBudget={session?.decisionBudget}
              firstNumber={decisions.indexOf(pendingPrepDecisions[0]) + 1}
            />
          ) : (
            <>
              {phase === 'briefing' && showDebate && (
                <div className="shrink-0 bg-ai-bg border-b border-ai-border px-4 py-1.5 flex items-center gap-3 text-[13px]">
                  <span className="flex-1 font-semibold text-ai">Vous consultez le débat de préparation.</span>
                  <button type="button" onClick={() => setShowDebate(false)} className="min-h-[32px] font-bold text-ai hover:underline">Revenir au briefing</button>
                </div>
              )}

              <MeetingSuggestCloseBanner
                suggestClose={suggestClose}
                setSuggestClose={setSuggestClose}
                isClosed={isClosed}
                currentIntention={currentIntention}
                setShowCloseModal={setShowCloseModal}
              />

              <div ref={feedRef} role="log" aria-label="Fil de la réunion" className="flex-1 min-h-0 overflow-y-auto" onScroll={handleFeedScroll}>
                <ConversationFeed
                  messages={messages}
                  activeAgents={activeAgents}
                  streamingAgent={streamingAgent}
                  streamingReason={streamingReason}
                  session={session}
                  project={project}
                  onAutoLaunch={handleAutoLaunch}
                  onPrepare={() => { setPrepRequested(true); handlePrepare(); }}
                  isClosed={isClosed}
                  isStreaming={isStreaming}
                  pendingDecisionId={pendingDecisionId}
                  onAnswerDecision={handleAnswerDecision}
                  onDeferDecision={handleDeferDecision}
                  onDelegateDecision={handleDelegateDecision}
                  agentColors={AGENT_COLORS}
                  deliverableTypes={DELIVERABLE_TYPES}
                  decisionBudget={session?.decisionBudget}
                  onOpenArtifact={m => { setOpenArtifactId(id => id === m.id ? null : m.id); }}
                  openArtifactId={openArtifactId}
                  onContradict={handleContradict}
                  onVigilance={handleVigilance}
                  prepExpanded={prepExpanded}
                  onTogglePrep={() => setPrepExpanded(v => !v)}
                />
              </div>

              {showNewMessage && (
                <div className="shrink-0 flex justify-center py-1">
                  <button type="button"
                    onClick={() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); setShowNewMessage(false); }}
                    className="h-8 px-3 rounded-full bg-action text-white text-xs font-bold shadow">
                    Nouveaux messages ↓
                  </button>
                </div>
              )}

              {phase === 'preparation' && isStreaming ? (
                // Préparation en cours : pas de saisie (le focus interromprait le débat)
                <div className="shrink-0 bg-white border-t border-line px-4 py-2">
                  <div className="max-w-[820px] mx-auto flex flex-wrap items-center gap-3">
                    <span className="w-4 h-4 border-2 border-ai border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                    <p className="flex-1 text-sm font-semibold text-ai">Les agents préparent la réunion. Le briefing s'affichera dès qu'ils auront fini.</p>
                    <button type="button" onClick={() => abortControllerRef.current?.abort()}
                      className="min-h-[36px] text-[13px] font-bold text-ink-muted hover:text-ink">Arrêter la préparation</button>
                  </div>
                </div>
              ) : (
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
                onIllustrate={(request) => handleSend(`🎨 Illustration demandée : ${request}`, { artifactRequest: true })}
                handleTextareaFocus={handleTextareaFocus}
                inputRef={inputRef}
              />
              )}
            </>
          )}
        </main>

        {openArtifact ? (
          <IllustrationPanel message={openArtifact} onClose={() => setOpenArtifactId(null)}>
            <ArtifactCard artifact={openArtifact.artifact} tall />
          </IllustrationPanel>
        ) : panelOpen && (
          <MeetingSidePanel
            isClosed={isClosed}
            decisions={decisions}
            decisionBudget={session?.decisionBudget}
            onAnswerDecision={handleAnswerDecision}
            onDeferDecision={handleDeferDecision}
            onDelegateDecision={handleDelegateDecision}
            meetingSuggestions={meetingSuggestions}
            onKeepMeeting={handleKeepMeeting}
            onDiscardMeeting={handleDiscardMeeting}
            onSaveMeeting={handleSaveMeeting}
            meetingSuggestionBusyId={meetingSuggestionBusyId}
            meetingRefs={meetingRefs}
            agentSuggestions={agentSuggestions}
            onInviteSuggested={handleInviteSuggested}
            onDismissSuggestion={handleDismissSuggestion}
            onCreateAndInvite={handleCreateAndInvite}
            toolSuggestions={toolSuggestions}
            activeAgents={activeAgents}
            agentColors={AGENT_COLORS}
            agentAddProps={{
              loadingAvailable, availableForAdd, addingAgentId, handleAddAgent,
              dropdownCreateForm, setDropdownCreateForm, handleDropdownCreateAgent,
            }}
            onOpenAgentAdd={() => loadAvailableForAdd()}
            artifacts={artifactMessages}
            onOpenArtifact={m => setOpenArtifactId(m.id)}
            questionsRef={questionsRef}
          />
        )}
      </div>
    </div>

    {/* Modale réinitialisation réunion */}
    {showResetModal && (
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-await-light text-await inline-flex items-center justify-center shrink-0">
              <RotateCcw size={20} aria-hidden="true" />
            </span>
            <div>
              <h3 id="reset-title" className="text-lg font-extrabold text-ink">Réinitialiser cette réunion ?</h3>
              <p className="text-sm text-ink-muted">Elle repartira de zéro, avec le même objectif et les mêmes agents.</p>
            </div>
          </div>
          <ul className="text-sm text-ink-soft space-y-1.5 bg-await-bg border border-await-border rounded-xl p-3.5">
            <li>• Tous les échanges de cette réunion sont effacés</li>
            <li>• Sa contribution à la mémoire du projet est retirée</li>
            <li>• La mémoire des étapes suivantes est réinitialisée</li>
          </ul>
          <p className="text-xs text-ink-faint">Les étapes précédentes sont conservées.</p>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setShowResetModal(false)} disabled={resettingSession}>
              Annuler
            </Button>
            <Button variant="await" className="flex-1" onClick={handleResetSession} disabled={resettingSession}>
              {resettingSession ? 'Réinitialisation…' : <><RotateCcw size={15} aria-hidden="true" /> Réinitialiser</>}
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de clôture v3.0 */}
    {showCloseModal && session && (
      <MeetingCloseModal
        session={session}
        initialSuggestions={meetingSuggestions}
        meetingRefs={meetingRefs}
        initialToolSuggestions={toolSuggestions}
        projectId={projectId}
        onClose={() => setShowCloseModal(false)}
        onClosed={handleSessionClosed}
      />
    )}

    {/* ── Modaux livrables ────────────────────────────────────────────── */}
    {showDeliverable === 'summary' && session?.status === 'accepted' && (
      <SummaryDisplayModal
        title={session.task}
        date={session.createdAt
          ? new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          : ''}
        content={session.summary}
        onClose={() => setShowDeliverable(false)}
      />
    )}
    {showDeliverable === 'deliverable' && session?.status === 'accepted' && (
      <ExportModal
        directContent={session.deliverable}
        projectId={projectId}
        onClose={() => setShowDeliverable(false)}
      />
    )}
    </>
  );
}
