// Mode de questions : combien de décisions les agents soumettent à l'humain par
// réunion (budgets définis côté serveur : services/questionModes.js).
export const QUESTION_MODES = [
  { id: 'delegate', icon: '🤝', label: 'Je délègue',            hint: '≈ 4 questions — les agents tranchent l\'essentiel, vous les contredisez si besoin' },
  { id: 'balanced', icon: '⚖️', label: 'Équilibré',             hint: '≈ 8 questions — vous tranchez les choix structurants' },
  { id: 'control',  icon: '🎯', label: 'Je veux tout trancher', hint: '≈ 15 questions — les agents vous soumettent la plupart des choix' },
];

export default function QuestionModePicker({ value, onChange, compact = false }) {
  const current = QUESTION_MODES.find(m => m.id === value) || QUESTION_MODES[1];
  return (
    <div className="space-y-1.5">
      {!compact && <p className="text-sm font-medium text-gray-700">Questions des agents</p>}
      <div className="grid grid-cols-3 gap-1.5">
        {QUESTION_MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`text-xs rounded-lg border px-2 py-1.5 transition flex flex-col items-center gap-0.5 leading-tight ${
              current.id === m.id
                ? 'bg-blabia-blue border-blabia-blue text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            <span>{m.icon}</span>
            <span className="font-medium text-center">{m.label}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-400">{current.hint}</p>
    </div>
  );
}
