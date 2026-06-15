import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import ExportModal from './ExportModal';
import StackCheckModal from './StackCheckModal';
import QuickExportModal from './QuickExportModal';

// ── Configs types (alignés sur intentions v2.1) ───────────────────────────────
const TYPE_ICON = {
  summary:        '📋',
  synthesis:      '📋',
  memory:         '🧠',
  claude_code:    '💻',
  timeline_steps: '📅',
  stack_check:    '🔧',
  milestone:      '🏁',
  // rétrocompat
  meeting:        '🤝',
  technical:      '💻',
};
const TYPE_LABEL = {
  summary:        'Compte-rendu',
  synthesis:      'Compte-rendu',
  memory:         'Souvenir',
  claude_code:    'Claude Code',
  timeline_steps: 'Étapes',
  stack_check:    'Vérif. stack',
  milestone:      'Jalon',
  meeting:        'Compte-rendu',
  technical:      'Claude Code',
};

const TYPES = ['summary', 'claude_code', 'timeline_steps', 'stack_check', 'milestone'];

const STATUS_DOT = {
  pending:     { cls: 'bg-gray-300',  label: 'Pas commencé' },
  in_progress: { cls: 'bg-blue-500',  label: 'En cours',    pulse: true },
  done:        { cls: 'bg-green-500', label: 'Terminé' },
  blocked:     { cls: 'bg-red-400',   label: 'Bloqué' },
};

const STATUS_OPTS   = ['pending', 'in_progress', 'done', 'blocked'];
const STATUS_LABELS = { pending: 'Pas commencé', in_progress: 'En cours', done: 'Terminé', blocked: 'Bloqué' };

function trunc(str, n = 28) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '');
}

// ── Drawer pour type 'milestone' (détail + statut modifiable uniquement) ──────
function MilestoneDetailDrawer({ milestone, projectId, onClose, onRefresh }) {
  const [status, setStatus] = useState(milestone.status);
  const [saving, setSaving] = useState(false);

  const changeStatus = async (s) => {
    setStatus(s);
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}`, { status: s });
      onRefresh();
    } catch {}
    setSaving(false);
  };

  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col rounded-r-xl">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-base leading-none font-bold">←</button>
        <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
          🎯 {trunc(milestone.title, 22)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {milestone.description ? (
          <p className="text-xs text-gray-600 leading-relaxed">{milestone.description}</p>
        ) : (
          <p className="text-xs text-gray-300 italic">Aucune description</p>
        )}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Statut
          </label>
          <select value={status} onChange={e => changeStatus(e.target.value)} disabled={saving}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            {STATUS_OPTS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {milestone.dueDate && (
          <p className="text-xs text-gray-400">
            Échéance : {new Date(milestone.dueDate).toLocaleDateString('fr-FR', {
              day: '2-digit', month: 'short', year: 'numeric'
            })}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Drawer session (meeting / technical) ──────────────────────────────────────
function SessionDrawer({ milestone, linkedSession, projectId, navigate, onClose, onRefresh }) {
  const [status, setStatus] = useState(milestone.status);
  const [saving, setSaving] = useState(false);
  const [pinnedDecisions, setPinnedDecisions] = useState([]);

  // Charger les décisions épinglées si la session liée est un meeting v3.0
  useEffect(() => {
    if (!linkedSession?.id) return;
    api.get(`/projects/${projectId}/sessions/${linkedSession.id}`)
      .then(({ data }) => {
        if (Array.isArray(data.messages)) {
          setPinnedDecisions(data.messages.filter(m => m.pinned && m.role === 'agent'));
        }
      })
      .catch(() => {});
  }, [linkedSession?.id, projectId]);

  const changeStatus = async (s) => {
    setStatus(s);
    setSaving(true);
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestone.id}`, { status: s });
      onRefresh();
    } catch {}
    setSaving(false);
  };

  const sessionDate = linkedSession?.createdAt
    ? new Date(linkedSession.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  // Navigation intelligente : réunion active → /meeting/:sid, sinon → /session/:sid
  const openSessionPath = linkedSession
    ? (linkedSession.mode === 'meeting' && linkedSession.status === 'open'
        ? `/projects/${projectId}/meeting/${linkedSession.id}`
        : `/projects/${projectId}/session/${linkedSession.id}`)
    : null;

  const SESSION_STATUS_LABEL = {
    open:      '🔵 En cours',
    accepted:  '✅ Acceptée',
    abandoned: '🚫 Abandonnée',
    complete:  '✅ Complète',
  };

  return (
    <div className="absolute inset-0 bg-white z-10 flex flex-col rounded-r-xl">
      <div className="flex items-center gap-2 px-3 py-3 border-b border-gray-100 shrink-0">
        <button onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-base leading-none font-bold">←</button>
        <span className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
          {TYPE_ICON[milestone.type]} {trunc(milestone.title, 20)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Badge type */}
        <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {TYPE_ICON[milestone.type]} {TYPE_LABEL[milestone.type]}
        </span>

        {/* Description */}
        {milestone.description ? (
          <p className="text-xs text-gray-600 leading-relaxed">{milestone.description}</p>
        ) : (
          <p className="text-xs text-gray-300 italic">Aucune description</p>
        )}

        {/* Statut */}
        <div>
          <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1.5">
            Statut
          </label>
          <select value={status} onChange={e => changeStatus(e.target.value)} disabled={saving}
            className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            {STATUS_OPTS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        {/* Décisions épinglées (lecture seule) */}
        {pinnedDecisions.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block">
              📌 Décisions
            </label>
            {pinnedDecisions.map((msg, i) => (
              <div key={msg.id || i} className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                <p className="text-[10px] font-semibold text-amber-700 mb-0.5">{msg.agentName}</p>
                <p className="text-xs text-amber-900 leading-relaxed">{msg.content}</p>
              </div>
            ))}
          </div>
        )}

        {/* Action session */}
        {linkedSession ? (
          <div className="space-y-2 pt-1">
            <button
              onClick={() => navigate(openSessionPath)}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              {linkedSession.mode === 'meeting' && linkedSession.status === 'open'
                ? '🏁 Reprendre la réunion'
                : '✓ Voir la réunion'}
            </button>
            <div className="text-xs text-gray-400 text-center">
              {sessionDate} ·{' '}
              <span className="font-medium text-gray-500">
                {SESSION_STATUS_LABEL[linkedSession.status] || linkedSession.status}
              </span>
            </div>
            <button onClick={onClose}
              className="w-full border border-gray-200 text-gray-500 text-xs font-medium py-2 rounded-xl hover:bg-gray-50 transition">
              Annuler
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <button
              onClick={() => navigate(`/projects/${projectId}/meeting/new`, {
                state: {
                  milestoneId:    milestone.id,
                  milestoneTitle: milestone.title,
                  milestoneType:  milestone.type
                }
              })}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2.5 rounded-xl transition flex items-center justify-center gap-1.5"
            >
              🚀 Démarrer une réunion
            </button>
            <button onClick={onClose}
              className="w-full border border-gray-200 text-gray-500 text-xs font-medium py-2 rounded-xl hover:bg-gray-50 transition">
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bouton d'insertion entre étapes ──────────────────────────────────────────
function InsertButton({ onClick, alwaysVisible }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 transition cursor-pointer group ${alwaysVisible || hovered ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-blue-300 transition" />
      <button
        type="button"
        className="w-4 h-4 rounded-full bg-gray-100 group-hover:bg-blue-100 text-gray-400 group-hover:text-blue-500 text-xs flex items-center justify-center shrink-0 transition"
      >
        +
      </button>
      <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-blue-300 transition" />
    </div>
  );
}

// ── Formulaire d'insertion inline ─────────────────────────────────────────────
function InsertForm({ onSave, onCancel }) {
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('synthesis');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ title: title.trim(), type });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-2 my-1 p-2 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
      <input autoFocus type="text" value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Titre de l'étape…"
        className="w-full text-xs border border-blue-200 bg-white rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex gap-1">
        {TYPES.map(t => (
          <button key={t} type="button" onClick={() => setType(t)} title={t}
            className={`flex-1 text-sm py-1 rounded-lg border transition ${
              type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
            }`}>
            {TYPE_ICON[t]}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button type="submit" disabled={!title.trim() || saving}
          className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-medium transition disabled:opacity-50">
          {saving ? '…' : 'Insérer'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
          ✕
        </button>
      </div>
    </form>
  );
}

// ── Corps partagé desktop / mobile ─────────────────────────────────────────────
function PanelBody({
  projectId, milestones, milestoneSessions,
  loading, showAdd, setShowAdd, onAdd, onMilestoneClick,
  detailMilestone, setDetailMilestone,
  sessionDrawer, setSessionDrawer,
  onRefresh, navigate, isMobile, devDirectory,
}) {
  const [title, setTitle]           = useState('');
  const [type, setType]             = useState('synthesis');
  const [saving, setSaving]         = useState(false);
  const [insertingAt, setInsertingAt] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onAdd({ title: title.trim(), type });
    setTitle('');
    setType('synthesis');
    setSaving(false);
    setShowAdd(false);
  };

  // Insertion entre deux étapes : insert + reorder pour conserver des entiers propres
  const handleInsert = async ({ title, type }, targetDisplayOrder) => {
    try {
      const { data } = await api.post(`/projects/${projectId}/milestones`, {
        title, type,
        displayOrder: Math.round(targetDisplayOrder),
      });
      const newList = [...milestones, data].sort((a, b) => a.displayOrder - b.displayOrder);
      await api.patch(`/projects/${projectId}/milestones/reorder`, {
        order: newList.map(m => m.id),
      });
      setInsertingAt(null);
      onRefresh();
    } catch (err) {
      console.error('[InsertForm] erreur insertion milestone:', err);
    }
  };

  const openInsertForm = (order) => {
    setInsertingAt(order);
    setShowAdd(false);
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Drawer détail type 'milestone' */}
      {detailMilestone && (
        <MilestoneDetailDrawer
          milestone={detailMilestone}
          projectId={projectId}
          onClose={() => setDetailMilestone(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* Drawer session (meeting / technical) */}
      {sessionDrawer && (
        <SessionDrawer
          milestone={sessionDrawer.milestone}
          linkedSession={sessionDrawer.linked}
          projectId={projectId}
          navigate={navigate}
          onClose={() => setSessionDrawer(null)}
          onRefresh={onRefresh}
        />
      )}

      {/* Liste des étapes */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8 px-3">
            Aucune étape —<br />commencez par en créer une
          </p>
        ) : (
          <>
            {/* Bouton d'insertion AVANT le premier élément */}
            {insertingAt === 'before-first' ? (
              <InsertForm
                onSave={(data) => handleInsert(data, (milestones[0]?.displayOrder ?? 1) - 1)}
                onCancel={() => setInsertingAt(null)}
              />
            ) : (
              <InsertButton
                alwaysVisible={isMobile}
                onClick={() => openInsertForm('before-first')}
              />
            )}

            {milestones.map((m, idx) => {
              const sd     = STATUS_DOT[m.status] || STATUS_DOT.pending;
              const linked = milestoneSessions[m.id];
              const nextM  = milestones[idx + 1];

              return (
                <div key={m.id}>
                  <div
                    onClick={() => onMilestoneClick(m, linked)}
                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition select-none"
                    title={m.title}
                  >
                    <span className="text-sm shrink-0 leading-none">{TYPE_ICON[m.type] || '🎯'}</span>
                    <span className="flex-1 min-w-0 leading-snug">
                      <span className="text-xs text-gray-700 truncate block">{trunc(m.title)}</span>
                      {(m.type === 'claude_code' || m.type === 'technical') && (
                        <span className={`text-[9px] truncate block ${devDirectory ? 'text-gray-400' : 'text-orange-400'}`}>
                          📁 {devDirectory ? trunc(devDirectory, 22) : 'Répertoire non défini'}
                        </span>
                      )}
                    </span>
                    {/* Statut de la réunion liée */}
                    {linked ? (
                      <span className="text-[10px] leading-none shrink-0" title={
                        { open: '🔵 Réunion en cours', accepted: '✅ Réunion acceptée', abandoned: '🚫 Réunion abandonnée', complete: '✅ Réunion complète' }[linked.status] || 'Réunion liée'
                      }>
                        {{ open: '🔵', accepted: '✅', abandoned: '🚫', complete: '✅' }[linked.status] || '🔵'}
                      </span>
                    ) : (
                      <span className="text-[10px] leading-none shrink-0 opacity-30" title="Pas encore de réunion">⚪</span>
                    )}
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${sd.cls} ${sd.pulse ? 'animate-pulse' : ''}`}
                      title={sd.label}
                    />
                  </div>

                  {/* Bouton d'insertion APRÈS cet élément */}
                  {nextM && (
                    insertingAt === m.id ? (
                      <InsertForm
                        onSave={(data) => handleInsert(data, (m.displayOrder + nextM.displayOrder) / 2)}
                        onCancel={() => setInsertingAt(null)}
                      />
                    ) : (
                      <InsertButton
                        alwaysVisible={isMobile}
                        onClick={() => openInsertForm(m.id)}
                      />
                    )
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Bouton / formulaire "+ Ajouter une étape" */}
      <div className="shrink-0 border-t border-gray-100 px-2 py-2">
        {showAdd ? (
          <form onSubmit={handleSubmit} className="space-y-1.5">
            <input autoFocus type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titre de l'étape…"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
            <div className="flex gap-1">
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => setType(t)} title={t}
                  className={`flex-1 text-sm py-1 rounded-lg border transition ${
                    type === t ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
                  }`}>
                  {TYPE_ICON[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button type="submit" disabled={!title.trim() || saving}
                className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                {saving ? '…' : 'Ajouter'}
              </button>
              <button type="button"
                onClick={() => { setShowAdd(false); setTitle(''); setType('synthesis'); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
                ✕
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 py-2 rounded-lg border border-dashed border-gray-200 hover:border-blue-300 transition font-medium">
            + Ajouter une étape
          </button>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function ProjectTimelinePanel({ projectId, refreshKey = 0 }) {
  const navigate = useNavigate();

  const [isOpen, setIsOpen]                     = useState(true);
  const [milestones, setMilestones]             = useState([]);
  const [milestoneSessions, setMilestoneSessions] = useState({});
  const [loading, setLoading]                   = useState(true);
  const [showAdd, setShowAdd]                   = useState(false);
  const [mobileOpen, setMobileOpen]             = useState(false);
  const [exportSession, setExportSession]             = useState(null);
  const [detailMilestone, setDetailMilestone]         = useState(null);
  const [sessionDrawer, setSessionDrawer]             = useState(null); // { milestone, linked }
  const [stackCheckMilestone, setStackCheckMilestone] = useState(null);
  const [techChoiceMilestone, setTechChoiceMilestone] = useState(null);
  const [quickExportMilestone, setQuickExportMilestone] = useState(null);

  const [devDirectory, setDevDirectory] = useState(null);

  const loadMilestones = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/projects/${projectId}/plan`);
      setMilestones(data.milestones || []);
      setMilestoneSessions(data.milestoneSessions || {});
      if (data.devDirectory !== undefined) setDevDirectory(data.devDirectory);
    } catch {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadMilestones(); }, [loadMilestones, refreshKey]);

  const handleAdd = async ({ title, type }) => {
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type });
      loadMilestones();
    } catch {}
  };

  // Mapping type → intention pour pré-sélection
  const TYPE_TO_INTENTION = {
    summary: 'summary', synthesis: 'summary', meeting: 'summary',
    memory: 'summary',
    claude_code: 'claude_code', technical: 'claude_code',
    timeline_steps: 'timeline_steps',
  };

  // ── Comportement au clic selon le type ──────────────────────────────────────
  const handleMilestoneClick = async (m, linked) => {
    const t = m.type;
    // Types qui ouvrent un drawer session
    if (['summary', 'synthesis', 'memory', 'timeline_steps', 'meeting'].includes(t)) {
      setSessionDrawer({ milestone: m, linked: linked || null, intention: TYPE_TO_INTENTION[t] });
      return;
    }
    // claude_code / technical : choix rapide vs session
    if (['claude_code', 'technical'].includes(t)) {
      if (linked?.hasCode && linked?.summary) {
        setExportSession(linked);
      } else if (linked) {
        setSessionDrawer({ milestone: m, linked, intention: 'claude_code' });
      } else {
        setTechChoiceMilestone(m);
      }
      return;
    }
    if (t === 'stack_check') {
      try {
        const { data: full } = await api.get(`/projects/${projectId}/milestones/${m.id}`);
        setStackCheckMilestone(full);
      } catch { setStackCheckMilestone(m); }
      return;
    }
    if (t === 'milestone') {
      setDetailMilestone(m);
      return;
    }
    // fallback
    setSessionDrawer({ milestone: m, linked: linked || null, intention: 'synthesis' });
  };

  const visibleMilestones = milestones;
  const hiddenCount = 0;
  const doneMilestones = milestones.filter(m => m.status === 'done').length;

  const panelBodyProps = {
    projectId, milestones: visibleMilestones, milestoneSessions,
    loading, showAdd, setShowAdd,
    onAdd: handleAdd,
    onMilestoneClick: handleMilestoneClick,
    detailMilestone, setDetailMilestone,
    sessionDrawer, setSessionDrawer,
    onRefresh: loadMilestones,
    navigate, devDirectory,
  };

  return (
    <>
      {/* ── Desktop ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex items-start shrink-0 sticky top-6 self-start">
        <button onClick={() => setIsOpen(p => !p)}
          title={isOpen ? 'Fermer le panel' : 'Ouvrir le panel'}
          className="flex items-center justify-center w-5 h-8 bg-white border border-gray-200 rounded-l-lg shadow-sm text-gray-400 hover:text-blue-500 text-xs transition shrink-0 mt-2">
          {isOpen ? '›' : '‹'}
        </button>

        <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'w-64' : 'w-0'}`}>
          <div className="w-64 bg-white border border-gray-200 border-l-0 rounded-r-xl shadow-sm"
               style={{ minHeight: '320px', maxHeight: 'calc(100vh - 120px)' }}>
            <div className="px-3 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">⏱ Timeline</span>
                <span className="text-xs text-gray-400">{visibleMilestones.length}</span>
              </div>
              {milestones.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
                    <div className="h-1 rounded-full bg-green-500 transition-all"
                      style={{ width: `${Math.round((doneMilestones / milestones.length) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">{doneMilestones}/{milestones.length}</span>
                </div>
              )}
            </div>
            <div style={{ height: 'calc(100vh - 120px - 44px)', display: 'flex', flexDirection: 'column' }}>
              <PanelBody {...panelBodyProps} isMobile={false} devDirectory={devDirectory} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile : bouton flottant ─────────────────────────────────────── */}
      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-6 right-6 z-40 w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center text-lg transition"
        title="Timeline du projet">
        ⏱
      </button>

      {/* ── Mobile : slide-over ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-800">⏱ Timeline</span>
              <button onClick={() => setMobileOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <PanelBody {...panelBodyProps} isMobile={true} devDirectory={devDirectory} />
            </div>
          </div>
        </div>
      )}

      {/* ── ExportModal (type technical avec session hasCode) ────────────── */}
      {exportSession && (
        <ExportModal
          summary={exportSession.summary}
          projectId={projectId}
          onClose={() => setExportSession(null)}
        />
      )}

      {/* ── StackCheckModal (type stack_check) ───────────────────────────── */}
      {stackCheckMilestone && (
        <StackCheckModal
          milestone={stackCheckMilestone}
          projectId={projectId}
          onClose={() => setStackCheckMilestone(null)}
          onRefresh={loadMilestones}
        />
      )}

      {/* ── Choix : mode rapide vs réunion (type technical sans session) ─── */}
      {techChoiceMilestone && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">💻</span>
              <h2 className="text-sm font-bold text-gray-900 flex-1 leading-snug truncate">
                {techChoiceMilestone.title}
              </h2>
              <button onClick={() => setTechChoiceMilestone(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0">
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500">Comment voulez-vous avancer sur cette tâche technique ?</p>

            <button
              onClick={() => {
                setQuickExportMilestone(techChoiceMilestone);
                setTechChoiceMilestone(null);
              }}
              className="w-full flex items-start gap-3 p-4 border-2 border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100 rounded-xl transition text-left"
            >
              <span className="text-2xl shrink-0 mt-0.5">⚡</span>
              <div>
                <p className="text-sm font-semibold text-violet-900">Générer directement un prompt</p>
                <p className="text-xs text-violet-600 mt-0.5 leading-snug">
                  Créer un prompt Claude Code à partir du titre de l'étape — rapide, sans réunion
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                navigate(`/projects/${projectId}/meeting/new`, {
                  state: {
                    milestoneId:    techChoiceMilestone.id,
                    milestoneTitle: `Implémenter : ${techChoiceMilestone.title}`,
                    milestoneType:  techChoiceMilestone.type
                  }
                });
                setTechChoiceMilestone(null);
              }}
              className="w-full flex items-start gap-3 p-4 border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 rounded-xl transition text-left"
            >
              <span className="text-2xl shrink-0 mt-0.5">🚀</span>
              <div>
                <p className="text-sm font-semibold text-blue-900">Démarrer une réunion</p>
                <p className="text-xs text-blue-600 mt-0.5 leading-snug">
                  Lancer une réunion d'agents pour explorer la tâche et préparer l'implémentation
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── QuickExportModal (mode rapide sans session) ──────────────────── */}
      {quickExportMilestone && (
        <QuickExportModal
          milestone={quickExportMilestone}
          projectId={projectId}
          onClose={() => setQuickExportMilestone(null)}
          onRefresh={loadMilestones}
        />
      )}
    </>
  );
}
