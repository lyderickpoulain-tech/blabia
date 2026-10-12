import { useState } from 'react';
import { Check, MapPin, Lightbulb } from 'lucide-react';
import { MeetingTypeIcon } from './MilestoneDrawers';

const TYPE_META = {
  decision:    { label: 'Décision' },
  claude_code: { label: 'Claude Code' },
  stack:       { label: 'Outils' },
};

// Résout la référence "after" (ex. "R2") en titre lisible pour affichage.
function positionLabel(after, meetingRefs) {
  if (!after) return 'En fin de plan';
  const found = meetingRefs?.find(r => r.ref === after);
  return found ? `Après « ${found.title} »` : 'En fin de plan';
}

// Carte de suggestion de réunion ([SUGGEST_MEETING], phase 3.4) — Garder / Modifier / Écarter.
// `suggestion` : { id, title, objective, type, reason, after, status, agentName }
// `meetingRefs` : [{ ref: "R1", title }, …] — réunions déjà planifiées, même numérotation que côté agent (chat.js)
export default function MeetingSuggestionCard({ suggestion, onKeep, onDiscard, onSave, busy, meetingRefs = [] }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle]         = useState(suggestion.title);
  const [type, setType]           = useState(suggestion.type);
  const [objective, setObjective] = useState(suggestion.objective || '');
  const [after, setAfter]         = useState(suggestion.after || '');

  if (suggestion.status === 'discarded') return null;

  if (suggestion.status === 'kept' && !editing) {
    return (
      <div className="mx-4 bg-green-50 border border-green-200 rounded-xl p-3 space-y-1">
        <div className="flex items-center gap-2">
          <MeetingTypeIcon type={suggestion.type} size={16} className="shrink-0 text-green-700" />
          <span className="flex-1 text-sm text-green-900 truncate">{suggestion.title}</span>
          <span className="text-xs text-green-600 font-medium shrink-0 inline-flex items-center gap-1"><Check size={12} aria-hidden="true" /> Gardée</span>
          <button onClick={() => setEditing(true)} className="text-xs text-green-700 hover:underline shrink-0">Modifier</button>
        </div>
        <p className="text-[10px] text-green-700 pl-6 flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {positionLabel(suggestion.after, meetingRefs)}</p>
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
              <MeetingTypeIcon type={id} size={14} /> {m.label}
            </button>
          ))}
        </div>
        <div>
          <label className="text-[10px] text-blue-700 font-medium">Positionner après :</label>
          <select
            value={after} onChange={e => setAfter(e.target.value)}
            className="w-full mt-0.5 text-xs border border-blue-200 bg-white rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">Fin de plan</option>
            {meetingRefs.map(r => (
              <option key={r.ref} value={r.ref}>{r.title}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { onSave(suggestion.id, { title, type, objective, after: after || null, status: 'kept' }); setEditing(false); }}
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
        <MeetingTypeIcon type={suggestion.type} size={16} className="shrink-0 mt-0.5 text-amber-700" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 leading-snug">{suggestion.title}</p>
          {suggestion.reason && (
            <p className="text-xs text-amber-700 italic mt-0.5 leading-snug flex items-start gap-1"><Lightbulb size={12} className="shrink-0 mt-0.5" aria-hidden="true" /> <span>{suggestion.reason}</span></p>
          )}
          <p className="text-[10px] text-amber-600 mt-0.5 flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {positionLabel(suggestion.after, meetingRefs)}</p>
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
