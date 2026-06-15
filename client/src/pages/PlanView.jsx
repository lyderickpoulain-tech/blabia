import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProjectLayout from '../components/ProjectLayout';
import api from '../utils/api';

// ── Constantes statut ──────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:     { label: 'Pas commencé', dot: 'bg-gray-300',    ring: 'ring-gray-300',    badge: 'bg-gray-100 text-gray-600 border-gray-200',    icon: '⬜' },
  in_progress: { label: 'En cours',     dot: 'bg-blue-500',    ring: 'ring-blue-300',    badge: 'bg-blue-100 text-blue-700 border-blue-200',    icon: '🔵' },
  done:        { label: 'Terminé',      dot: 'bg-green-500',   ring: 'ring-green-300',   badge: 'bg-green-100 text-green-700 border-green-200',  icon: '✅' },
  blocked:     { label: 'Bloqué',       dot: 'bg-red-400',     ring: 'ring-red-300',     badge: 'bg-red-100 text-red-700 border-red-200',        icon: '🔴' },
};
const STATUSES = ['pending', 'in_progress', 'done', 'blocked'];

// ── Types d'étapes ────────────────────────────────────────────────────────────
const MILESTONE_TYPE_CONFIG = {
  synthesis:      { label: 'Synthèse',      icon: '📝', borderColor: 'border-l-blue-400' },
  memory:         { label: 'Souvenir',      icon: '🧠', borderColor: 'border-l-green-400' },
  claude_code:    { label: 'Claude Code',   icon: '💻', borderColor: 'border-l-violet-400' },
  timeline_steps: { label: 'Étapes',        icon: '📋', borderColor: 'border-l-yellow-400' },
  stack_check:    { label: 'Vérif. stack',  icon: '🔧', borderColor: 'border-l-orange-400' },
  milestone:      { label: 'Jalon',         icon: '🏁', borderColor: 'border-l-gray-300' },
  // rétrocompat
  meeting:        { label: 'Synthèse',      icon: '📝', borderColor: 'border-l-blue-400' },
  technical:      { label: 'Claude Code',   icon: '💻', borderColor: 'border-l-violet-400' },
};
const MILESTONE_TYPES = ['synthesis', 'memory', 'claude_code', 'timeline_steps', 'stack_check', 'milestone'];

// ── Configs priorité et source ────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  high:   { dot: 'bg-red-500',   label: 'Haute',   badge: 'bg-red-100 text-red-700 border-red-200' },
  medium: { dot: 'bg-amber-400', label: 'Moyenne', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { dot: 'bg-gray-300',  label: 'Basse',   badge: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const SOURCE_CONFIG = {
  agent:   { label: 'Agent',   badge: 'bg-violet-100 text-violet-700 border-violet-200' },
  session: { label: 'Réunion', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  manual:  { label: 'Manuel',  badge: 'bg-gray-100 text-gray-500 border-gray-200' },
};

const TODO_STATUS_CONFIG = {
  todo:        { label: 'À faire',    color: 'text-gray-500' },
  in_progress: { label: 'En cours',   color: 'text-blue-600' },
  done:        { label: 'Terminée',   color: 'text-green-600' },
  cancelled:   { label: 'Annulée',    color: 'text-gray-400' },
};

// ── Composants helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${c.badge}`}>
      {c.icon} {c.label}
    </span>
  );
}

function StatusDot({ status, size = 'md' }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const sz = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return <span className={`inline-block ${sz} rounded-full ${c.dot}`} />;
}

function StatusSelector({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      onClick={e => e.stopPropagation()}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
    >
      {STATUSES.map(s => (
        <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
      ))}
    </select>
  );
}

function PriorityDot({ priority }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${c.dot}`} title={c.label} />;
}

function SourceBadge({ source }) {
  const c = SOURCE_CONFIG[source];
  if (!c) return null;
  return (
    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full border ${c.badge}`}>
      {c.label}
    </span>
  );
}

// Formulaire inline "Ajouter une tâche" dans un groupe
function InlineAddTodo({ onSave, onCancel }) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave(title.trim());
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-2">
      <span className="text-gray-300 text-xs shrink-0">+</span>
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Titre de la tâche…"
        className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400"
      />
      <button type="submit" disabled={!title.trim() || saving}
        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
        {saving ? '…' : 'Ajouter'}
      </button>
      <button type="button" onClick={onCancel}
        className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
        ✕
      </button>
    </form>
  );
}

// ── Formulaire d'insertion de jalon ───────────────────────────────────────────
function InsertMilestoneForm({ onSave, onCancel }) {
  const [title, setTitle]     = useState('');
  const [dueDate, setDueDate] = useState('');
  const [type, setType]       = useState('synthesis');
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
                  ? 'bg-blue-600 text-white border-blue-600'
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
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
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
  milestone, todoCount,
  onStatusChange, onSave, onDelete,
  isEditing, onStartEdit, onCancelEdit,
  isDragOver, draggable,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  const typeConfig = MILESTONE_TYPE_CONFIG[milestone.type] || MILESTONE_TYPE_CONFIG.meeting;
  const [form, setForm]   = useState({ title: milestone.title, description: milestone.description || '', type: milestone.type || 'synthesis' });
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (isEditing) {
      setForm({ title: milestone.title, description: milestone.description || '', type: milestone.type || 'meeting' });
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
                      ? 'bg-blue-600 text-white border-blue-600'
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
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50">
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
              className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-700 flex-1 leading-snug"
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

          <div className="flex items-center gap-3 flex-wrap">
            {formattedDate && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                {formattedDate}
              </span>
            )}
            {todoCount > 0 && (
              <span className="text-xs text-gray-400">{todoCount} tâche{todoCount > 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TodoDrawer : panel latéral ────────────────────────────────────────────────
function TodoDrawer({ todo, milestones, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    title:       todo.title,
    description: todo.description || '',
    status:      todo.status,
    priority:    todo.priority,
    dueDate:     todo.dueDate ? todo.dueDate.substring(0, 10) : '',
    milestoneId: todo.milestoneId || '',
  });
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  const update = (field, value) => setForm(p => ({ ...p, [field]: value }));

  const handleSave = async () => {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    await onSave({
      title:       form.title.trim(),
      description: form.description.trim() || null,
      status:      form.status,
      priority:    form.priority,
      dueDate:     form.dueDate || null,
      milestoneId: form.milestoneId || null,
    });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('Supprimer cette tâche ?')) return;
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panneau */}
      <div className="w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-900">Détails de la tâche</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition">×</button>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Titre */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Titre</label>
            <input type="text" value={form.title} onChange={e => update('title', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => update('description', e.target.value)}
              rows={3} placeholder="Détails optionnels…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {/* Statut + Priorité */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Statut</label>
              <select value={form.status} onChange={e => update('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                {Object.entries(TODO_STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Priorité</label>
              <select value={form.priority} onChange={e => update('priority', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Échéance */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Date d'échéance</label>
            <input type="date" value={form.dueDate} onChange={e => update('dueDate', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* Jalon */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Jalon</label>
            <select value={form.milestoneId} onChange={e => update('milestoneId', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="">Non assignée</option>
              {milestones.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
          </div>

          {/* Source (display only) */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Source</label>
            <SourceBadge source={todo.source} />
          </div>
        </div>

        {/* Pied */}
        <div className="shrink-0 px-5 py-4 border-t border-gray-100 space-y-2">
          <button onClick={handleSave} disabled={!form.title.trim() || saving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50">
            {saving ? 'Sauvegarde…' : 'Sauvegarder les modifications'}
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="w-full border border-red-200 text-red-500 hover:bg-red-50 py-2.5 rounded-xl text-sm font-medium transition disabled:opacity-50">
            {deleting ? 'Suppression…' : 'Supprimer la tâche'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ligne todo ────────────────────────────────────────────────────────────────
function TodoItemRow({ todo, onToggle, onClick, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const isDone      = todo.status === 'done';
  const isCancelled = todo.status === 'cancelled';
  const faded       = isDone || isCancelled;

  const dueLabel = todo.dueDate
    ? new Date(todo.dueDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
    : null;

  const isOverdue = todo.dueDate && !isDone && !isCancelled
    && new Date(todo.dueDate) < new Date();

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border transition cursor-pointer select-none ${
        isDragOver
          ? 'border-blue-300 bg-blue-50'
          : faded
          ? 'bg-gray-50 border-transparent opacity-60 hover:opacity-80'
          : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm'
      }`}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
          isDone
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-blue-400 bg-white'
        }`}
      >
        {isDone && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Priority dot */}
      <PriorityDot priority={todo.priority} />

      {/* Title */}
      <span className={`flex-1 text-sm leading-snug truncate ${
        faded ? 'line-through text-gray-400' : 'text-gray-800'
      }`}>
        {todo.title}
      </span>

      {/* Due date */}
      {dueLabel && (
        <span className={`text-xs shrink-0 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          {dueLabel}
        </span>
      )}

      {/* Source badge (agent/session seulement) */}
      {todo.source !== 'manual' && (
        <SourceBadge source={todo.source} />
      )}
    </div>
  );
}

// ── Groupe de todos (par jalon ou "Non assignées") ────────────────────────────
function TodoGroup({
  groupId, label, milestoneStatus,
  todos,
  onToggleTodo, onClickTodo,
  onAddTodo,
  dragState, onDragStart, onDragOver, onDragOverGroup, onDrop, onDropGroup, onDragEnd,
}) {
  const [addingHere, setAddingHere] = useState(false);
  const { draggedId, dragOverTodoId, dragOverGroupId } = dragState;
  const isGroupOver = dragOverGroupId === groupId && !dragOverTodoId;

  const handleAddTodo = async (title) => {
    await onAddTodo(groupId === 'unassigned' ? null : groupId, title);
    setAddingHere(false);
  };

  return (
    <div
      className={`rounded-2xl border transition-all mb-4 overflow-hidden ${
        isGroupOver ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
      }`}
      onDragOver={e => { e.preventDefault(); onDragOverGroup(groupId); }}
      onDrop={e => onDropGroup(e, groupId)}
    >
      {/* En-tête du groupe */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          {milestoneStatus && <StatusDot status={milestoneStatus} size="sm" />}
          <h3 className="text-sm font-semibold text-gray-800 truncate">{label}</h3>
          <span className="text-xs text-gray-400 shrink-0">{todos.length}</span>
        </div>
        <button
          onClick={() => setAddingHere(v => !v)}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition shrink-0"
        >
          + Ajouter
        </button>
      </div>

      {/* Liste des todos */}
      <div className={`p-2 space-y-0.5 ${todos.length === 0 && !addingHere ? 'min-h-[40px]' : ''}`}>
        {todos.map(todo => (
          <TodoItemRow
            key={todo.id}
            todo={todo}
            onToggle={() => onToggleTodo(todo)}
            onClick={() => onClickTodo(todo)}
            isDragOver={dragOverTodoId === todo.id && draggedId !== todo.id}
            onDragStart={() => onDragStart(todo.id, groupId)}
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); onDragOver(todo.id); }}
            onDrop={e => { e.preventDefault(); e.stopPropagation(); onDrop(e, todo.id, groupId); }}
            onDragEnd={onDragEnd}
          />
        ))}

        {/* État vide */}
        {todos.length === 0 && !addingHere && (
          <p className="text-xs text-gray-300 italic px-3 py-2">Aucune tâche</p>
        )}

        {/* Formulaire inline */}
        {addingHere && (
          <InlineAddTodo
            onSave={handleAddTodo}
            onCancel={() => setAddingHere(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── TodoColumn : liste groupée avec DnD, filtres, drawer ─────────────────────
function TodoColumn({ projectId, milestones, todos, onUpdate }) {
  const [filter, setFilter]             = useState('all');
  const [selectedTodo, setSelectedTodo] = useState(null);
  const [draggedId, setDraggedId]       = useState(null);
  const [draggedGroupId, setDraggedGroupId] = useState(null);
  const [dragOverTodoId, setDragOverTodoId] = useState(null);
  const [dragOverGroupId, setDragOverGroupId] = useState(null);

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filtered = todos.filter(t => {
    if (filter === 'todo')        return t.status === 'todo';
    if (filter === 'in_progress') return t.status === 'in_progress';
    if (filter === 'done')        return t.status === 'done';
    return t.status !== 'cancelled';
  });

  // ── Groupes ─────────────────────────────────────────────────────────────────
  const buildGroups = () => {
    const byMilestone = milestones.map(m => ({
      id:              m.id,
      label:           m.title,
      milestoneStatus: m.status,
      todos:           filtered.filter(t => t.milestoneId === m.id)
                               .sort((a, b) => a.displayOrder - b.displayOrder)
    }));
    const unassigned = {
      id:    'unassigned',
      label: 'Non assignées',
      milestoneStatus: null,
      todos: filtered.filter(t => !t.milestoneId)
                     .sort((a, b) => a.displayOrder - b.displayOrder)
    };
    return [...byMilestone, unassigned];
  };

  const groups = buildGroups();

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleToggle = async (todo) => {
    const newStatus = todo.status === 'done' ? 'todo' : 'done';
    try {
      await api.patch(`/projects/${projectId}/todos/${todo.id}`, { status: newStatus });
      if (selectedTodo?.id === todo.id) setSelectedTodo(prev => ({ ...prev, status: newStatus }));
      onUpdate();
    } catch {}
  };

  const handleSaveDrawer = async (data) => {
    if (!selectedTodo) return;
    try {
      await api.patch(`/projects/${projectId}/todos/${selectedTodo.id}`, data);
      setSelectedTodo(prev => ({ ...prev, ...data }));
      onUpdate();
    } catch {}
  };

  const handleDeleteDrawer = async () => {
    if (!selectedTodo) return;
    try {
      await api.delete(`/projects/${projectId}/todos/${selectedTodo.id}`);
      setSelectedTodo(null);
      onUpdate();
    } catch {}
  };

  const handleAddTodo = async (milestoneId, title) => {
    try {
      await api.post(`/projects/${projectId}/todos`, {
        title,
        milestoneId: milestoneId || null,
        source: 'manual'
      });
      onUpdate();
    } catch {}
  };

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const handleDragStart  = (todoId, groupId) => {
    setDraggedId(todoId);
    setDraggedGroupId(groupId);
  };
  const handleDragOver   = (todoId) => setDragOverTodoId(todoId);
  const handleDragOverGroup = (groupId) => {
    setDragOverGroupId(groupId);
    if (dragOverTodoId) setDragOverTodoId(null);
  };
  const handleDragEnd    = () => {
    setDraggedId(null); setDraggedGroupId(null);
    setDragOverTodoId(null); setDragOverGroupId(null);
  };

  const applyDrop = async (targetTodoId, targetGroupId) => {
    if (!draggedId) return;

    const sourceMilestoneId = draggedGroupId === 'unassigned' ? null : draggedGroupId;
    const targetMilestoneId = targetGroupId  === 'unassigned' ? null : targetGroupId;
    const groupChanged = sourceMilestoneId !== targetMilestoneId;

    // Construire le nouvel ordre dans le groupe cible
    const targetTodos = todos
      .filter(t => (t.milestoneId || 'unassigned') === targetGroupId && t.id !== draggedId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    if (targetTodoId) {
      const idx = targetTodos.findIndex(t => t.id === targetTodoId);
      const draggedTodo = todos.find(t => t.id === draggedId);
      if (draggedTodo) targetTodos.splice(idx, 0, draggedTodo);
    } else {
      const draggedTodo = todos.find(t => t.id === draggedId);
      if (draggedTodo) targetTodos.push(draggedTodo);
    }

    try {
      if (groupChanged) {
        await api.patch(`/projects/${projectId}/todos/${draggedId}`, {
          milestoneId: targetMilestoneId
        });
      }
      if (targetTodos.length > 1) {
        await api.patch(`/projects/${projectId}/todos/reorder`, {
          order: targetTodos.map(t => t.id)
        });
      }
      onUpdate();
    } catch {}
  };

  const handleDrop = (e, todoId, groupId) => {
    e.preventDefault();
    applyDrop(todoId, groupId);
    handleDragEnd();
  };

  const handleDropGroup = (e, groupId) => {
    e.preventDefault();
    if (draggedId) applyDrop(null, groupId);
    handleDragEnd();
  };

  const filters = [
    { id: 'all',        label: 'Toutes' },
    { id: 'in_progress',label: 'En cours' },
    { id: 'todo',       label: 'À faire' },
    { id: 'done',       label: 'Terminées' },
  ];

  const totalAll = todos.filter(t => t.status !== 'cancelled').length;
  const totalDone = todos.filter(t => t.status === 'done').length;

  return (
    <div>
      {/* Barre de stats + filtres */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-gray-400">
            {totalDone}/{totalAll} tâche{totalAll !== 1 ? 's' : ''} terminée{totalDone !== 1 ? 's' : ''}
          </p>
          {totalAll > 0 && (
            <span className="text-xs font-medium text-gray-500">
              {Math.round(totalDone / totalAll * 100)}%
            </span>
          )}
        </div>
        {totalAll > 0 && (
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden mb-3">
            <div
              className="h-1.5 rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${Math.round(totalDone / totalAll * 100)}%` }}
            />
          </div>
        )}
        <div className="flex gap-1">
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f.id ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Groupes */}
      {groups.map(group => (
        <TodoGroup
          key={group.id}
          groupId={group.id}
          label={group.label}
          milestoneStatus={group.milestoneStatus}
          todos={group.todos}
          onToggleTodo={handleToggle}
          onClickTodo={setSelectedTodo}
          onAddTodo={handleAddTodo}
          dragState={{ draggedId, dragOverTodoId, dragOverGroupId }}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragOverGroup={handleDragOverGroup}
          onDrop={handleDrop}
          onDropGroup={handleDropGroup}
          onDragEnd={handleDragEnd}
        />
      ))}

      {/* Drawer */}
      {selectedTodo && (
        <TodoDrawer
          todo={selectedTodo}
          milestones={milestones}
          onSave={handleSaveDrawer}
          onDelete={handleDeleteDrawer}
          onClose={() => setSelectedTodo(null)}
        />
      )}
    </div>
  );
}

// ── Composant Timeline principal ──────────────────────────────────────────────
function MilestoneTimeline({ projectId, milestones, todos, onUpdate }) {
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

  // Comptage des tâches par jalon
  const todoCountByMilestone = todos.reduce((acc, t) => {
    if (t.milestoneId) acc[t.milestoneId] = (acc[t.milestoneId] || 0) + 1;
    return acc;
  }, {});

  // Progression
  const done  = milestones.filter(m => m.status === 'done').length;
  const total = milestones.length;
  const pct   = total ? Math.round((done / total) * 100) : 0;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleInsert = async ({ title, dueDate, type }, afterId) => {
    try {
      // Calculer le displayOrder pour l'insertion
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
        type: type || 'meeting',
        displayOrder: targetOrder
      });
      // Normaliser les ordres après insertion
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
    if (!confirm('Supprimer ce jalon ? Les tâches associées ne seront pas supprimées.')) return;
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
        {/* Ligne verticale centrale */}
        {sorted.length > 0 && (
          <div className="absolute left-4 top-6 bottom-6 w-0.5 bg-gray-200 z-0" />
        )}

        <div className="relative z-10">
          {/* Bouton insertion avant le premier */}
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

          {sorted.map((m, i) => (
            <div key={m.id}>
              {/* Ligne de milestone */}
              <div className="flex items-start gap-3">
                {/* Dot sur la ligne */}
                <div className="shrink-0 w-8 flex flex-col items-center pt-4">
                  <div className={`w-4 h-4 rounded-full border-2 border-white ring-2 z-10 ${STATUS_CONFIG[m.status]?.dot || 'bg-gray-300'} ${STATUS_CONFIG[m.status]?.ring || 'ring-gray-300'}`} />
                </div>

                {/* Carte */}
                <div className="flex-1 mb-3">
                  <MilestoneCard
                    milestone={m}
                    todoCount={todoCountByMilestone[m.id] || 0}
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
                  />
                </div>
              </div>

              {/* Bouton insertion entre jalons */}
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

          {/* État vide */}
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
  const [project,    setProject]    = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [todos,      setTodos]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  const loadPlan = async () => {
    try {
      const [projRes, planRes] = await Promise.all([
        api.get(`/projects/${projectId}`),
        api.get(`/projects/${projectId}/plan`)
      ]);
      setProject(projRes.data);
      setMilestones(planRes.data.milestones || []);
      setTodos(planRes.data.todos || []);
    } catch {
      setError('Impossible de charger le plan du projet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPlan(); }, [projectId]);

  return (
    <ProjectLayout projectId={projectId}>
      <div className="max-w-5xl mx-auto">
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
              <span className="text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">Plan</span>
            </div>
            {project.description && (
              <p className="text-sm text-gray-500 mt-1">{project.description}</p>
            )}
          </div>
        )}

        {/* Chargement */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        )}

        {/* Erreur */}
        {!loading && error && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">{error}</p>
            <Link to={`/projects/${projectId}`} className="text-blue-600 hover:text-blue-700 text-sm font-medium mt-2 inline-block">
              ← Retour au projet
            </Link>
          </div>
        )}

        {/* Contenu — deux colonnes desktop, une colonne mobile */}
        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Colonne gauche : Timeline des jalons */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Jalons</h2>
                <span className="text-xs text-gray-400">{milestones.length} jalon{milestones.length !== 1 ? 's' : ''}</span>
              </div>
              <MilestoneTimeline
                projectId={projectId}
                milestones={milestones}
                todos={todos}
                onUpdate={loadPlan}
              />
            </div>

            {/* Colonne droite : Todo list */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tâches</h2>
                <span className="text-xs text-gray-400">{todos.filter(t => t.status !== 'cancelled').length} tâche{todos.length !== 1 ? 's' : ''}</span>
              </div>
              <TodoColumn
                projectId={projectId}
                milestones={milestones}
                todos={todos}
                onUpdate={loadPlan}
              />
            </div>
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
