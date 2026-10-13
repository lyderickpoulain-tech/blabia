import { useState } from 'react';
import { Check, Clock, MessagesSquare, UserRound, Hourglass } from 'lucide-react';
import { useDecisionPeople } from './meeting/decisionPeople';

const isCustom = c => /^autre/i.test(c || '');

// Pastille de choix : sélection lisible (fond clair + texte coloré + coche),
// jamais de texte blanc sur fond coloré.
export function ChoicePill({ selected, recommended, onClick, children, tone = 'action', ...rest }) {
  const sel = tone === 'ai'
    ? 'bg-ai-light border-ai text-ai'
    : 'bg-action-light border-action text-action';
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} {...rest}
      className={`min-h-[36px] px-3 py-1 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1.5 transition ${
        selected ? sel : `bg-white text-ink-soft hover:border-action-border hover:bg-action-light/40 ${recommended ? 'border-ai-border' : 'border-line'}`
      }`}>
      {selected && <Check size={14} aria-hidden="true" />}
      <span>{children}</span>
      {recommended && !selected && <span className="text-[11px] font-bold text-ai">recommandé</span>}
    </button>
  );
}

export const DELEGATE = '__delegate__';
const ASSIGN_ANY = '__assign_any__'; // « Laisser répondre quelqu'un » ; « @<id> » : une personne

// Question soumise à l'humain (refonte UX v5.1, version compacte) :
// choisir une réponse (ou « Laisser les agents décider »), puis Valider.
// Le premier choix est la recommandation des agents (consigne du prompt agent).
export default function DecisionCard({ message, onAnswer, onDefer, onDelegate, disabled, number, budget }) {
  const [choice, setChoice]     = useState(null);   // texte choisi | DELEGATE | ASSIGN_ANY | '@<userId>' | 'custom'
  const [customText, setCustomText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const people = useDecisionPeople();
  const others = people?.others || [];
  const me = people?.currentUserId;

  // ── Questions traitées : une ligne ─────────────────────────────────────────
  if (message.status === 'answered' || message.status === 'delegated' || message.status === 'deferred') {
    const meta = {
      answered:  { icon: <Check size={14} />,          cls: 'text-ok',     text: `${message.answer}${message.answeredByName && message.answeredBy !== me ? ` (${message.answeredByName})` : ''}` },
      delegated: { icon: <MessagesSquare size={14} />, cls: 'text-action', text: 'les agents décident' },
      deferred:  { icon: <Clock size={14} />,          cls: 'text-await',  text: 'reportée' },
    }[message.status];
    return (
      <div className="ml-[38px] flex items-center gap-2 py-1 text-[13px] min-w-0">
        <span className={`shrink-0 ${meta.cls}`}>{meta.icon}</span>
        <span className="text-ink-faint truncate">{message.question}</span>
        <span className={`font-bold shrink-0 max-w-[45%] truncate ${meta.cls}`}>→ {meta.text}</span>
      </div>
    );
  }

  // ── Question confiée à un autre humain ─────────────────────────────────────
  const awaiting = message.status === 'awaiting_human';
  const forMe = awaiting && (message.assignedTo ? message.assignedTo === me : message.assignedBy !== me);
  if (awaiting && !forMe) {
    const who = message.assignedToName || 'un autre participant';
    return (
      <div className="ml-[38px] my-1.5 border border-line bg-canvas rounded-xl px-3 py-2.5 space-y-1.5 min-w-0">
        <p className="text-sm font-bold text-ink leading-snug">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-muted mr-1.5">Question{number ? ` ${number}` : ''} · {message.agentName}</span>
          {message.question}
        </p>
        <p className="text-xs text-ink-muted flex flex-wrap items-center gap-x-2 gap-y-1">
          <Hourglass size={13} className="text-await" aria-hidden="true" />
          <span>En attente de la réponse de <strong className="text-ink-soft">{who}</strong>{message.assignedByName && message.assignedBy !== me ? ` (demandé par ${message.assignedByName})` : ''}.</span>
          {message.assignedBy === me && people?.onReclaim && !disabled && (
            <button type="button" onClick={() => people.onReclaim(message.id)} className="font-bold text-action hover:underline">Répondre moi-même</button>
          )}
        </p>
      </div>
    );
  }

  // ── Question en attente ────────────────────────────────────────────────────
  const run = async (fn) => {
    if (submitting || disabled) return;
    setSubmitting(true);
    try { await fn(); } finally { setSubmitting(false); }
  };
  const choices = (message.choices?.length ? message.choices : ['Autre (précise)']);
  const ready = choice && (choice !== 'custom' || customText.trim());
  const validate = () => run(() => {
    if (choice === DELEGATE) return onDelegate(message.id);
    if (choice === ASSIGN_ANY) return people.onAssign(message.id, null);
    if (choice?.startsWith('@')) return people.onAssign(message.id, choice.slice(1));
    return onAnswer(message.id, choice === 'custom' ? customText.trim() : choice);
  });

  return (
    <fieldset disabled={disabled || submitting}
      className="ml-[38px] my-1.5 bg-await-bg border border-await-border rounded-xl px-3 py-2.5 space-y-2 min-w-0 disabled:opacity-60">
      <legend className="float-left w-full text-sm font-bold text-ink leading-snug">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-await mr-1.5">
          {/* Numéro seul : le budget de questions (« Questions 3/4 » dans l'en-tête) n'est pas le nombre de cartes affichées */}
          <span title={budget ? `Budget de la réunion : ${budget} questions` : undefined}>Question{number ? ` ${number}` : ''}</span> · {message.agentName}
        </span>
        {message.question}
      </legend>
      {message.context && <p className="clear-both text-xs text-ink-muted leading-snug">{message.context}</p>}
      {forMe && (
        <p className="clear-both text-xs font-bold text-await flex items-center gap-1.5">
          <UserRound size={13} aria-hidden="true" /> {message.assignedByName || 'Un participant'} vous demande votre avis sur cette question.
        </p>
      )}

      <div className="clear-both flex flex-wrap gap-1.5">
        {choices.map((c, i) => isCustom(c) ? (
          <ChoicePill key={i} selected={choice === 'custom'} onClick={() => setChoice('custom')}>{c}</ChoicePill>
        ) : (
          <ChoicePill key={i} selected={choice === c} recommended={i === 0} onClick={() => setChoice(c)}>{c}</ChoicePill>
        ))}
        {onDelegate && (
          <ChoicePill tone="ai" selected={choice === DELEGATE} onClick={() => setChoice(DELEGATE)}>Laisser les agents décider</ChoicePill>
        )}
        {!awaiting && others.length > 0 && people?.onAssign && (
          <>
            <ChoicePill selected={choice === ASSIGN_ANY} onClick={() => setChoice(ASSIGN_ANY)}>
              {others.length === 1 ? `Laisser répondre ${others[0].name}` : 'Laisser répondre quelqu’un'}
            </ChoicePill>
            {others.length > 1 && (
              <label className={`min-h-[36px] pl-3 pr-1 rounded-full border text-[13px] font-semibold inline-flex items-center gap-1 transition ${
                choice?.startsWith('@') ? 'bg-action-light border-action text-action' : 'bg-white text-ink-soft border-line'
              }`}>
                Laisser répondre
                <select value={choice?.startsWith('@') ? choice : ''} onChange={e => setChoice(e.target.value || null)}
                  aria-label="Choisir la personne qui répond" className="bg-transparent outline-none font-bold py-1 pr-1">
                  <option value="">@…</option>
                  {others.map(o => <option key={o.userId} value={`@${o.userId}`}>@{o.name}</option>)}
                </select>
              </label>
            )}
          </>
        )}
      </div>
      {(choice === ASSIGN_ANY || choice?.startsWith('@')) && (
        <p className="text-xs text-ink-muted">
          {choice === ASSIGN_ANY && others.length > 1
            ? 'Les autres participants reçoivent un e-mail ; la première réponse est retenue. La réunion attend.'
            : `${choice === ASSIGN_ANY ? others[0].name : others.find(o => `@${o.userId}` === choice)?.name} reçoit un e-mail et répond depuis la réunion. La réunion attend sa réponse.`}
        </p>
      )}

      {choice === 'custom' && (
        <input autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ready) { e.preventDefault(); validate(); } }}
          placeholder="Votre réponse…" aria-label="Votre réponse"
          className="w-full h-9 text-[13px] border border-line rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-action-border" />
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button type="button" onClick={validate} disabled={!ready}
          className="h-9 px-4 rounded-lg bg-action text-white text-[13px] font-bold hover:bg-action-dark disabled:opacity-40 disabled:cursor-not-allowed">
          Valider
        </button>
        {!forMe && (
          <button type="button" onClick={() => run(() => onDefer(message.id))} className="min-h-[32px] text-[13px] font-semibold text-ink-muted hover:text-ink">
            Plus tard
          </button>
        )}
        {submitting && <span className="w-3.5 h-3.5 border-2 border-action border-t-transparent rounded-full animate-spin" />}
      </div>
    </fieldset>
  );
}
