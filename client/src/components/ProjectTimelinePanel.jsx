import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import ExportModal from './ExportModal';
import SummaryDisplayModal from './SummaryDisplayModal';
import QuickExportModal from './QuickExportModal';
import { SessionDrawer, STATUS_LABELS, TYPE_ICON, TYPE_LABEL, trunc } from './meeting/MilestoneDrawers';
import { InsertButton, InsertForm } from './meeting/MeetingInsertControls';
import { notifyError } from '../utils/notify';

// v5.0 phase 3.2 : decision | claude_code | stack
const TYPES = ['decision', 'claude_code', 'stack'];

const STATUS_DOT = {
  pending:     { cls: 'bg-gray-300' },
  in_progress: { cls: 'bg-blue-500', pulse: true },
  done:        { cls: 'bg-green-500' },
  blocked:     { cls: 'bg-red-400' },
};

// ── Corps partagé desktop / mobile ─────────────────────────────────────────────
function PanelBody({
  projectId, milestones, milestoneSessions,
  loading, showAdd, setShowAdd, onAdd, onMilestoneClick,
  sessionDrawer, setSessionDrawer,
  onRefresh, onDeleteMilestone, onShowDeliverable, navigate, isMobile, devDirectory,
}) {
  const [title, setTitle]           = useState('');
  const [type, setType]             = useState('decision');
  const [saving, setSaving]         = useState(false);
  const [insertingAt, setInsertingAt] = useState(null);
  const [dragId, setDragId]         = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onAdd({ title: title.trim(), type });
    setTitle('');
    setType('decision');
    setSaving(false);
    setShowAdd(false);
  };

  // Réécrit tous les displayOrder en multiples de 10 pour créer de l'espace avant insertion
  const normalizeOrder = async (sorted) => {
    await Promise.all(
      sorted.map((m, i) => api.patch(`/projects/${projectId}/milestones/${m.id}`, { displayOrder: i * 10 }))
    );
  };

  const handleInsert = async ({ title, type }, prevM, nextM) => {
    const sorted = [...milestones].sort((a, b) => a.displayOrder - b.displayOrder);
    let prevOrder = prevM?.displayOrder ?? (nextM ? nextM.displayOrder - 10 : 0);
    let nextOrder = nextM?.displayOrder ?? prevOrder + 100;

    if (nextOrder - prevOrder < 2) {
      await normalizeOrder(sorted);
      const prevIdx = prevM ? sorted.findIndex(m => m.id === prevM.id) : -1;
      const nextIdx = nextM ? sorted.findIndex(m => m.id === nextM.id) : sorted.length;
      prevOrder = prevIdx >= 0 ? prevIdx * 10 : (nextIdx * 10 - 10);
      nextOrder = nextIdx < sorted.length ? nextIdx * 10 : prevOrder + 100;
    }

    const intendedOrder = Math.round((prevOrder + nextOrder) / 2);
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type, displayOrder: intendedOrder });
      setInsertingAt(null);
      onRefresh();
    } catch (err) {
      console.error('[InsertForm] erreur insertion milestone:', err);
    }
  };

  // Drag & drop — les réunions terminées sont verrouillées (3.1)
  const isLocked = (m) => m.status === 'done';

  const handleDragStart = (e, milestoneId) => { e.stopPropagation(); setDragId(milestoneId); };
  const handleDragEnd = () => { setDragId(null); setDragOverId(null); };

  const handleDrop = async (targetId) => {
    if (!dragId || dragId === targetId) { handleDragEnd(); return; }
    const target = milestones.find(m => m.id === targetId);
    const source = milestones.find(m => m.id === dragId);
    if (!target || !source || isLocked(target) || isLocked(source)) { handleDragEnd(); return; }
    const fromIdx = milestones.findIndex(m => m.id === dragId);
    const toIdx   = milestones.findIndex(m => m.id === targetId);
    const reordered = [...milestones];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDragId(null);
    setDragOverId(null);
    try {
      await api.patch(`/projects/${projectId}/milestones/reorder`, { order: reordered.map(m => m.id) });
      onRefresh();
    } catch (err) { console.error('[drag drop]', err.message); }
  };

  const openInsertForm = (order) => { setInsertingAt(order); setShowAdd(false); };

  return (
    <div className="flex flex-col h-full relative">
      {sessionDrawer && (
        <SessionDrawer
          milestone={sessionDrawer.milestone}
          linkedSession={sessionDrawer.linked}
          projectId={projectId}
          navigate={navigate}
          onClose={() => setSessionDrawer(null)}
          onRefresh={onRefresh}
          onShowDeliverable={onShowDeliverable}
          onDeleteMilestone={onDeleteMilestone}
        />
      )}

      <div className="flex-1 overflow-y-auto py-1 px-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-4 h-4 border-2 border-blabia-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : milestones.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8 px-3">
            Aucune réunion —<br />commencez par en créer une
          </p>
        ) : (
          <>
            {insertingAt === 'before-first' ? (
              <InsertForm onSave={(data) => handleInsert(data, null, milestones[0] || null)} onCancel={() => setInsertingAt(null)} />
            ) : (
              <InsertButton alwaysVisible={isMobile} onClick={() => openInsertForm('before-first')} />
            )}

            {milestones.map((m, idx) => {
              const sd      = STATUS_DOT[m.status] || STATUS_DOT.pending;
              const linked  = milestoneSessions[m.id];
              const nextM   = milestones[idx + 1];
              const locked  = isLocked(m);

              return (
                <div
                  key={m.id}
                  onDragOver={(e) => { e.preventDefault(); if (!locked) setDragOverId(m.id); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(m.id); }}
                  onDragEnd={handleDragEnd}
                  className={`rounded-lg transition ${dragOverId === m.id && dragId !== m.id ? 'ring-2 ring-blue-300 ring-inset' : ''}`}
                >
                  {/* Mini-carte réunion */}
                  <div
                    data-tour={m.status === 'in_progress' ? 'plan-current' : undefined}
                    onClick={() => onMilestoneClick(m, linked)}
                    className={`group flex items-center gap-1.5 px-2 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition select-none ${locked ? 'opacity-60' : ''}`}
                    title={m.title}
                  >
                    <div
                      draggable={!locked}
                      onDragStart={(e) => handleDragStart(e, m.id)}
                      onClick={e => e.stopPropagation()}
                      className={`shrink-0 text-sm leading-none select-none ${
                        locked ? 'text-gray-200' : 'text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition'
                      }`}
                      title={locked ? 'Réunion terminée — verrouillée' : 'Glisser pour réorganiser'}
                    >
                      {locked ? '🔒' : '⠿'}
                    </div>
                    <span className="text-sm shrink-0 leading-none">{TYPE_ICON[m.type] || '🤝'}</span>
                    <span className="flex-1 min-w-0 leading-snug">
                      <span className="text-xs text-gray-700 truncate block">{trunc(m.title)}</span>
                      <span className="flex items-center gap-1">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sd.cls} ${sd.pulse ? 'animate-pulse' : ''}`} />
                        <span className="text-[9px] text-gray-400 truncate">{STATUS_LABELS[m.status] || m.status}</span>
                      </span>
                      {m.type === 'claude_code' && (
                        <span className={`text-[9px] truncate block ${devDirectory ? 'text-gray-400' : 'text-orange-400'}`}>
                          📁 {devDirectory ? trunc(devDirectory, 22) : 'Répertoire non défini'}
                        </span>
                      )}
                    </span>
                    {/* Statut de la réunion liée */}
                    {linked ? (
                      <span className="text-[10px] leading-none shrink-0" title={
                        { open: '🔵 Réunion en cours', accepted: '✅ Réunion acceptée', abandoned: '🚫 Réunion abandonnée' }[linked.status] || 'Réunion liée'
                      }>
                        {{ open: '🔵', accepted: '✅', abandoned: '🚫' }[linked.status] || '🔵'}
                      </span>
                    ) : (
                      <span className="text-[10px] leading-none shrink-0 opacity-30" title="Pas encore de réunion">⚪</span>
                    )}
                  </div>

                  {nextM && (
                    insertingAt === m.id ? (
                      <InsertForm onSave={(data) => handleInsert(data, m, nextM)} onCancel={() => setInsertingAt(null)} />
                    ) : (
                      <InsertButton alwaysVisible={isMobile} onClick={() => openInsertForm(m.id)} />
                    )
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-100 px-2 py-2">
        {showAdd ? (
          <form onSubmit={handleSubmit} className="space-y-1.5">
            <input autoFocus type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Titre de la réunion…"
              className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 bg-white"
            />
            <div className="flex gap-1">
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => setType(t)} title={TYPE_LABEL[t]}
                  className={`flex-1 text-sm py-1 rounded-lg border transition ${
                    type === t ? 'bg-blabia-blue border-blabia-blue text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
                  }`}>
                  {TYPE_ICON[t]}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button type="submit" disabled={!title.trim() || saving}
                className="flex-1 text-xs bg-blabia-blue hover:bg-blabia-blue text-white py-1.5 rounded-lg font-medium transition disabled:opacity-50">
                {saving ? '…' : 'Ajouter'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setTitle(''); setType('decision'); }}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
                ✕
              </button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-blabia-blue hover:bg-blue-50 py-2 rounded-lg border border-dashed border-gray-200 hover:border-blue-300 transition font-medium">
            + Ajouter une réunion
          </button>
        )}
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────────────────
// variant : 'panel' (colonne latérale repliable) | 'page' (page Plan, refonte UX v5.1)
export default function ProjectTimelinePanel({ projectId, refreshKey = 0, variant = 'panel' }) {
  const navigate = useNavigate();

  const [isOpen, setIsOpen]                     = useState(true);
  const [milestones, setMilestones]             = useState([]);
  const [milestoneSessions, setMilestoneSessions] = useState({});
  const [loading, setLoading]                   = useState(true);
  const [showAdd, setShowAdd]                   = useState(false);
  const [mobileOpen, setMobileOpen]             = useState(false);
  const [promptViewSession,  setPromptViewSession]  = useState(null); // prompt (deliverable) → ExportModal
  const [summaryViewSession, setSummaryViewSession] = useState(null); // compte-rendu → SummaryDisplayModal
  const [sessionDrawer, setSessionDrawer]             = useState(null); // { milestone, linked }
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
    } catch (err) { notifyError(err, 'Impossible de charger le plan des réunions.'); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadMilestones(); }, [loadMilestones, refreshKey]);

  const handleAdd = async ({ title, type }) => {
    try {
      await api.post(`/projects/${projectId}/milestones`, { title, type });
      loadMilestones();
    } catch (err) { notifyError(err, 'La réunion n’a pas pu être ajoutée au plan.'); }
  };

  const handleDeleteMilestone = useCallback(async (milestoneId) => {
    if (!window.confirm('Supprimer cette réunion ? Cette action est irréversible.')) return;
    try {
      await api.delete(`/projects/${projectId}/milestones/${milestoneId}`);
      loadMilestones();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erreur inconnue';
      alert(`Erreur lors de la suppression : ${msg}`);
    }
  }, [projectId, loadMilestones]);

  // ── Comportement au clic selon le type ──────────────────────────────────────
  const handleMilestoneClick = async (m, linked) => {
    const t = m.type;
    // decision et stack (phase 4 : vraie réunion « Outils », plus de checklist StackCheckModal)
    if (t === 'decision' || t === 'stack') {
      setSessionDrawer({ milestone: m, linked: linked || null });
      return;
    }
    if (t === 'claude_code') {
      if (!linked) {
        setTechChoiceMilestone(m);
      } else {
        setSessionDrawer({ milestone: m, linked });
      }
      return;
    }
    // fallback (anciennes valeurs non encore migrées, défensif)
    setSessionDrawer({ milestone: m, linked: linked || null });
  };

  const doneMilestones = milestones.filter(m => m.status === 'done').length;

  const handleShowDeliverable = (session, type) => {
    if (type === 'claude_code') setPromptViewSession(session);
    else setSummaryViewSession(session);
  };

  const panelBodyProps = {
    projectId, milestones, milestoneSessions,
    loading, showAdd, setShowAdd,
    onAdd: handleAdd,
    onMilestoneClick: handleMilestoneClick,
    sessionDrawer, setSessionDrawer,
    onRefresh: loadMilestones,
    onDeleteMilestone: handleDeleteMilestone,
    onShowDeliverable: handleShowDeliverable,
    navigate, devDirectory,
  };

  const progress = milestones.length > 0 && (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-muted-light rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full bg-ok transition-all" style={{ width: `${Math.round((doneMilestones / milestones.length) * 100)}%` }} />
      </div>
      <span className="text-xs font-bold text-ink-muted shrink-0">{doneMilestones}/{milestones.length} tenues</span>
    </div>
  );

  return (
    <>
      {variant === 'page' ? (
        <div data-tour="plan-list" className="bg-white border border-line rounded-2xl overflow-hidden">
          {progress && <div className="px-4 py-3 border-b border-line">{progress}</div>}
          <div style={{ height: 'calc(100vh - 260px)', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
            <PanelBody {...panelBodyProps} isMobile={false} devDirectory={devDirectory} />
          </div>
        </div>
      ) : (<>
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
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-1">🤝 Réunions</span>
                <span className="text-xs text-gray-400">{milestones.length}</span>
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
        className="lg:hidden fixed bottom-6 right-6 z-40 w-12 h-12 bg-blabia-blue hover:bg-blabia-blue text-white rounded-full shadow-lg flex items-center justify-center text-lg transition"
        title="Réunions du projet">
        🤝
      </button>

      {/* ── Mobile : slide-over ──────────────────────────────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="w-72 bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <span className="text-sm font-semibold text-gray-800">🤝 Réunions</span>
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
      </>)}

      {/* ── ExportModal lecture seule (prompt déjà stocké dans session.deliverable) ── */}
      {promptViewSession && (
        <ExportModal
          directContent={promptViewSession.deliverable || promptViewSession.summary}
          projectId={projectId}
          onClose={() => setPromptViewSession(null)}
        />
      )}

      {/* ── SummaryDisplayModal (compte-rendu) ────────────────────────────── */}
      {summaryViewSession && (
        <SummaryDisplayModal
          title={summaryViewSession.task}
          date={summaryViewSession.createdAt
            ? new Date(summaryViewSession.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
            : ''}
          content={summaryViewSession.summary}
          onClose={() => setSummaryViewSession(null)}
        />
      )}

      {/* ── Choix : mode rapide vs réunion (type claude_code sans session) ── */}
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
              onClick={() => { setQuickExportMilestone(techChoiceMilestone); setTechChoiceMilestone(null); }}
              className="w-full flex items-start gap-3 p-4 border-2 border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100 rounded-xl transition text-left"
            >
              <span className="text-2xl shrink-0 mt-0.5">⚡</span>
              <div>
                <p className="text-sm font-semibold text-violet-900">Générer directement un prompt</p>
                <p className="text-xs text-violet-600 mt-0.5 leading-snug">
                  Créer un prompt Claude Code à partir du titre de la réunion — rapide, sans réunion
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
                <p className="text-xs text-blabia-blue mt-0.5 leading-snug">
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
