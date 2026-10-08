import { useState } from 'react';

const TYPE_META = {
  decision:    { icon: '🤝', label: 'Décision' },
  claude_code: { icon: '💻', label: 'Claude Code' },
  stack:       { icon: '🔧', label: 'Outils' },
};

// Carte de suggestion de réunion ([SUGGEST_MEETING], phase 3.4) — Garder / Modifier / Écarter.
// `suggestion` : { id, title, objective, type, reason, after, status, agentName }
export default function MeetingSuggestionCard({ suggestion, onKeep, onDiscard, onSave, busy }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle]         = useState(suggestion.title);
  const [type, setType]           = useState(suggestion.type);
  const [objective, setObjective] = useState(suggestion.objective || '');

  if (suggestion.status === 'discarded') return null;

  if (suggestion.status === 'kept' && !editing) {
    return (
      <div className="mx-4 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
        <span className="text-base shrink-0">{TYPE_META[suggestion.type]?.icon || '🤝'}</span>
        <span className="flex-1 text-sm text-green-900 truncate">{suggestion.title}</span>
        <span className="text-xs text-green-600 font-medium shrink-0">✓ Gardée</span>
        <button onClick={() => setEditing(true)} className="text-xs text-green-700 hover:underline shrink-0">Modifier</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="mx-4 bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
        <input
          type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Titre de la réunion"
          className="w-full text-sm border border-blue-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
        />
        <textarea
          value={objective} onChange={e => setObjective(e.target.value)}
          placeholder="Objectif (optionnel)" rows={2}
          className="w-full text-xs border border-blue-200 bg-white rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-400 resize-none"
        />
        <div className="flex gap-1">
          {Object.entries(TYPE_META).map(([id, m]) => (
            <button key={id} type="button" onClick={() => setType(id)}
              className={`flex-1 text-xs py-1.5 rounded-lg border transition flex items-center justify-center gap-1 ${
                type === id ? 'bg-blabia-blue border-blabia-blue text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300'
              }`}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { onSave(suggestion.id, { title, type, objective, status: 'kept' }); setEditing(false); }}
            disabled={!title.trim() || busy}
            className="flex-1 bg-blabia-blue hover:bg-blabia-blue text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
          >
            Enregistrer
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2">Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{TYPE_META[suggestion.type]?.icon || '🤝'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{suggestion.title}</p>
          {suggestion.reason && (
            <p className="text-xs text-amber-700 italic mt-0.5 leading-snug">💡 {suggestion.reason}</p>
          )}
          {suggestion.agentName && (
            <p className="text-[10px] text-gray-400 mt-0.5">Suggéré par {suggestion.agentName}</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onKeep(suggestion.id)}
          disabled={busy}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium py-1.5 rounded-lg disabled:opacity-50"
        >
          Garder
        </button>
        <button onClick={() => setEditing(true)} className="text-xs text-amber-700 border border-amber-300 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition">
          Modifier
        </button>
        <button onClick={() => onDiscard(suggestion.id)} className="text-xs text-gray-400 hover:text-gray-600 px-2">
          Écarter
        </button>
      </div>
    </div>
  );
}
