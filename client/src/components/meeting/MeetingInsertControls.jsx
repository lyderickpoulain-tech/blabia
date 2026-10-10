import { useState } from 'react';
import { TYPE_ICON } from './MilestoneDrawers';

const TYPES = ['decision', 'claude_code', 'stack'];

// ── Bouton d'insertion entre réunions ───────────────────────────────────────────
export function InsertButton({ onClick, alwaysVisible }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className={`flex items-center gap-1 px-2 py-0.5 transition cursor-pointer group ${alwaysVisible || hovered ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="flex-1 border-t border-dashed border-line group-hover:border-action-border transition" />
      <button type="button" className="w-4 h-4 rounded-full bg-canvas-deep group-hover:bg-action-light text-ink-faint group-hover:text-action text-xs flex items-center justify-center shrink-0 transition">
        +
      </button>
      <div className="flex-1 border-t border-dashed border-line group-hover:border-action-border transition" />
    </div>
  );
}

// ── Formulaire d'insertion / ajout inline ───────────────────────────────────────
export function InsertForm({ onSave, onCancel }) {
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
    <form onSubmit={handleSubmit} className="mx-2 my-1 p-2 bg-action-light border border-action-border rounded-lg space-y-1.5">
      <input autoFocus type="text" value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Titre de la réunion…"
        className="w-full text-xs border border-action-border bg-white rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-action"
      />
      <div className="flex gap-1">
        {TYPES.map(t => (
          <button key={t} type="button" onClick={() => setType(t)} title={t}
            className={`flex-1 text-sm py-1 rounded-lg border transition ${
              type === t ? 'bg-action border-action text-white' : 'bg-white border-line text-ink-soft hover:border-action-border'
            }`}>
            {TYPE_ICON[t]}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <button type="submit" disabled={!title.trim() || saving}
          className="flex-1 text-xs bg-action hover:bg-action-dark text-white py-1.5 rounded-lg font-medium transition disabled:opacity-50">
          {saving ? '…' : 'Insérer'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-ink-faint hover:text-ink-soft px-2 py-1.5 rounded-lg transition">
          ✕
        </button>
      </div>
    </form>
  );
}
