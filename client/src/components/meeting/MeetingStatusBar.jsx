import { CircleHelp, PlayCircle, Flag, Rocket, MessageSquare } from 'lucide-react';
import { Button } from '../ui';
import { meetingState } from '../../utils/meetingState';

// Ce qui suit, toujours affiché quand les agents ne parlent pas (v5.1, 18/10/2026 — constats sur
// « WorldOfMetal ») : une question vous attend / vos réponses sont prêtes / prête à conclure /
// à vous. Remplace la bannière « objectif atteint », qui disparaissait au rechargement et
// s'affichait même quand une question restait ouverte.
export default function MeetingStatusBar({
  messages, isStreaming, isClosed, intention, hasDevRepo = false, delegation = null,
  onShowQuestion, onResume, onConclude, onDelegateResume,
}) {
  if (isClosed || isStreaming) return null;
  const st = meetingState(messages);
  if (st.state === 'empty') return null;
  const code = intention === 'claude_code';
  const delegated = delegation && ['done', 'stopped'].includes(delegation.status) && !delegation.note?.takenOver;
  const concludeLabel = code
    ? <><Rocket size={15} aria-hidden="true" /> {hasDevRepo ? 'Générer le prompt et lancer le développement' : 'Générer le prompt et conclure'}</>
    : <><Flag size={15} aria-hidden="true" /> Conclure la réunion</>;

  // Point de vigilance du contradicteur encore ouvert : il attend aussi l'avis de l'humain
  const vigilance = messages.find(m => m.vigilance?.status === 'open');
  const vigilanceNote = vigilance && st.state !== 'question'
    ? <button type="button" onClick={() => onShowQuestion(vigilance)} className="block mt-1 text-[13px] font-bold text-await hover:underline text-left">Un point de vigilance attend votre avis : « J’en tiens compte » ou « Écarter ».</button>
    : null;

  const view = {
    question: {
      tone: 'bg-await-bg border-await-border', icon: CircleHelp, iconTone: 'text-await',
      title: st.pendingCount > 1 ? `${st.pendingCount} questions vous attendent` : 'Une question vous attend',
      text: st.closeSuggested ? 'Pour le reste, les agents estiment l’objectif atteint : répondez, puis vous pourrez conclure.' : 'Les agents reprennent dès que vous avez répondu.',
      actions: <Button size="sm" variant="primary" onClick={() => onShowQuestion(st.pending[0])}>Voir la question</Button>,
    },
    answers_ready: {
      tone: 'bg-action-light/60 border-action-border', icon: PlayCircle, iconTone: 'text-action',
      title: 'Vos réponses sont prêtes',
      text: delegated ? 'Votre bras droit peut terminer la réunion avec elles, ou vous la reprenez vous-même.' : 'Les agents en tiennent compte dès qu’ils reprennent.',
      actions: <>
        {delegated && <Button size="sm" variant="secondary" onClick={onDelegateResume}>Le bras droit termine la réunion</Button>}
        <Button size="sm" variant="primary" onClick={onResume}>Reprendre les échanges</Button>
      </>,
    },
    ready_to_close: {
      tone: code ? 'bg-ai-bg border-ai-border' : 'bg-ok-light border-ok-border', icon: Flag, iconTone: code ? 'text-ai' : 'text-ok',
      title: code ? 'Les agents estiment que les besoins sont clarifiés' : 'Les agents estiment que l’objectif est atteint',
      text: st.closeReason,
      actions: <>
        <Button size="sm" variant="ghost" onClick={onResume}>Continuer les échanges</Button>
        <Button size="sm" variant="primary" onClick={onConclude}>{concludeLabel}</Button>
      </>,
    },
    idle: {
      tone: 'bg-white border-line', icon: MessageSquare, iconTone: 'text-ink-muted',
      title: 'Les échanges sont en pause',
      text: 'À vous : écrivez à l’équipe ci-dessous, relancez les échanges, ou concluez si vous avez ce qu’il vous faut.',
      actions: <>
        <Button size="sm" variant="ghost" onClick={onConclude}>Conclure</Button>
        <Button size="sm" variant="secondary" onClick={onResume}>Relancer les échanges</Button>
      </>,
    },
  }[st.state];
  if (!view) return null;
  const Icon = view.icon;
  return (
    <div role="status" className={`shrink-0 mx-3 mb-2 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${view.tone}`}>
      <Icon size={20} strokeWidth={1.75} className={`shrink-0 ${view.iconTone}`} aria-hidden="true" />
      <div className="flex-1 min-w-[200px]">
        <p className={`text-sm font-extrabold ${view.iconTone === 'text-ink-muted' ? 'text-ink' : view.iconTone}`}>{view.title}</p>
        {view.text && <p className="text-[13px] text-ink-soft mt-0.5 leading-snug">{view.text}</p>}
        {vigilanceNote}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">{view.actions}</div>
    </div>
  );
}
