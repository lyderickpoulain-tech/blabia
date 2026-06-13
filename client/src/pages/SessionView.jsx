import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import AcceptSessionModal from '../components/AcceptSessionModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ProjectLayout from '../components/ProjectLayout';
import ExportModal from '../components/ExportModal';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';

// ── Palette agents ─────────────────────────────────────────────────────────────
const PALETTE = {
  Analyste:     { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-800',   dot: 'bg-blue-500' },
  Créatif:      { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-500' },
  Critique:     { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500' },
  Expert:       { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-800',  dot: 'bg-green-500' },
  Synthésiseur: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', dot: 'bg-indigo-500' },
  Chercheur:    { bg: 'bg-cyan-50',   border: 'border-cyan-200',   text: 'text-cyan-800',   dot: 'bg-cyan-500' },
  Stratège:     { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-800',   dot: 'bg-rose-500' },
  Rédacteur:    { bg: 'bg-pink-50',   border: 'border-pink-200',   text: 'text-pink-800',   dot: 'bg-pink-500' },
};
const DEFAULT_P = { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', dot: 'bg-gray-400' };
const col = (name) => PALETTE[name] || DEFAULT_P;

// ── Composants Markdown ────────────────────────────────────────────────────────
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
  hr:         () => <hr className="my-5 border-gray-200" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-200 pl-4 my-3 text-gray-600 italic text-sm">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4">
      <table className="text-sm w-full border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="text-left font-semibold text-gray-700 px-3 py-2 bg-gray-50 border border-gray-200">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border border-gray-200 text-gray-700">{children}</td>,
};

// ── Bulles d'échange ───────────────────────────────────────────────────────────
function AgentBubble({ agentName, content }) {
  const c = col(agentName);
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-8 h-8 rounded-full ${c.dot} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
        {agentName[0]}
      </div>
      <div className={`flex-1 rounded-2xl rounded-tl-sm px-4 py-3 border ${c.bg} ${c.border}`}>
        <p className={`text-xs font-semibold ${c.text} mb-1.5`}>{agentName}</p>
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{content}</p>
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

// ── Timeline persistante ───────────────────────────────────────────────────────

const TL_TYPE = {
  team_formation: { icon: '🤝', defaultLabel: 'Formation de l\'équipe' },
  agent_turn:     { icon: '💬', defaultLabel: 'Agent' },
  question:       { icon: '❓', defaultLabel: 'Question' },
  synthesis:      { icon: '✨', defaultLabel: 'Synthèse finale' },
  export:         { icon: '💻', defaultLabel: 'Export Claude Code' },
  implementation: { icon: '✅', defaultLabel: 'Implémentation' },
};

const TL_STATUS = {
  pending:     { dot: 'bg-gray-300',  badge: 'bg-gray-100 text-gray-500 border-gray-200',    label: 'Pas commencé', pulse: false },
  in_progress: { dot: 'bg-blue-500',  badge: 'bg-blue-100 text-blue-600 border-blue-200',    label: 'En cours',     pulse: true  },
  done:        { dot: 'bg-green-500', badge: 'bg-green-100 text-green-700 border-green-200', label: 'Terminé',      pulse: false },
  blocked:     { dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700 border-red-200',       label: 'Bloqué',       pulse: false },
};

function SessionTimeline({ entries, onExportClick, onImplementationClick }) {
  if (!entries || entries.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-400 text-sm">Aucune étape enregistrée pour cette session</p>
        <p className="text-xs text-gray-300 mt-1">La timeline se remplit automatiquement lors du run</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-4 bottom-4 w-px bg-gray-100" />
      <div className="space-y-0.5">
        {entries.map((entry, i) => {
          const tc = TL_TYPE[entry.type] || { icon: '•', defaultLabel: entry.type };
          const sc = TL_STATUS[entry.status] || TL_STATUS.pending;
          const isClickable = entry.type === 'export' || entry.type === 'implementation';
          const label = entry.label || tc.defaultLabel;
          const ts = entry.timestamp
            ? new Date(entry.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : '';

          return (
            <div key={entry.id || i} className="relative flex items-start gap-3 py-2">
              <div className={`relative z-10 w-8 h-8 rounded-full ${sc.dot} flex items-center justify-center text-sm shrink-0 ring-2 ring-white shadow-sm ${sc.pulse ? 'animate-pulse' : ''}`}>
                <span>{tc.icon}</span>
              </div>
              <div
                className={`flex-1 min-w-0 py-0.5 ${isClickable ? 'cursor-pointer group' : ''}`}
                onClick={() => {
                  if (entry.type === 'export') onExportClick?.();
                  if (entry.type === 'implementation') onImplementationClick?.();
                }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className={`text-sm font-medium leading-snug ${isClickable ? 'text-blue-700 group-hover:underline' : 'text-gray-800'}`}>
                    {label}
                    {isClickable && <span className="ml-1 text-xs text-blue-400">→</span>}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {ts && <span className="text-xs text-gray-400">{ts}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${sc.badge}`}>{sc.label}</span>
                  </div>
                </div>
                {entry.meta?.question && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{entry.meta.question}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Modale suppression session ─────────────────────────────────────────────────
function DeleteSessionModal({ onClose, onConfirm, deleting }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Supprimer la session</h2>
            <p className="text-xs text-gray-500 mt-0.5">Cette action est irréversible</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-5">
          Cette session sera définitivement supprimée. Les sessions de continuation créées depuis celle-ci resteront accessibles, sans lien parent.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl transition text-sm font-medium disabled:opacity-50"
          >
            {deleting ? 'Suppression…' : 'Supprimer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function SessionView() {
  const { id: projectId, sid: sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [session, setSession]                 = useState(null);
  const [milestone, setMilestone]             = useState(null);
  const [loading, setLoading]                 = useState(true);
  const [activeTab, setActiveTab]             = useState('restitution');
  const [timeline, setTimeline]               = useState([]);
  const [showExchanges, setShowExchanges]     = useState(false);
  const [showContinue, setShowContinue]       = useState(false);
  const [continueTask, setContinueTask]       = useState('');
  const [showExport, setShowExport]           = useState(false);
  const [showCodeConfirm, setShowCodeConfirm] = useState(false);
  const [savingCodeStatus, setSavingCodeStatus] = useState(false);
  const [showDelete, setShowDelete]           = useState(false);
  const [deleting, setDeleting]               = useState(false);
  const [planSuggestions, setPlanSuggestions] = useState(null);
  const [planAlreadyAdded, setPlanAlreadyAdded] = useState(false);
  const [addingToPlan, setAddingToPlan]       = useState(false);
  const [addedToPlan, setAddedToPlan]         = useState(false);
  const [planIgnored, setPlanIgnored]         = useState(false);
  const [projectMilestones, setProjectMilestones] = useState([]);
  const [sessionStatus, setSessionStatus]         = useState(null);
  const [showAcceptModal, setShowAcceptModal]     = useState(false);
  const [abandonConfirm, setAbandonConfirm]       = useState(false);

  useEffect(() => {
    api.get(`/projects/${projectId}/sessions/${sessionId}`)
      .then(async ({ data }) => {
        setSession(data);
        setSessionStatus(data.status);
        setTimeline(Array.isArray(data.timeline) ? data.timeline : []);
        if (data.planSuggestions?.milestones?.length > 0) {
          setPlanSuggestions(data.planSuggestions);
        }
        setPlanAlreadyAdded(data.planAlreadyAdded || false);
        // Milestones du projet pour résumé timeline
        try {
          const { data: planData } = await api.get(`/projects/${projectId}/plan`);
          setProjectMilestones(planData.milestones || []);
        } catch {}
        if (data.milestoneId) {
          try {
            const { data: ms } = await api.get(`/projects/${projectId}/milestones/${data.milestoneId}`);
            setMilestone(ms);
          } catch {}
        }
      })
      .catch(() => navigate(`/projects/${projectId}`))
      .finally(() => setLoading(false));
  }, [projectId, sessionId]);

  const handleAddToPlan = async () => {
    if (addingToPlan || !planSuggestions) return;
    setAddingToPlan(true);
    try {
      await api.post(`/projects/${projectId}/plan/bulk`, {
        milestones:       planSuggestions.milestones       || [],
        standalone_todos: planSuggestions.standalone_todos || [],
        sessionId:        sessionId,
        sourceSessionId:  sessionId
      });
      setAddedToPlan(true);
    } catch (err) {
      console.error('[addToPlan]', err.message);
    } finally {
      setAddingToPlan(false);
    }
  };

  const handleDeleteSession = async () => {
    setDeleting(true);
    try {
      await api.delete(`/projects/${projectId}/sessions/${sessionId}`);
      navigate(`/projects/${projectId}`);
    } catch {
      alert('Erreur lors de la suppression');
      setDeleting(false);
    }
  };

  const handleCodeStatus = async (status) => {
    if (savingCodeStatus) return;
    setSavingCodeStatus(true);
    try {
      await api.patch(`/projects/${projectId}/sessions/${sessionId}/code-status`, { status });
      setSession(prev => ({ ...prev, codeStatus: status }));
      // Ajouter l'entrée implementation dans la timeline locale
      const implEntry = {
        id: `impl-${Date.now()}`,
        type: 'implementation',
        label: status === 'implemented' ? 'Code implémenté et commité' : 'Code non généré',
        status: status === 'implemented' ? 'done' : 'blocked',
        timestamp: new Date().toISOString(),
        meta: { codeStatus: status }
      };
      setTimeline(prev => [...prev, implEntry]);
      setShowCodeConfirm(false);
    } catch (err) {
      console.error('[code-status]', err.message);
    } finally {
      setSavingCodeStatus(false);
    }
  };

  const recordExportEvent = async () => {
    const entry = {
      type: 'export',
      label: 'Export Claude Code',
      status: 'done',
      timestamp: new Date().toISOString(),
      meta: {}
    };
    setTimeline(prev => [...prev, entry]);
    try {
      await api.post(`/projects/${projectId}/sessions/${sessionId}/timeline-event`, entry);
    } catch {}
  };

  if (loading) {
    return (
      <ProjectLayout projectId={projectId}>
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </ProjectLayout>
    );
  }

  if (!session) return null;

  const currentStatus = sessionStatus || session.status;
  const isComplete    = ['open', 'accepted', 'abandoned', 'complete'].includes(currentStatus) && session.summary;
  const isRealtime    = session.mode === 'realtime';
  const agents        = Array.isArray(session.agents)    ? session.agents    : [];
  const exchanges     = Array.isArray(session.exchanges) ? session.exchanges : [];
  const agentExchanges = exchanges.filter(e => e.type === 'agent' || e.type === 'human');
  const date = new Date(session.createdAt).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  return (
    <ProjectLayout projectId={projectId}>
      <div className="max-w-2xl mx-auto space-y-4">

        {/* Navigation / breadcrumb */}
        {milestone ? (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap">
            <Link to={`/projects/${projectId}`} className="hover:text-gray-700 transition">← Projet</Link>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-700 truncate max-w-xs">
              {({ meeting: '🤝', technical: '💻', stack_check: '🔧', milestone: '🎯' })[milestone.type] || '🎯'}
              {' '}{milestone.title}
            </span>
          </div>
        ) : (
          <Link to={`/projects/${projectId}`} className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700">
            ← Retour au projet
          </Link>
        )}

        {/* Carte principale : en-tête + onglets + contenu */}
        <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isComplete ? 'border-gray-200' : 'border-orange-200'}`}>

          {/* En-tête session */}
          <div className={`px-6 py-5 border-b ${isComplete ? 'bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {isComplete
                    ? <>
                        {currentStatus === 'accepted' && <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">✅ Acceptée</span>}
                        {currentStatus === 'open' && <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full animate-pulse">⚪ En cours</span>}
                        {currentStatus === 'abandoned' && <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full line-through">🚫 Abandonnée</span>}
                        {(currentStatus === 'complete' || !['open','accepted','abandoned'].includes(currentStatus)) && <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">✅ Acceptée</span>}
                      </>
                    : <span className="text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                        ⚠ Interrompue
                      </span>
                  }
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    isRealtime ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}>
                    {isRealtime ? '⚡ Temps réel' : '📋 Résumé'}
                  </span>
                </div>
                <p className="text-xs text-gray-500">{date}</p>
              </div>
            </div>

            <h1 className="font-bold text-gray-900 text-base leading-snug mb-3">{session.task}</h1>

            {/* Chips agents */}
            <div className="flex flex-wrap gap-1.5">
              {agents.map((agent, i) => {
                const p = col(agent.name);
                return (
                  <span key={i} className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${p.bg} ${p.border} ${p.text}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                    {agent.name}
                  </span>
                );
              })}
            </div>

            {/* Résumé timeline du projet */}
            {projectMilestones.length > 0 && (() => {
              const done = projectMilestones.filter(m => m.status === 'done').length;
              const inProgress = projectMilestones.filter(m => m.status === 'in_progress').length;
              const STATUS_DOT = { done: 'bg-green-500', in_progress: 'bg-blue-500', blocked: 'bg-red-400', pending: 'bg-gray-300' };
              if (projectMilestones.length <= 3) {
                return (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {projectMilestones.map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-xs bg-white/60 border border-white/40 px-2 py-0.5 rounded-full text-blue-700">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[m.status] || 'bg-gray-300'}`} />
                        {m.title.length > 28 ? m.title.slice(0, 28) + '…' : m.title}
                      </span>
                    ))}
                  </div>
                );
              }
              return (
                <div className="flex items-center gap-2 mt-2 text-xs text-blue-600">
                  <span>{projectMilestones.length} étapes</span>
                  {done > 0 && <span>· {done} terminée{done > 1 ? 's' : ''}</span>}
                  {inProgress > 0 && <span>· {inProgress} en cours</span>}
                  <Link to={`/projects/${projectId}/plan`} className="ml-1 font-medium hover:underline">Voir la timeline →</Link>
                </div>
              );
            })()}

            {/* Badge statut code */}
            {session.hasCode && (
              <div className="mt-2">
                {session.codeStatus === 'implemented' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-green-100 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                    ✅ Implémenté
                  </span>
                )}
                {session.codeStatus === 'not_generated' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-100 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    ❌ Non généré
                  </span>
                )}
                {!session.codeStatus && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full">
                    ⏳ En attente
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Onglets Restitution / Timeline */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('restitution')}
              className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px ${
                activeTab === 'restitution'
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Restitution
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 py-3 text-sm font-medium transition border-b-2 -mb-px flex items-center justify-center gap-1.5 ${
                activeTab === 'timeline'
                  ? 'border-blue-500 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>⏱</span>
              Timeline
              {timeline.length > 0 && (
                <span className="text-xs font-normal text-gray-400">({timeline.length})</span>
              )}
            </button>
          </div>

          {/* Contenu onglet Restitution */}
          {activeTab === 'restitution' && (
            <div className="px-6 py-5">
              {isComplete && session.summary ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>
                  {session.summary}
                </ReactMarkdown>
              ) : (
                <div className="text-center py-6">
                  <p className="text-orange-600 font-medium text-sm mb-1">⚠ Session interrompue</p>
                  <p className="text-gray-400 text-xs">
                    Cette session n'a pas été finalisée. Aucune restitution n'est disponible.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Contenu onglet Timeline */}
          {activeTab === 'timeline' && (
            <div className="px-6 py-5">
              <SessionTimeline
                entries={timeline}
                onExportClick={() => {
                  setActiveTab('restitution');
                  setShowExport(true);
                  setShowCodeConfirm(true);
                }}
                onImplementationClick={() => {
                  setActiveTab('restitution');
                  setShowCodeConfirm(true);
                }}
              />
            </div>
          )}
        </div>

        {/* Échanges (mode temps réel, optionnel) — onglet Restitution uniquement */}
        {activeTab === 'restitution' && isRealtime && agentExchanges.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <button
              onClick={() => setShowExchanges(p => !p)}
              className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <span className="flex items-center gap-2">
                <span>💬</span>
                Échanges des agents
                <span className="text-xs font-normal text-gray-400">({agentExchanges.length} contribution{agentExchanges.length !== 1 ? 's' : ''})</span>
              </span>
              <span className={`text-gray-400 transition-transform ${showExchanges ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {showExchanges && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                {agentExchanges.map((ex, i) =>
                  ex.type === 'agent'
                    ? <AgentBubble key={i} agentName={ex.agent} content={ex.content} />
                    : <HumanBubble key={i} content={ex.content} />
                )}
              </div>
            )}
          </div>
        )}

        {/* Continuation de session */}
        {isComplete && showContinue && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Suite de cette session</h3>
            <p className="text-xs text-gray-400 mb-3">Les agents reprendront avec le contexte complet de la session précédente.</p>
            <textarea
              value={continueTask}
              onChange={e => setContinueTask(e.target.value)}
              rows={4}
              autoFocus
              placeholder="Décrivez la suite à donner à cette session…"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={() => { setShowContinue(false); setContinueTask(''); }}
                className="flex-1 border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition"
              >
                Annuler
              </button>
              <button
                disabled={!continueTask.trim()}
                onClick={() => navigate(`/projects/${projectId}/session/new`, {
                  state: { parentSessionId: sessionId, initialTask: continueTask.trim() }
                })}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                Lancer la suite →
              </button>
            </div>
          </div>
        )}

        {/* Plan généré par les agents */}
        {isComplete && planSuggestions && !planIgnored && !addedToPlan && !planAlreadyAdded && (
          <div className="bg-white rounded-2xl border border-blue-200 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              📋 Plan généré par les agents
              <span className="text-xs font-normal text-gray-400">
                {(planSuggestions.milestones || []).length} jalon{(planSuggestions.milestones || []).length !== 1 ? 's' : ''}
              </span>
            </h3>
            <div className="space-y-1.5">
              {(planSuggestions.milestones || []).map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="shrink-0">
                    {{ meeting: '🤝', technical: '💻', stack_check: '🔧', milestone: '🎯' }[m.type] || '🎯'}
                  </span>
                  <span>{m.title}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAddToPlan}
                disabled={addingToPlan}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                {addingToPlan ? 'Ajout…' : '+ Ajouter à la timeline'}
              </button>
              <button
                onClick={() => setPlanIgnored(true)}
                className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-medium py-2.5 px-4 rounded-xl text-sm transition"
              >
                Ignorer
              </button>
            </div>
          </div>
        )}

        {isComplete && planSuggestions && (addedToPlan || planAlreadyAdded) && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
              </svg>
              <span className="text-sm font-semibold text-green-800">Plan ajouté à la timeline</span>
            </div>
            <Link
              to={`/projects/${projectId}/plan`}
              className="text-sm font-medium text-green-800 hover:underline shrink-0"
            >
              Voir le plan →
            </Link>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {isComplete && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link
                to={`/projects/${projectId}/session/${sessionId}/summary`}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Voir le compte-rendu
              </Link>
              <button
                onClick={() => setShowContinue(v => !v)}
                className="flex items-center justify-center gap-2 border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-semibold py-3 rounded-xl transition text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                Continuer cette session
              </button>
            </div>
          )}
          {!isComplete && (
            <Link
              to={`/projects/${projectId}/session/new`}
              className="flex items-center justify-center gap-2 border border-gray-300 text-gray-700 hover:bg-gray-50 font-semibold py-3 rounded-xl transition text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle session
            </Link>
          )}

          {/* Exporter vers Claude Code — conditionnel hasCode */}
          {isComplete && session.hasCode && session.summary && (
            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowExport(true);
                  setShowCodeConfirm(true);
                  recordExportEvent();
                }}
                className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium py-3 rounded-xl transition text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Exporter vers Claude Code
              </button>

              {showCodeConfirm && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-600 text-center">Le code a-t-il été implémenté ?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCodeStatus('implemented')}
                      disabled={savingCodeStatus}
                      className="flex-1 bg-green-50 hover:bg-green-100 border border-green-300 text-green-700 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                    >
                      ✅ Code implémenté et commité
                    </button>
                    <button
                      onClick={() => handleCodeStatus('not_generated')}
                      disabled={savingCodeStatus}
                      className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 font-medium py-2.5 rounded-xl transition text-sm disabled:opacity-50"
                    >
                      ❌ Ce code n'a pas été généré
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Boutons de conclusion (Évolution 1) */}
          {isComplete && currentStatus === 'open' && (
            <div className="space-y-2">
              {!abandonConfirm ? (
                <div className="flex gap-2">
                  <button onClick={() => setShowAcceptModal(true)}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm transition flex items-center justify-center gap-2">
                    ✅ Accepter cette session
                  </button>
                  <button onClick={() => setAbandonConfirm(true)}
                    className="border border-gray-300 text-gray-500 hover:bg-gray-50 font-medium py-3 px-4 rounded-xl text-sm transition">
                    🚫 Abandonner
                  </button>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <p className="text-sm text-gray-600">Cette session sera close sans impact sur le projet.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setAbandonConfirm(false)}
                      className="flex-1 border border-gray-200 text-gray-600 py-2 rounded-xl text-sm">Annuler</button>
                    <button onClick={async () => {
                      await api.patch(`/projects/${projectId}/sessions/${sessionId}/status`, { status: 'abandoned' }).catch(() => {});
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

          <Link
            to={`/projects/${projectId}`}
            className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition py-1"
          >
            ← Retour au projet
          </Link>

          <button
            onClick={() => setShowDelete(true)}
            className="text-xs text-red-400 hover:text-red-600 transition py-1"
          >
            Supprimer cette session
          </button>
        </div>

      </div>

      {showExport && session.summary && (
        <ExportModal summary={session.summary} projectId={projectId} onClose={() => setShowExport(false)} />
      )}
      {showDelete && (
        <DeleteSessionModal
          onClose={() => setShowDelete(false)}
          onConfirm={handleDeleteSession}
          deleting={deleting}
        />
      )}
      {showAcceptModal && session && (
        <AcceptSessionModal
          session={session}
          projectId={projectId}
          planSuggestions={planSuggestions}
          onClose={() => setShowAcceptModal(false)}
          onAccepted={() => { setSessionStatus('accepted'); setShowAcceptModal(false); }}
        />
      )}
    </ProjectLayout>
  );
}
