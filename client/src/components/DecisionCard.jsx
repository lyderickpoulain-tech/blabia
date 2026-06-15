import { useState } from 'react';

const CUSTOM_OPTION = 'Autre (précise)';

export default function DecisionCard({ message, onAnswer, onDefer, disabled }) {
  const [selected,    setSelected]    = useState(null);
  const [customText,  setCustomText]  = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  // ── Carte compacte après réponse ────────────────────────────────────────────
  if (message.status === 'answered') {
    return (
      <div className="mx-4 flex items-start gap-2.5 py-1">
        <span className="text-green-500 text-base shrink-0 mt-0.5">✅</span>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium mb-0.5">
            Décision actée · {message.agentName}
          </p>
          <p className="text-sm text-gray-600 italic truncate">{message.question}</p>
          <p className="text-sm font-semibold text-green-700 mt-0.5">→ {message.answer}</p>
        </div>
      </div>
    );
  }

  if (message.status === 'deferred') {
    return (
      <div className="mx-4 flex items-start gap-2.5 py-1">
        <span className="text-orange-400 text-base shrink-0 mt-0.5">⏸</span>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium mb-0.5">
            Décision reportée · {message.agentName}
          </p>
          <p className="text-sm text-gray-500 italic truncate">{message.question}</p>
        </div>
      </div>
    );
  }

  // ── Carte interactive (status === 'pending') ─────────────────────────────────
  const isCustomSelected = selected === CUSTOM_OPTION;
  const canSubmit        = selected && (!isCustomSelected || customText.trim());

  const handleValidate = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    await onAnswer(message.id, isCustomSelected ? customText.trim() : selected);
    setSubmitting(false);
  };

  const handleDefer = async () => {
    if (submitting) return;
    setSubmitting(true);
    await onDefer(message.id);
    setSubmitting(false);
  };

  return (
    <div className="mx-4 bg-violet-50 border border-violet-200 rounded-2xl p-4 space-y-3">

      {/* En-tête */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-violet-600">
          🤔 {message.agentName} soumet une décision
        </p>
        <p className="text-sm font-semibold text-gray-900 leading-snug">
          {message.question}
        </p>
        {message.context && (
          <p className="text-xs text-gray-500 flex items-start gap-1 leading-snug">
            <span className="shrink-0 mt-0.5">💡</span>
            <span>{message.context}</span>
          </p>
        )}
      </div>

      {/* Choix */}
      <div className="space-y-1.5">
        {(message.choices || []).map((choice, i) => (
          <label
            key={i}
            className={`flex items-center gap-2.5 cursor-pointer px-3 py-2 rounded-xl border transition select-none ${
              selected === choice
                ? 'bg-violet-100 border-violet-400'
                : 'bg-white border-gray-200 hover:border-violet-300'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input
              type="radio"
              name={`decision-${message.id}`}
              value={choice}
              checked={selected === choice}
              onChange={() => { setSelected(choice); setCustomText(''); }}
              disabled={disabled}
              className="accent-violet-600 shrink-0"
            />
            <span className="text-sm text-gray-700">{choice}</span>
          </label>
        ))}

        {/* Champ texte libre si "Autre" sélectionné */}
        {isCustomSelected && (
          <input
            autoFocus
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleValidate(); } }}
            placeholder="Précisez votre choix…"
            disabled={disabled}
            className="w-full text-sm border border-violet-300 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-violet-400 bg-white disabled:opacity-50"
          />
        )}
      </div>

      {/* Boutons */}
      <div className="flex gap-2 pt-0.5">
        <button
          onClick={handleValidate}
          disabled={!canSubmit || submitting || disabled}
          className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold py-2 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          {submitting
            ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : '✅ Valider mon choix'}
        </button>
        <button
          onClick={handleDefer}
          disabled={submitting || disabled}
          className="border border-gray-300 text-gray-600 hover:bg-gray-50 text-sm font-medium py-2 px-4 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          ⏸ Plus tard
        </button>
      </div>
    </div>
  );
}
