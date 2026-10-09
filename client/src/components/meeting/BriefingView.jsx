import { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import Markdown from '../Markdown';
import { ChoicePill, DELEGATE } from '../DecisionCard';

const isCustom = c => /^autre/i.test(c || '');

// Briefing (refonte UX v5.1) : écran d'arrivée après une préparation sans
// l'humain. Synthèse + décisions qui lui reviennent ; pour chacune, une réponse
// ou « Laisser les agents décider ». Les réponses, envoyées ensemble, lancent
// les échanges. `onSubmit(answers)` : { [id]: texte | DELEGATE }.
export default function BriefingView({ summary, decisions, debateCount, onShowDebate, onSubmit, submitting, decisionBudget, firstNumber = 1 }) {
  const [picked, setPicked] = useState({});         // { [id]: choix | DELEGATE | 'custom' }
  const [customText, setCustomText] = useState({}); // { [id]: texte }

  const answerOf = id => picked[id] === 'custom' ? (customText[id] || '').trim() : picked[id];
  const answeredCount = decisions.filter(d => answerOf(d.id)).length;
  const allAnswered = answeredCount === decisions.length;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[820px] mx-auto px-4 py-5 space-y-5">
          <div className="space-y-1">
            <p className="text-xs font-extrabold uppercase tracking-wider text-ai">Briefing · votre arrivée</p>
            <h2 className="text-2xl font-extrabold text-ink leading-tight">
              Les agents ont préparé la réunion. {decisions.length} décision{decisions.length > 1 ? 's vous reviennent' : ' vous revient'}.
            </h2>
            <p className="text-[15px] text-ink-muted">Lisez la synthèse, choisissez une réponse pour chaque point, puis validez pour lancer les échanges.</p>
          </div>

          {summary && (
            <section aria-labelledby="briefing-synth" className="bg-ai-bg border border-ai-border rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="briefing-synth" className="text-base font-extrabold text-ai flex items-center gap-2">
                  <Sparkles size={16} aria-hidden="true" /> Synthèse de la préparation
                </h3>
                {debateCount > 0 && (
                  <button type="button" onClick={onShowDebate} className="min-h-[32px] text-[13px] font-bold text-ai hover:underline">
                    Voir le débat des agents ({debateCount} messages)
                  </button>
                )}
              </div>
              <div><Markdown size="synthesis">{summary.content}</Markdown></div>
            </section>
          )}

          <section aria-labelledby="briefing-dec" className="space-y-3">
            <h3 id="briefing-dec" className="text-base font-extrabold text-ink">À vous de trancher</h3>
            {decisions.map((d, i) => {
              const done = !!answerOf(d.id);
              return (
                <fieldset key={d.id}
                  className={`bg-white border rounded-2xl p-4 space-y-2.5 min-w-0 shadow-sm ${done ? 'border-ok-border' : 'border-await-border'}`}>
                  <legend className="float-left w-full text-[15px] font-bold text-ink">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-await mr-1.5">
                      Question {firstNumber + i}{decisionBudget ? `/${decisionBudget}` : ''}
                    </span>
                    {d.question}
                  </legend>
                  {d.context && <p className="clear-both text-[13px] text-ink-muted">{d.context}</p>}
                  <div className="clear-both flex flex-wrap gap-1.5">
                    {(d.choices || []).map((c, j) => isCustom(c) ? (
                      <ChoicePill key={j} selected={picked[d.id] === 'custom'} onClick={() => setPicked(p => ({ ...p, [d.id]: 'custom' }))}>{c}</ChoicePill>
                    ) : (
                      <ChoicePill key={j} selected={picked[d.id] === c} recommended={j === 0} onClick={() => setPicked(p => ({ ...p, [d.id]: c }))}>{c}</ChoicePill>
                    ))}
                    <ChoicePill tone="ai" selected={picked[d.id] === DELEGATE} onClick={() => setPicked(p => ({ ...p, [d.id]: DELEGATE }))}>
                      Laisser les agents décider
                    </ChoicePill>
                  </div>
                  {picked[d.id] === 'custom' && (
                    <input autoFocus value={customText[d.id] || ''} aria-label="Votre réponse" placeholder="Votre réponse…"
                      onChange={e => setCustomText(t => ({ ...t, [d.id]: e.target.value }))}
                      className="w-full h-10 text-sm border border-line rounded-lg px-3 outline-none focus:ring-2 focus:ring-action-border" />
                  )}
                </fieldset>
              );
            })}
          </section>
        </div>
      </div>

      {/* Barre de validation toujours visible en bas de l'écran */}
      <div className="shrink-0 bg-white border-t border-line px-4 py-2.5">
        <div className="max-w-[820px] mx-auto flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink-muted">
            {allAnswered ? 'Tout est tranché.' : `${answeredCount} sur ${decisions.length} tranchée${answeredCount > 1 ? 's' : ''}`}
          </p>
          <button type="button" disabled={!allAnswered || submitting}
            onClick={() => onSubmit(Object.fromEntries(decisions.map(d => [d.id, answerOf(d.id)])))}
            className="h-11 px-5 rounded-[10px] bg-action text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-action-dark disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? 'Lancement…' : 'Valider mes réponses et lancer la réunion'} <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
