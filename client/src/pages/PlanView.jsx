import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProjectLayout from '../components/ProjectLayout';
import api from '../utils/api';
import SummaryDisplayModal from '../components/SummaryDisplayModal';
import ExportModal from '../components/ExportModal';
import TimelineStepsModal from '../components/TimelineStepsModal';

// ── Constantes statut ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { label: 'Pas commencé', dot: 'bg-gray-300',    ring: 'ring-gray-300',    badge: 'bg-gray-100 text-gray-600 border-gray-200',    icon: '⬜' },
  in_progress: { label: 'En cours',     dot: 'bg-blue-500',    ring: 'ring-blue-300',    badge: 'bg-blue-100 text-blabia-blue border-blue-200',    icon: '🔵' },
  done:        { label: 'Terminé',      dot: 'bg-green-500',   ring: 'ring-green-300',   badge: 'bg-green-100 text-green-700 border-green-200',  icon: '✅' },
  blocked:     { label: 'Bloqué',       dot: 'bg-red-400',     ring: 'ring-red-300',     badge: 'bg-red-100 text-red-700 border-red-200',        icon: '🔴' },
};
const STATUSES = ['pending', 'in_progress', 'done', 'blocked'];

// ── Types d'étapes ────────────────────────────────────────────────────────────
const MILESTONE_TYPE_CONFIG = {
  summary:        { label: 'Compte-rendu',  icon: '📋', borderColor: 'border-l-blue-400' },
  claude_code:    { label: 'Claude Code',   icon: '💻', borderColor: 'border-l-violet-400' },
  timeline_steps: { label: 'Étapes',        icon: '📅', borderColor: 'border-l-yellow-400' },
  stack_check:    { label: 'Vérif. stack',  icon: '🔧', borderColor: 'border-l-orange-400' },
  milestone:      { label: 'Jalon',         icon: '🏁', borderColor: 'border-l-gray-300' },
  // rétrocompat
  synthesis:      { label: 'Compte-rendu',  icon: '📋', borderColor: 'border-l-blue-400' },
  memory:         { label: 'Compte-rendu',  icon: '📋', borderColor: 'border-l-blue-400' },
  meeting:        { label: 'Compte-rendu',  icon: '📋', borderColor: 'border-l-blue-400' },
  technical:      { label: 'Claude Code',   icon: '💻', borderColor: 'border-l-violet-400' },
};
// Types actifs pour la création (milestone et timeline_steps conservés dans MILESTONE_TYPE_CONFIG pour rétrocompat)
const MILESTONE_TYPES = ['summary', 'claude_code', 'stack_check'];

const DELIVERABLE_LABEL = {
  summary: '📋 Voir le compte-rendu', synthesis: '📋 Voir le compte-rendu',
  memory: '📋 Voir le compte-rendu', meeting: '📋 Voir le compte-rendu',
  claude_code: '💻 Voir le prompt', technical: '💻 Voir le prompt',
  timeline_steps: '📅 Voir les étapes',
};

// ── Composants helpers ─────────────────────────────────────────────────────────

function StatusSelector({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:ring-2 focus:ring-blabia-blue outline-none cursor-pointer"
    >
      {STATUSES.map(s => (
        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
      ))}
    </select>
  );
}

// ── Formulaire d'insertion de jalon ───────────────────────────────────────────
function InsertMilestoneForm({ onSave, onCancel }) {
  const [title, setTitle]     = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType]       = useState('summary');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ title: title.trim(), dueDate: dueDate || null, type });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 my-2 space-y-2">
      {/* Sélecteur de type */}
      <div className="flex gap-1 flex-wrap">
        {MILESTONE_TYPES.map(t => {
          const tc = MILESTONE_TYPE_CONFIG[t];
          return (
            <button key={t} type="button" onClick={() => setType(t)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition ${
                type === t
                  ? 'bg-blabia-blue text-white border-blabia-blue'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              <span>{tc.icon}</span>
              <span className="hidden sm:inline">{tc.label}</span>
            </button>
          );
        })}
      </div>
      {/* Titre + date + actions */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Titre de l'étape…"
          className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
        />
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="text-xs border border-blue-200 bg-white rounded-lg px-2 py-1 outline-none text-gray-600 hidden sm:block"
        />
        <button type="submit" disabled={!title.trim() || saving}
          className="text-xs bg-blabia-blue hover:bg-blabia-blue text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
          {saving ? '…' : 'Ajouter'}
        </button>
        <button type="button" onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
          ✕
        </button>
      </div>
    </form>
  );
}

// ── Bouton d'insertion entre jalons ───────────────────────────────────────────
function InsertButton({ onClick }) {
  return (
    <div className="flex items-center gap-2 my-1 group pl-8">
      <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-100 transition" />
      <button
        onClick={onClick}
        className="text-xs text-gray-300 hover:text-blue-500 hover:bg-blue-50 w-6 h-6 rounded-full border border-dashed border-gray-200 hover:border-blue-300 flex items-center justify-center transition font-bold"
        title="Insérer un jalon ici"
      >
        +
      </button>
      <div className="flex-1 h-px bg-gray-100 group-hover:bg-blue-100 transition" />
    </div>
  );
}

// ── Carte d'un jalon ──────────────────────────────────────────────────────────
function MilestoneCard({
  milestone,
  onStatusChange, onSave, onDelete,
  isEditing, onStartEdit, onCancelEdit,
  isDragOver, draggable,
  onDragStart, onDragOver, onDrop, onDragEnd,
  linkedSession, onShowDeliverable,
}) {
  const typeConfig = MILESTONE_TYPE_CONFIG[milestone.type] || MILESTONE_TYPE_CONFIG.meeting;
  const [form, setForm]   = useState({ title: milestone.title, description: milestone.description || '', type: milestone.type || 'summary' });
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      setForm({ title: milestone.title, description: milestone.description || '', type: milestone.type || 'summary' });
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isEditing, milestone]);

  const handleSave = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    await onSave({ title: form.title.trim(), description: form.description.trim() || null, type: form.type });
    setSaving(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') onCancelEdit();
  };

  const formattedDate = milestone.dueDate
    ? new Date(milestone.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className={`bg-white rounded-xl border border-l-4 shadow-sm p-4 transition-all ${typeConfig.borderColor} ${
        isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:shadow-md'
      } ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {isEditing ? (
        /* ── Inline edit ── */
        <div className="space-y-2">
          <input
            ref={titleRef}
            type="text"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            onKeyDown={handleKey}
            className="w-full text-sm font-semibold text-gray-900 border-b border-blue-300 pb-1 outline-none bg-transparent"
          />
          <textarea
            value={form.description}
            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Escape') onCancelEdit(); }}
            placeholder="Description (optionnel)…"
            rows={2}
            className="w-full text-xs text-gray-600 resize-none border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-300"
          />
          {/* Sélecteur de type */}
          <div className="flex gap-1 flex-wrap">
            {MILESTONE_TYPES.map(t => {
              const tc = MILESTONE_TYPE_CONFIG[t];
              return (
                <button key={t} type="button" onClick={() => setForm(p => ({ ...p, type: t }))}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition ${
                    form.type === t
                      ? 'bg-blabia-blue text-white border-blabia-blue'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <span>{tc.icon}</span>
                  <span className="hidden sm:inline">{tc.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="text-xs bg-blabia-blue hover:bg-blabia-blue text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
              {saving ? '…' : 'Sauvegarder'}
            </button>
            <button onClick={onCancelEdit}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        /* ── Affichage normal ── */
        <div>
          {/* Badge type */}
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-xs">{typeConfig.icon}</span>
            <span className="text-xs text-gray-400 font-medium">{typeConfig.label}</span>
          </div>
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3
              className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blabia-blue flex-1 leading-snug"
              onClick={onStartEdit}
              title="Cliquer pour modifier"
            >
              {milestone.title}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusSelector value={milestone.status} onChange={onStatusChange} />
              <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition text-sm leading-none p-0.5" title="Supprimer">×</button>
            </div>
          </div>

          {milestone.description && (
            <p className="text-xs text-gray-500 mb-2 leading-relaxed line-clamp-2">{milestone.description}</p>
          )}

          {formattedDate && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {formattedDate}
              </span>
            </div>
          )}

          {/* Bouton livrable — visible si étape terminée et session acceptée */}
          {milestone.status === 'done' && linkedSession?.status === 'accepted' && onShowDeliverable && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <button
                onClick={(e) => { e.stopPropagation(); onShowDeliverable(linkedSession, milestone.type); }}
                className="text-xs text-violet-600 hover:text-violet-800 hover:bg-violet-50 border border-violet-200 px-2.5 py-1.5 rounded-lg transition font-medium"
              >
                {DELIVERABLE_LABEL[milestone.type] || '📄 Voir le livrable'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Composant Timeline principal ──────────────────────────────────────────────
function MilestoneTimeline({ projectId, milestones, milestoneSessions, onUpdate, onShowDeliverable }) {
  const [insertingAfter, setInsertingAfter] = useState(null); // null | 'start' | milestoneId
  const [editingId, setEditingId]           = useState(null);
  const [mode, setMode]                     = useState(() =>
    milestones.some(m => m.dueDate) ? 'dates' : 'order'
  );
  const [draggedId, setDraggedId]   = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  // Trier les jalons selon le mode
  const sorted = mode === 'dates'
    ? [...milestones].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return a.displayOrder - b.displayOrder;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      })
    : [...milestones].sort((a, b) => a.displayOrder - b.displayOrder);

  // Progression
  const done  = milestones.filter(m => m.status === 'done').length;
  const total = milestones.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInsert = async ({ title, dueDate, type }, afterId) => {
    try {
      let targetOrder;
      if (afterId === 'start') {
        targetOrder = sorted.length > 0 ? sorted[0].displayOrder - 1 : 0;
      } else {
        const idx = sorted.findIndex(m => m.id === afterId);
        if (idx >= 0 && idx < sorted.length - 1) {
          targetOrder = (sorted[idx].displayOrder + sorted[idx + 1].displayOrder) / 2;
        } else {
          targetOrder = sorted.length > 0 ? sorted[sorted.length - 1].displayOrder + 1 : 0;
        }
      }
      const { data } = await api.post(`/projects/${projectId}/milestones`, {
        title,
        dueDate,
        type: type || 'summary',
        displayOrder: targetOrder
      });
      const newList = [...sorted, data].sort((a, b) => a.displayOrder - b.displayOrder);
      await api.patch(`/projects/${projectId}/milestones/reorder`, {
        order: newList.map(m => m.id)
      });
      setInsertingAfter(null);
      onUpdate();
    } catch {}
  };

  const handleStatusChange = async (milestoneId, status) => {
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestoneId}`, { status });
      onUpdate();
    } catch {}
  };

  const handleSave = async (milestoneId, data) => {
    try {
      await api.patch(`/projects/${projectId}/milestones/${milestoneId}`, data);
      setEditingId(null);
      onUpdate();
    } catch {}
  };

  const handleDelete = async (milestoneId) => {
    if (!confirm('Supprimer ce jalon ?')) return;
    try {
      await api.delete(`/projects/${projectId}/milestones/${milestoneId}`);
      onUpdate();
    } catch {}
  };

  // ── Drag & Drop (mode order uniquement) ───────────────────────────────────
  const handleDragStart = (id) => setDraggedId(id);
  const handleDragOver  = (e, id) => { e.preventDefault(); setDragOverId(id); };
  const handleDragEnd   = () => { setDraggedId(null); setDragOverId(null); };

  const handleDrop = async (e, targetId) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) { setDraggedId(null); setDragOverId(null); return; }
    const fromIdx = sorted.findIndex(m => m.id === draggedId);
    const toIdx   = sorted.findIndex(m => m.id === targetId);
    const reordered = [...sorted];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDraggedId(null); setDragOverId(null);
    try {
      await api.patch(`/projects/${projectId}/milestones/reorder`, {
        order: reordered.map(m => m.id)
      });
      onUpdate();
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* En-tête progression + mode toggle */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Progression</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {done}/{total} jalon{total !== 1 ? 's' : ''} terminé{done !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-lg">
            <button
              onClick={() => setMode('order')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${mode === 'order' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Ordre
            </button>
            <button
              onClick={() => setMode('dates')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${mode === 'dates' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Dates
            </button>
          </div>
        </div>

        {total > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
        {total > 0 && (
          <p className="text-xs text-gray-400 text-right mt-1">{pct}%</p>
        )}
      </div>

      {/* Timeline */}
      <div className="relative">
        {sorted.length > 0 && (
          <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200 z-0" />
        )}

        <div className="relative z-10">
          {insertingAfter === 'start' ? (
            <div className="pl-10">
              <InsertMilestoneForm
                onSave={(data) => handleInsert(data, 'start')}
                onCancel={() => setInsertingAfter(null)}
              />
            </div>
          ) : (
            <InsertButton onClick={() => { setInsertingAfter('start'); setEditingId(null); }} />
          )}

          {sorted.map((m) => (
            <div key={m.id}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-8 flex flex-col items-center pt-4">
                  <div className={`w-4 h-4 rounded-full border-2 border-white ring-2 z-10 ${STATUS_CONFIG[m.status]?.dot || 'bg-gray-300'} ${STATUS_CONFIG[m.status]?.ring || 'ring-gray-300'}`} />
                </div>
                <div className="flex-1 mb-3">
                  <MilestoneCard
                    milestone={m}
                    onStatusChange={(s) => handleStatusChange(m.id, s)}
                    onSave={(data) => handleSave(m.id, data)}
                    onDelete={() => handleDelete(m.id)}
                    isEditing={editingId === m.id}
                    onStartEdit={() => { setEditingId(m.id); setInsertingAfter(null); }}
                    onCancelEdit={() => setEditingId(null)}
                    isDragOver={dragOverId === m.id && draggedId !== m.id}
                    draggable={mode === 'order'}
                    onDragStart={() => handleDragStart(m.id)}
                    onDragOver={(e) => handleDragOver(e, m.id)}
                    onDrop={(e) => handleDrop(e, m.id)}
                    onDragEnd={handleDragEnd}
                    linkedSession={milestoneSessions?.[m.id]}
                    onShowDeliverable={onShowDeliverable}
                  />
                </div>
              </div>

              {insertingAfter === m.id ? (
                <div className="pl-10">
                  <InsertMilestoneForm
                    onSave={(data) => handleInsert(data, m.id)}
                    onCancel={() => setInsertingAfter(null)}
                  />
                </div>
              ) : (
                <InsertButton onClick={() => { setInsertingAfter(m.id); setEditingId(null); }} />
              )}
            </div>
          ))}

          {sorted.length === 0 && insertingAfter !== 'start' && (
            <div className="text-center py-10 text-gray-400">
              <p className="text-4xl mb-3">🗓</p>
              <p className="text-sm font-medium text-gray-600 mb-1">Aucun jalon</p>
              <p className="text-xs mb-4">Cliquez sur le bouton + pour créer votre premier jalon.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function PlanView() {
  const { id: projectId } = useParams();
  const [project,           setProject]           = useState(null);
  const [milestones,        setMilestones]        = useState([]);
  const [milestoneSessions, setMilestoneSessions] = useState({});
  const [loading,           setLoading]           = useState(true);
  const [error,             setError]             = useState('');

  // État modaux livrable
  const [summaryViewSession,   setSummaryViewSession]   = useState(null);
  const [promptViewSession,    setPromptViewSession]    = useState(null);
  const [timelineStepsSession, setTimelineStepsSession] = useState(null);
  const [loadingDeliverable,   setLoadingDeliverable]   = useState(false);

  const loadPlan = async () => {
    try {
      const [projRes, planRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/plan`)
      ]);
      setProject(projRes.data);
      setMilestones(planRes.data.milestones || []);
      setMilestoneSessions(planRes.data.milestoneSessions || {});
    } catch {
      setError('Impossible de charger le plan du projet.');
    } finally {
      setLoading(false);
    }
  };

  const handleShowDeliverable = async (linkedSession, milestoneType) => {
    if (loadingDeliverable) return;
    setLoadingDeliverable(true);
    try {
      const { data: full } = await api.get(`/projects/${projectId}/sessions/${linkedSession.id}`);
      const t = milestoneType || '';
      if (['summary', 'synthesis', 'memory', 'meeting'].includes(t)) {
        setSummaryViewSession(full);
      } else if (['claude_code', 'technical'].includes(t)) {
        setPromptViewSession(full);
      } else if (t === 'timeline_steps') {
        setTimelineStepsSession(full);
      }
    } catch {}
    setLoadingDeliverable(false);
  };

  useEffect(() => { loadPlan(); }, [projectId]);

  return (
    <>
    <ProjectLayout projectId={projectId}>
      <div className="max-w-3xl mx-auto">
        {/* Navigation */}
        <div className="flex items-center gap-3 mb-5">
          <Link to={`/projects/${projectId}`} className="text-sm text-gray-500 hover:text-gray-700">
            ← {project?.name || 'Projet'}
          </Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-medium text-gray-800">Plan</span>
        </div>

        {/* En-tête */}
        {project && (
          <div className="mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
              <span className="text-xs font-medium bg-blue-100 text-blabia-blue border border-blue-200 px-2.5 py-1 rounded-full">Plan</span>
            </div>
            {project.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blabia-blue" />
          </div>
        )}

        {/* Erreur */}
        {!loading && error && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">{error}</p>
            <Link to={`/projects/${projectId}`} className="text-blabia-blue hover:text-blabia-blue text-sm font-medium mt-2 inline-block">
              ← Retour au projet
            </Link>
          </div>
        )}

        {/* Contenu — timeline full-width */}
        {!loading && !error && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Jalons</h2>
              <span className="text-xs text-gray-400">{milestones.length} jalon{milestones.length !== 1 ? 's' : ''}</span>
            </div>
            <MilestoneTimeline
              projectId={projectId}
              milestones={milestones}
              milestoneSessions={milestoneSessions}
              onUpdate={loadPlan}
              onShowDeliverable={handleShowDeliverable}
            />
          </div>
        )}
      </div>
    </ProjectLayout>

      {/* ── Modaux livrables ──────────────────────────────────────────── */}
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

      {promptViewSession && (
        <ExportModal
          directContent={promptViewSession.summary}
          projectId={projectId}
          onClose={() => setPromptViewSession(null)}
        />
      )}

      {timelineStepsSession && (
        <TimelineStepsModal
          session={timelineStepsSession}
          projectId={projectId}
          onClose={() => setTimelineStepsSession(null)}
          onRefresh={loadPlan}
        />
      )}
    </>
  );
}
