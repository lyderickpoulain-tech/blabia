import { Check } from 'lucide-react';

// Les quatre temps d'une réunion (refonte UX v5.1). `phase` : preparation |
// briefing | exchanges | conclusion. `skipped` : préparation non faite.
export const PHASES = [
  { id: 'preparation', label: 'Préparation' },
  { id: 'briefing',    label: 'Briefing' },
  { id: 'exchanges',   label: 'Échanges' },
  { id: 'conclusion',  label: 'Conclusion' },
];

export default function PhaseStepper({ phase, skipped = [] }) {
  const currentIdx = PHASES.findIndex(p => p.id === phase);
  return (
    <ol aria-label="Temps de la réunion" className="flex items-center gap-1 flex-wrap">
      {PHASES.map((p, i) => {
        const isSkipped = skipped.includes(p.id);
        if (isSkipped) return null; // v5.1 : une étape non utilisée est masquée, pas barrée (« j'ai raté quelque chose ? »)
        const state = i === currentIdx ? 'current' : i < currentIdx ? 'done' : 'next';
        const cls = state === 'current'
          ? 'bg-action-light text-action font-extrabold'
          : state === 'done' && !isSkipped ? 'text-ink-muted font-semibold' : 'text-ink-faint font-semibold';
        const dot = state === 'current' ? 'bg-action' : state === 'done' && !isSkipped ? 'bg-ai' : 'bg-line';
        return (
          <li key={p.id} aria-current={state === 'current' ? 'step' : undefined}
            title={isSkipped ? `${p.label} : non faite pour cette réunion` : p.label}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs ${cls} ${isSkipped ? 'line-through decoration-1' : ''}`}>
            {state === 'done' && !isSkipped
              ? <Check size={13} strokeWidth={3} className="text-ok" aria-hidden="true" />
              : <span className={`w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />}
            {p.label}
          </li>
        );
      })}
    </ol>
  );
}
