import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ProjectLayout from '../components/ProjectLayout';
import MeetingCloseModal from '../components/MeetingCloseModal';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import ExportModal from '../components/ExportModal';
import MeetingHeader from '../components/meeting/MeetingHeader';
import MeetingInputBar from '../components/meeting/MeetingInputBar';
import { MeetingDecisionPanel, MeetingSuggestCloseBanner } from '../components/meeting/MeetingDecisionFlow';
import ConversationFeed from '../components/meeting/ConversationFeed';
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
  // MeetingRoom rend lui-même <ProjectLayout> plus bas : il ne peut pas consommer
  // son propre contexte via useProjectPanel() (cf. ProjectLayout.jsx), d'où ce ref.
  const panelRef = useRef(null);
  const refreshPanel = useCallback(() => panelRef.current?.(), []);

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
    } catch {}
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
    } catch {}
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
          } catch {}
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

  // Curseurs pédagogie/humour : surcharge de cette réunion, effet au tour suivant
  const handleChangeLevel = useCallback(async (field, value) => {
    setSession(prev => ({ ...prev, [field]: value })); // optimiste
    try {
      const { data } = await api.patch(`/projects/${projectId}/sessions/${sessionId}`, { [field]: value });
      // Le mode de questions change le budget : le serveur renvoie le nouveau
      if (data?.decisionBudget) setSession(prev => ({ ...prev, decisionBudget: data.decisionBudget }));
    } catch {}
  }, [projectId, sessionId]);

  // ── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <ProjectLayout projectId={projectId} panelRef={panelRef}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
        </div>
      </ProjectLayout>
    );
  }

  if (loadError || !session) {
    return (
      <ProjectLayout projectId={projectId} panelRef={panelRef}>
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
    <ProjectLayout projectId={projectId} panelRef={panelRef}>
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
          expertiseLevel={effectiveExpertiseLevel}
          humorLevel={effectiveHumorLevel}
          questionMode={effectiveQuestionMode}
          onChangeLevel={handleChangeLevel}
          showLevelsDropdown={showLevelsDropdown}
          setShowLevelsDropdown={setShowLevelsDropdown}
          levelsDropdownRef={levelsDropdownRef}
          showDecisions={showDecisions}
          setShowDecisions={setShowDecisions}
          decisions={decisions}
          pendingDecisionCount={pendingDecisionCount}
          decisionBudget={session?.decisionBudget}
          meetingSuggestionsCount={meetingSuggestions.filter(s => s.status === 'pending').length}
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
            streamingReason={streamingReason}
            agentSuggestions={agentSuggestions}
            onInviteSuggested={handleInviteSuggested}
            onDismissSuggestion={handleDismissSuggestion}
            onCreateAndInvite={handleCreateAndInvite}
            meetingSuggestions={meetingSuggestions}
            onKeepMeeting={handleKeepMeeting}
            onDiscardMeeting={handleDiscardMeeting}
            onSaveMeeting={handleSaveMeeting}
            meetingSuggestionBusyId={meetingSuggestionBusyId}
            meetingRefs={meetingRefs}
            toolSuggestions={toolSuggestions}
            session={session}
            project={project}
            onAutoLaunch={handleAutoLaunch}
            onPrepare={handlePrepare}
            isClosed={isClosed}
            isStreaming={isStreaming}
            pendingDecisionId={pendingDecisionId}
            onAnswerDecision={handleAnswerDecision}
            onDeferDecision={handleDeferDecision}
            onDelegateDecision={handleDelegateDecision}
            agentColors={AGENT_COLORS}
            deliverableTypes={DELIVERABLE_TYPES}
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
          onIllustrate={(request) => handleSend(`🎨 Illustration demandée : ${request}`, { artifactRequest: true })}
          handleTextareaFocus={handleTextareaFocus}
          setShowCloseModal={setShowCloseModal}
          pendingDecisionsCount={pendingDecisionCount}
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
