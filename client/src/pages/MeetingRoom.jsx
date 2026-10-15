import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import MeetingCloseModal from '../components/MeetingCloseModal';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import useMissions from '../hooks/useMissions';
import ExportModal from '../components/ExportModal';
import MeetingHeader from '../components/meeting/MeetingHeader';
import MeetingInputBar from '../components/meeting/MeetingInputBar';
import { MeetingSuggestCloseBanner } from '../components/meeting/MeetingDecisionFlow';
import MeetingSidePanel, { IllustrationPanel } from '../components/meeting/MeetingSidePanel';
import BriefingView from '../components/meeting/BriefingView';
import { DELEGATE } from '../components/DecisionCard';
import ArtifactCard from '../components/meeting/ArtifactCard';
import ConversationFeed, { HYPOTHESIS_RE } from '../components/meeting/ConversationFeed';
import VisioStrip from '../components/meeting/VisioStrip';
import ResetMeetingModal from '../components/meeting/ResetMeetingModal';
import { AGENT_COLORS, STATUS_BADGE, DELIVERABLE_TYPES } from '../components/meeting/meetingConstants';
import useAttachments from '../hooks/useAttachments';
import useMeetingAgents from '../hooks/useMeetingAgents';
import useClickOutside from '../hooks/useClickOutside';
import api from '../utils/api';
import { notifyError } from '../utils/notify';
import usePresence from '../hooks/usePresence';
import { DecisionPeopleContext } from '../components/meeting/decisionPeople';
import { useAuth } from '../contexts/AuthContext';
import { notifySuccess } from '../utils/notify';
import { launchPreparation, stopPreparation } from '../utils/preparation';

// ── MeetingRoom ───────────────────────────────────────────────────────────────

export default function MeetingRoom() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  usePresence(projectId); // présence sur le projet (carte du projet)
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

  // Pièces jointes (max 3 par message) — hooks/useAttachments.js
  const { attachments, setAttachments, attachmentsRef, fileInputRef, isDragging, processFiles, handleDragOver, handleDragLeave, handleDrop } =
    useAttachments({ projectId, sessionId, onError: setSendError });

  // Refs pour capturer reason dans la closure SSE sans dépendance stale
  const streamingReasonRef  = useRef('');
  const abortControllerRef  = useRef(null);

  // ── Scroll du feed ────────────────────────────────────────────────────────
  const feedRef            = useRef(null);
  const initialScrollDone  = useRef(false);
  const [showNewMessage,  setShowNewMessage]  = useState(false);
  const [showDecisions,   setShowDecisions]   = useState(false);


  // ── États édition inline objectif + livrable ──────────────────────────────
  const intentionDropdownRef                            = useRef(null);
  const [editingTask,           setEditingTask]           = useState(false);
  const [taskDraft,             setTaskDraft]             = useState('');
  const [savingTask,            setSavingTask]            = useState(false);
  const [showIntentionDropdown, setShowIntentionDropdown] = useState(false);
  const [savingIntention,       setSavingIntention]       = useState(false);
  const levelsDropdownRef                                 = useRef(null);
  const [showLevelsDropdown,    setShowLevelsDropdown]    = useState(false);

  // Agents en cours de réunion : menu « + Agent », suggestions d'agents — hooks/useMeetingAgents.js
  const {
    dropdownRef, showAgentDropdown, setShowAgentDropdown, availableForAdd, loadingAvailable, addingAgentId,
    dropdownCreateForm, setDropdownCreateForm, agentSuggestions, setAgentSuggestions,
    loadAvailableForAdd, handleAddAgent, handleDropdownCreateAgent, handleInviteSuggested, handleDismissSuggestion, handleCreateAndInvite,
  } = useMeetingAgents({ projectId, sessionId, activeAgents, setActiveAgents, setMessages });

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

  // Réunion conclue (ou abandonnée) : retour au tableau de bord du projet, où se lit la suite
  // (actions, prochaine réunion, développement lancé) — v5.1, 15/10/2026
  // v5.1 (16/10/2026) : avis sur les bulles (préférences apprises) et « Où en est-on ? »
  const [feedback, setFeedback] = useState({});
  useEffect(() => {
    api.get(`/projects/${projectId}/sessions/${sessionId}/feedback`).then(({ data }) => setFeedback(data || {})).catch(() => {});
  }, [projectId, sessionId]);
  const handleFeedback = useCallback(async (messageId, kind) => {
    setFeedback(prev => { const next = { ...prev }; if (kind) next[messageId] = kind; else delete next[messageId]; return next; });
    try { await api.post(`/projects/${projectId}/sessions/${sessionId}/feedback`, { messageId, kind }); }
    catch (err) { notifyError(err, 'Votre avis n’a pas pu être enregistré.'); }
  }, [projectId, sessionId]);
  const [whereBusy, setWhereBusy] = useState(false);
  // v5.1 (étape 3) : vue « salle » (vignettes) — automatique quand le bras droit tient la réunion
  const [visio, setVisio] = useState(false);
  const delegateRunning = !!(session?.prepRunning && session?.runKind === 'delegate');
  const [whisper, setWhisper] = useState('');
  const [whisperBusy, setWhisperBusy] = useState(false);
  const sendWhisper = async () => {
    const text = whisper.trim();
    if (!text || whisperBusy) return;
    setWhisperBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/whisper`, { text });
      setMessages(prev => [...prev, data.message]);
      setWhisper('');
    } catch (err) { notifyError(err, 'Votre mot n’a pas pu être transmis.'); }
    setWhisperBusy(false);
  };
  const takeOver = async () => {
    try {
      await stopPreparation(projectId, sessionId);
      setSession(s => ({ ...s, prepRunning: false }));
      notifySuccess('Vous reprenez la main : le bras droit s’arrête et vous laisse sa note de retour.');
    } catch (err) { notifyError(err, 'La reprise en main a échoué.'); }
  };
  const handleWhere = useCallback(async () => {
    setWhereBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/where`);
      setMessages(prev => [...prev, data.message]);
      setTimeout(() => feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (err) { notifyError(err, 'Le point de situation n’a pas pu être fait.'); }
    setWhereBusy(false);
  }, [projectId, sessionId]);

  const handleSessionClosed = useCallback((newStatus) => {
    setSession(prev => prev ? { ...prev, status: newStatus } : prev);
    setShowCloseModal(false);
    notifySuccess(newStatus === 'accepted' ? 'Réunion conclue : voici la suite du projet.' : 'Réunion abandonnée.');
    navigate(`/projects/${projectId}`);
  }, [navigate, projectId]);

  const handleResetSession = useCallback(async () => {
    setResettingSession(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/reset`);
      setShowResetModal(false);
      setSession(prev => prev ? { ...prev, status: 'open', summary: null } : prev);
      setMessages([]);
    } catch (err) {
      notifyError(err, 'La réunion n’a pas pu être réinitialisée.');
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

  // Menus de l'en-tête : fermeture au clic extérieur
  useClickOutside(intentionDropdownRef, showIntentionDropdown, () => setShowIntentionDropdown(false));
  useClickOutside(menuDotsRef, showMenuDots, () => setShowMenuDots(false));
  useClickOutside(levelsDropdownRef, showLevelsDropdown, () => setShowLevelsDropdown(false));

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

  // ── Question confiée à un autre humain (v5.1) ──────────────────────────────
  // « Laisser répondre quelqu'un » / « Laisser répondre @… » : la réunion attend sa réponse ;
  // la personne reçoit un e-mail et répond depuis la réunion (sa réponse relance les agents).
  const { user: authUser } = useAuth();
  const [participants, setParticipants] = useState([]);
  useEffect(() => {
    api.get(`/projects/${projectId}/sessions/${sessionId}/participants`).then(({ data }) => setParticipants(data)).catch(() => setParticipants([]));
  }, [projectId, sessionId]);
  const handleAssignDecision = useCallback(async (messageId, userId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/assign-decision`, { messageId, userId });
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, ...data.message } : m)));
      notifySuccess(data.message.assignedToName
        ? `Question confiée à ${data.message.assignedToName} : un e-mail lui a été envoyé.`
        : 'Question confiée aux autres participants : un e-mail leur a été envoyé.');
    } catch (err) { notifyError(err, 'La question n’a pas pu être confiée.'); return; }
    const queue = decisionQueueRef.current;
    if (queue.length > 0) { setPendingDecisionId(queue[0].messageId); setDecisionQueue(queue.slice(1)); }
    else setPendingDecisionId(null);
  }, [projectId, sessionId]);
  const handleReclaimDecision = useCallback(async (messageId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/assign-decision`, { messageId, cancel: true });
      setMessages(prev => prev.map(m => (m.id === messageId ? data.message : m)));
    } catch (err) { notifyError(err, 'Opération impossible.'); }
  }, [projectId, sessionId]);
  // v5.1 : contester une réponse donnée par le bras droit en votre absence
  const handleContestDelegate = useCallback(async (messageId) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${sessionId}/contest-decision`, { messageId });
      setMessages(prev => prev.map(m => (m.id === messageId ? data.message : m)));
    } catch (err) { notifyError(err, 'La contestation n’a pas abouti.'); }
  }, [projectId, sessionId]);
  const decisionPeople = {
    others: participants.filter(p => !p.isYou),
    currentUserId: authUser?.id,
    onAssign: handleAssignDecision,
    onReclaim: handleReclaimDecision,
    onContestDelegate: handleContestDelegate,
  };
  // Une question attend un autre humain : la réunion se met à jour seule (sa réponse, puis
  // les agents qui reprennent chez lui) ; suivi prolongé 3 minutes après la réponse
  const watchUntilRef = useRef(0);
  const awaitingHuman = messages.some(m => m.type === 'decision' && m.status === 'awaiting_human');
  if (awaitingHuman) watchUntilRef.current = Date.now() + 3 * 60 * 1000;
  if (session?.prepRunning) watchUntilRef.current = Date.now() + 60 * 1000; // préparation en cours sur le serveur
  useEffect(() => {
    const t = setInterval(() => {
      if (isStreamingRef.current || Date.now() > watchUntilRef.current || document.visibilityState !== 'visible') return;
      api.get(`/projects/${projectId}/sessions/${sessionId}`).then(({ data }) => {
        if (isStreamingRef.current || !Array.isArray(data.messages)) return;
        setSession(prev => (prev && prev.prepRunning !== data.prepRunning ? { ...prev, prepRunning: data.prepRunning, runKind: data.runKind, delegation: data.delegation } : prev));
        const sig = list => list.map(m => `${m.id}:${m.status || ''}`).join(',');
        setMessages(prev => (sig(prev) === sig(data.messages) ? prev : data.messages));
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
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

  const isClosed       = ['accepted', 'abandoned', 'postponed'].includes(session?.status);
  const badge          = STATUS_BADGE[session?.status] || STATUS_BADGE.open;
  const decisions            = messages.filter(m => m.type === 'decision');
  const pendingDecisionCount = decisions.filter(m => ['pending', 'deferred', 'awaiting_human'].includes(m.status)).length;
  const pendingDecisions     = decisions.filter(m => ['pending', 'deferred', 'awaiting_human'].includes(m.status));
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

            } else if (ev.type === 'prep_summary' || ev.type === 'animator') {
              setMessages(prev => [...prev, ev.message]);

            } else if (ev.type === 'suggest_tool') {
              setToolSuggestions(prev => [...prev, ev.tool]);

            } else if (ev.type === 'mission') {
              addMission(ev.mission); // carte « Mission » sous la bulle de l'agent

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
  // v5.1 (15/10/2026) : elle tourne sur le serveur ; l'humain retourne à ses projets
  const handlePrepare = useCallback(async () => {
    try {
      await launchPreparation(projectId, sessionId);
      notifySuccess('Les agents préparent la réunion. Vous la retrouverez signalée dans vos projets quand les conclusions seront prêtes.');
      navigate('/');
    } catch (err) { notifyError(err, err.message); setPrepRequested(false); }
  }, [projectId, sessionId, navigate]);

  // v5.1 : depuis la note de retour du bras droit, « Valider et conclure » ouvre la conclusion
  const openClosureDone = useRef(false);
  useEffect(() => {
    if (openClosureDone.current || loading || !session || !location.state?.openClosure) return;
    openClosureDone.current = true;
    if (!isClosed) setShowCloseModal(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [loading, session, isClosed, location, navigate]);

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
  else if ((prepStarted && !prepSummaryMsg && isStreaming) || session?.prepRunning) phase = 'preparation';
  else if (prepSummaryMsg && pendingPrepDecisions.length > 0)      phase = 'briefing';
  const skippedPhases = prepStarted ? [] : ['preparation', 'briefing'];

  // v5.1 : relevé en direct (panneau) — hypothèses posées et points de vigilance traités
  const shortText = t => { const x = String(t || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); const y = x.charAt(0).toUpperCase() + x.slice(1); return y.length > 180 ? `${y.slice(0, 180).replace(/\s+\S*$/, '')}…` : y; };
  const liveHypotheses = messages.filter(m => m.role === 'agent' && !m.prep && HYPOTHESIS_RE.test(m.content || ''))
    .map(m => ({ id: m.id, agentName: m.agentName, text: shortText((m.content || '').replace(/^\s*hypoth[eè]se\s*:\s*/i, '')) }));
  const liveVigilances = messages.filter(m => m.vigilance && m.vigilance.status !== 'open')
    .map(m => ({ id: m.id, status: m.vigilance.status, text: shortText((m.content || '').replace(/^\s*\*\*Point de vigilance\*\*\s*:\s*/i, '')) }));

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
  // Missions des agents proposées dans cette réunion
  const missionsApi = useMissions(projectId, { sessionId });
  // Mission proposée en réunion : la lancer REPORTE la réunion (reprise au plan une fois le
  // rapport prêt) — pas de mission qui tourne pendant qu'on continue à débattre (v5.1)
  const handleApproveMission = async (mission, level) => {
    if (!confirm(`Lancer la mission « ${mission.title} » et reporter la réunion ?\n\nLa réunion s’arrête ici. Une réunion « Reprendre : … » est ajoutée au plan, juste après ; elle pourra se tenir dès que le rapport de la mission sera prêt, pour trancher avec lui.`)) return;
    const data = await missionsApi.approve(mission, level);
    if (data?.postponed) {
      abortControllerRef.current?.abort();
      setSession(s => ({ ...s, status: 'postponed' }));
      notifySuccess(`Réunion reportée : « ${data.postponed.milestoneTitle} » est ajoutée au plan.`);
    }
  };
  const { addMission } = missionsApi;
  const [missionReport, setMissionReport] = useState(null);

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
    <DecisionPeopleContext.Provider value={decisionPeople}>
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
        onWhere={messages.filter(m => m.role === 'agent').length >= 2 && !isStreaming ? handleWhere : null}
        whereBusy={whereBusy}
        visio={visio || delegateRunning}
        onToggleVisio={delegateRunning ? null : () => setVisio(v => !v)}
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
                hasDevRepo={!!project?.githubRepo}
                suggestClose={suggestClose}
                setSuggestClose={setSuggestClose}
                isClosed={isClosed}
                currentIntention={currentIntention}
                setShowCloseModal={setShowCloseModal}
              />

              {(visio || delegateRunning) && (
                <VisioStrip agents={activeAgents} agentColors={AGENT_COLORS} messages={messages} streamingAgent={streamingAgent} delegateRunning={delegateRunning} />
              )}

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
                  missions={missionsApi.missions}
                  onApproveMission={handleApproveMission}
                  onRejectMission={missionsApi.reject}
                  onOpenMissionReport={setMissionReport}
                  feedback={feedback}
                  onFeedback={handleFeedback}
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

              {delegateRunning ? (
                // Le bras droit tient la réunion : vous suivez en retrait, un mot glissé ou la reprise en main
                <div className="shrink-0 bg-white border-t border-line px-4 py-2">
                  <form className="max-w-[820px] mx-auto flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); sendWhisper(); }}>
                    <span className="w-2.5 h-2.5 rounded-full bg-ai animate-pulse shrink-0" aria-hidden="true" />
                    <label htmlFor="whisper" className="sr-only">Glisser un mot au bras droit</label>
                    <input id="whisper" value={whisper} onChange={e => setWhisper(e.target.value)} maxLength={1000} disabled={whisperBusy}
                      placeholder="Glisser un mot au bras droit, sans reprendre la main…"
                      className="flex-1 min-w-[220px] h-11 border border-line rounded-[10px] px-3 text-sm outline-none focus:ring-2 focus:ring-action-border" />
                    <button type="submit" disabled={!whisper.trim() || whisperBusy} className="h-11 px-3 rounded-[10px] bg-muted-light text-ink-soft text-sm font-bold disabled:opacity-50">Glisser</button>
                    <button type="button" onClick={takeOver} className="h-11 px-4 rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark">Reprendre la main</button>
                  </form>
                </div>
              ) : phase === 'preparation' && (isStreaming || session?.prepRunning) ? (
                // Préparation en cours : pas de saisie (le focus interromprait le débat)
                <div className="shrink-0 bg-white border-t border-line px-4 py-2">
                  <div className="max-w-[820px] mx-auto flex flex-wrap items-center gap-3">
                    <span className="w-4 h-4 border-2 border-ai border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
                    <p className="flex-1 text-sm font-semibold text-ai">{session?.runKind === 'delegate'
                      ? 'Votre bras droit tient la réunion : vous suivez en retrait. Sa note de retour arrivera dans votre conversation avec lui.'
                      : 'Les agents préparent la réunion. Le briefing s’affichera dès qu’ils auront fini ; vous pouvez revenir plus tard.'}</p>
                    <button type="button" onClick={() => (session?.prepRunning
                      ? stopPreparation(projectId, sessionId).then(() => setSession(s => ({ ...s, prepRunning: false }))).catch(err => notifyError(err, 'La préparation n’a pas pu être arrêtée.'))
                      : abortControllerRef.current?.abort())}
                      className="min-h-[36px] text-[13px] font-bold text-ink-muted hover:text-ink">{session?.runKind === 'delegate' ? 'Arrêter la réunion' : 'Arrêter la préparation'}</button>
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
                onIllustrate={(request) => handleSend(`Illustration demandée : ${request}`, { artifactRequest: true })}
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
            hypotheses={liveHypotheses}
            vigilances={liveVigilances}
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
      <ResetMeetingModal busy={resettingSession} onCancel={() => setShowResetModal(false)} onConfirm={handleResetSession} />
    )}

    {/* Rapport d'une mission des agents */}
    {missionReport && (
      <SummaryDisplayModal title={`Mission — ${missionReport.title}`} content={missionReport.report || ''} onClose={() => setMissionReport(null)} />
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
        formatsPath={project?.isDemo ? null : `/projects/${projectId}/sessions/${sessionId}/summary-format`}
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
    </DecisionPeopleContext.Provider>
  );
}
