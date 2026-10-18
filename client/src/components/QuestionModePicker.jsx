import { Handshake, Scale, Target } from 'lucide-react';
// Mode de questions : combien de décisions les assistants soumettent à l'humain par
// réunion (budgets définis côté serveur : services/questionModes.js).
export const QUESTION_MODES = [
  { id: 'delegate', icon: Handshake, label: 'Je délègue',            hint: '≈ 4 questions — les assistants tranchent l\'essentiel, vous les contredisez si besoin' },
  { id: 'balanced', icon: Scale, label: 'Équilibré',             hint: '≈ 8 questions — vous tranchez les choix structurants' },
  { id: 'control',  icon: Target, label: 'Je veux tout trancher', hint: '≈ 15 questions — les assistants vous soumettent la plupart des choix' },
];

export default function QuestionModePicker({ value, onChange, compact = false }) {
  const current = QUESTION_MODES.find(m => m.id === value) || QUESTION_MODES[1];
  return (
    <div className="space-y-1.5">
      {!compact && <p className="text-sm font-bold text-ink-soft">Questions des assistants</p>}
      <div className="grid grid-cols-3 gap-1.5">
        {QUESTION_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            aria-pressed={current.id === m.id}
            onClick={() => onChange(m.id)}
            className={`text-xs rounded-[10px] border-2 px-2 py-1.5 transition flex flex-col items-center gap-0.5 leading-tight ${
              current.id === m.id
                ? 'bg-action-light border-action text-action font-extrabold'
                : 'bg-white border-line text-ink-muted font-semibold hover:border-action-border'
            }`}
          >
            <m.icon size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="text-center">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-ink-faint">{current.hint}</p>
    </div>
  );
}
