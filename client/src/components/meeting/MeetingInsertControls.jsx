import { useState } from 'react';
import { Plus } from 'lucide-react';
import { MEETING_TYPES, TYPE_LABEL, MeetingTypeIcon } from './MilestoneDrawers';
import { Button } from '../ui';

// ── Bouton d'insertion entre réunions ───────────────────────────────────────────
export function InsertButton({ onClick, alwaysVisible }) {
  return (
    <div className={`group flex items-center gap-2 py-0.5 transition ${alwaysVisible ? 'opacity-100' : 'opacity-0 hover:opacity-100 focus-within:opacity-100'}`}>
      <div className="flex-1 border-t border-dashed border-line group-hover:border-action-border transition" />
      <button type="button" onClick={onClick} aria-label="Insérer une réunion ici" title="Insérer une réunion ici"
        className="inline-flex items-center gap-1 rounded-full px-2.5 h-5 text-[11px] font-bold text-ink-muted bg-canvas-deep group-hover:bg-action-light group-hover:text-action transition">
        <Plus size={12} aria-hidden="true" /> Insérer
      </button>
      <div className="flex-1 border-t border-dashed border-line group-hover:border-action-border transition" />
    </div>
  );
}

// ── Choix du type de réunion : icône + libellé ──────────────────────────────────
export function MeetingTypePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Type de réunion" className="flex flex-wrap gap-1.5">
      {MEETING_TYPES.map(t => {
        const on = value === t;
        return (
          <button key={t} type="button" role="radio" aria-checked={on} onClick={() => onChange(t)}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border text-[13px] font-bold transition ${
              on ? 'bg-action-light border-action text-action' : 'bg-white border-line text-ink-soft hover:border-action-border'
            }`}>
            <MeetingTypeIcon type={t} size={16} /> {TYPE_LABEL[t]}
          </button>
        );
      })}
    </div>
  );
}

// ── Formulaire d'ajout / d'insertion d'une réunion ──────────────────────────────
export function InsertForm({ onSave, onCancel, submitLabel = 'Insérer' }) {
  const [title, setTitle]   = useState('');
  const [type, setType]     = useState('decision');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || saving) return;
    setSaving(true);
    await onSave({ title: title.trim(), type });
    setSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="my-2 p-4 bg-white border border-action-border rounded-2xl space-y-3">
      <input autoFocus type="text" value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Sujet de la réunion (ex. : Choisir le nom de domaine)" aria-label="Sujet de la réunion"
        className="w-full text-sm text-ink border border-line rounded-[10px] px-3 h-10 outline-none bg-white focus:ring-2 focus:ring-action focus:border-transparent" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MeetingTypePicker value={type} onChange={setType} />
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
          <Button size="sm" variant="primary" type="submit" disabled={!title.trim() || saving}>{saving ? '…' : submitLabel}</Button>
        </div>
      </div>
    </form>
  );
}
