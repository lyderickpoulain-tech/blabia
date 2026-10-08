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
      <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-blue-300 transition" />
      <button type="button" className="w-4 h-4 rounded-full bg-gray-100 group-hover:bg-blue-100 text-gray-400 group-hover:text-blue-500 text-xs flex items-center justify-center shrink-0 transition">
        +
      </button>
      <div className="flex-1 border-t border-dashed border-gray-200 group-hover:border-blue-300 transition" />
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
    <form onSubmit={handleSubmit} className="mx-2 my-1 p-2 bg-blue-50 border border-blue-200 rounded-lg space-y-1.5">
      <input autoFocus type="text" value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Titre de la réunion…"
        className="w-full text-xs border border-blue-200 bg-white rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
      />
      <div className="flex gap-1">
        {TYPES.map(t => (
          <button key={t} type="button" onClick={() => setType(t)} title={t}
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
          {saving ? '…' : 'Insérer'}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg transition">
          ✕
        </button>
      </div>
    </form>
  );
}
