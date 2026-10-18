import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleHelp, FileText, Coffee, Bot, ScrollText, ListChecks, GitPullRequest, NotebookPen, Radio, PlayCircle, Flag } from 'lucide-react';
import api from '../../utils/api';
import { Button } from '../ui';
import { ChoicePill } from '../DecisionCard';
import SummaryDisplayModal from '../SummaryDisplayModal';
import { notifyError, notifySuccess } from '../../utils/notify';
import { launchPreparation } from '../../utils/preparation';

// « À trancher » (v5.1, 16/10/2026) : tout ce qui attend l'humain, au même endroit, et les
// questions des agents auxquelles il répond ICI, sans rouvrir chaque réunion.

const isCustom = c => /^autre/i.test(c || '');

function QuestionItem({ projectId, item, onDone }) {
  const [choice, setChoice] = useState(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const answer = async (status, value) => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/sessions/${item.sessionId}/answer-decision`, { messageId: item.messageId, status, ...(value ? { answer: value } : {}) });
      // v5.1 (18/10/2026) : avant, « à la reprise de la réunion »… et rien ne la reprenait
      if (data.followUp === 'delegate') {
        await launchPreparation(projectId, item.sessionId, { delegate: true });
        notifySuccess(`Votre bras droit reprend « ${item.sessionTask} » avec votre réponse. Il revient vers vous à la fin.`);
      } else if (data.followUp === 'more') {
        notifySuccess(`Réponse enregistrée. ${data.remaining > 1 ? `${data.remaining} autres questions attendent` : 'Une autre question attend'} dans « ${item.sessionTask} ».`);
      } else {
        notifySuccess(`Réponse enregistrée. « ${item.sessionTask} » peut reprendre : elle vous attend ici.`);
      }
      onDone?.();
    } catch (err) { notifyError(err, 'La réponse n’a pas pu être enregistrée.'); setBusy(false); }
  };
  const value = choice === 'custom' ? custom.trim() : choice;
  return (
    <div className="space-y-2">
      <p className="text-[15px] font-bold text-ink leading-snug">{item.question}</p>
      {item.context && <p className="text-[13px] text-ink-muted">{item.context}</p>}
      <div className="flex flex-wrap gap-1.5">
        {item.choices.filter(c => !isCustom(c)).map((c, i) => (
          <ChoicePill key={c} selected={choice === c} recommended={i === 0} onClick={() => setChoice(c)}>{c}</ChoicePill>
        ))}
        <ChoicePill selected={choice === 'custom'} onClick={() => setChoice('custom')}>Autre…</ChoicePill>
      </div>
      {choice === 'custom' && (
        <>
          <label htmlFor={`c-${item.messageId}`} className="sr-only">Votre réponse</label>
          <input id={`c-${item.messageId}`} value={custom} onChange={e => setCustom(e.target.value)} maxLength={500} placeholder="Votre réponse"
            className="w-full h-10 border border-line rounded-[10px] px-3 text-sm outline-none focus:ring-2 focus:ring-action-border" />
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" disabled={!value || busy} onClick={() => answer('answered', value)}>Répondre</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => answer('delegated')}>Les agents décident</Button>
        <Link to={`/projects/${projectId}/meeting/${item.sessionId}`} className="text-[13px] font-bold ml-auto">Voir dans la réunion</Link>
      </div>
    </div>
  );
}

function MissionReportItem({ projectId, item, onDone }) {
  const [reading, setReading] = useState(false);
  const decide = async outcome => {
    try {
      await api.post(`/projects/${projectId}/missions/${item.missionId}/outcome`, { outcome });
      notifySuccess(outcome === 'integrated' ? 'Compte rendu intégré au projet.' : 'Compte rendu écarté.');
      setReading(false);
      onDone?.();
    } catch (err) { notifyError(err, 'Le choix n’a pas pu être enregistré.'); }
  };
  const actions = (
    <>
      <Button variant="primary" onClick={() => decide('integrated')}>Intégrer le CR au projet</Button>
      <Button variant="ghost" onClick={() => decide('discarded')}>Ne pas intégrer</Button>
    </>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 min-w-[220px] text-[15px] font-bold text-ink">Mission « {item.title} » ({item.agentName}) : compte rendu prêt</p>
      <Button size="sm" variant="secondary" onClick={() => setReading(true)}>Lire</Button>
      <Button size="sm" variant="primary" onClick={() => decide('integrated')}>Intégrer</Button>
      <Button size="sm" variant="ghost" onClick={() => decide('discarded')}>Ne pas intégrer</Button>
      {reading && <SummaryDisplayModal title={`Mission — ${item.title}`} content={item.report || ''} onClose={() => setReading(false)} actions={actions} />}
    </div>
  );
}

const META = {
  question:          { icon: CircleHelp,     tone: 'text-await' },
  delegation_note:   { icon: NotebookPen,    tone: 'text-ai' },
  prep_ready:        { icon: Coffee,         tone: 'text-ok' },
  mission_report:    { icon: FileText,       tone: 'text-ai' },
  mission_proposed:  { icon: Bot,            tone: 'text-ai' },
  decision_reopened: { icon: ScrollText,     tone: 'text-await' },
  actions_late:      { icon: ListChecks,     tone: 'text-await' },
  dev:               { icon: GitPullRequest, tone: 'text-action' },
  meeting_resume:    { icon: PlayCircle,     tone: 'text-action' },
  delegation_resume: { icon: PlayCircle,     tone: 'text-ai' },
  meeting_close:     { icon: Flag,           tone: 'text-ok' },
};

// Le bras droit termine la réunion qu'il tenait, avec vos réponses (v5.1, 18/10/2026)
function DelegationResumeItem({ projectId, item, onDone }) {
  const [busy, setBusy] = useState(false);
  const resume = async () => {
    setBusy(true);
    try {
      await launchPreparation(projectId, item.sessionId, { delegate: true });
      notifySuccess(`Votre bras droit reprend « ${item.sessionTask} ». Il revient vers vous à la fin.`);
      onDone?.();
    } catch (err) { notifyError(err, 'Le bras droit n’a pas pu reprendre la réunion.'); setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 min-w-[220px] text-[15px] text-ink-soft">Vous avez répondu aux questions de « {item.sessionTask} » : votre bras droit peut terminer la réunion.</p>
      <Link to={`/projects/${projectId}/meeting/${item.sessionId}`} state={{ resume: true }} className="h-9 px-3 inline-flex items-center rounded-[10px] text-[13px] font-bold text-ink-soft hover:bg-canvas">Je reprends moi-même</Link>
      <Button size="sm" variant="primary" disabled={busy} onClick={resume}>Le bras droit termine la réunion</Button>
    </div>
  );
}

function SimpleItem({ projectId, item }) {
  const p = `/projects/${projectId}`;
  // Construit seulement pour le type de l'élément (les champs diffèrent d'un type à l'autre)
  const build = {
    delegation_note: () => ({ text: <>Votre bras droit a tenu « {item.sessionTask} »{item.takenOver ? ' (vous avez repris la main)' : ''} : {item.headline}</>, to: `${p}/meeting/${item.sessionId}`, cta: 'Voir la réunion' }),
    prep_ready: () => ({ text: <>Réunion préparée par les agents : « {item.sessionTask} ». Leurs conclusions vous attendent.</>, to: `${p}/meeting/${item.sessionId}`, cta: 'Voir les conclusions' }),
    mission_proposed: () => ({ text: <>Mission proposée par {item.agentName} : « {item.title} »</>, to: `${p}/actions`, cta: 'Valider ou écarter' }),
    decision_reopened: () => ({ text: <>Décision remise en question : {item.statement}</>, to: `${p}/decisions`, cta: 'Voir' }),
    actions_late: () => ({ text: <>{item.count} action{item.count > 1 ? 's' : ''} en retard : {item.titles.join(' ; ')}</>, to: `${p}/actions`, cta: 'Voir' }),
    dev: () => ({ text: <>Développement « {item.title} » : {item.status === 'ready' ? 'prêt à relire' : 'la mise en ligne a échoué'}</>, to: `${p}/developpements`, cta: 'Voir' }),
    meeting_resume: () => ({ text: <>Vous avez répondu : « {item.sessionTask} » peut reprendre.</>, to: `${p}/meeting/${item.sessionId}`, state: { resume: true }, cta: 'Reprendre la réunion' }),
    meeting_close: () => ({ text: <>« {item.sessionTask} » est prête à conclure{item.reason ? ` : ${item.reason}` : '.'}</>, to: `${p}/meeting/${item.sessionId}`, state: { openClosure: true }, cta: 'Conclure' }),
  }[item.kind];
  const content = build?.();
  if (!content) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 min-w-[220px] text-[15px] text-ink-soft">{content.text}</p>
      <Link to={content.to} state={content.state} className="h-9 px-3 inline-flex items-center rounded-[10px] border border-line bg-white text-[13px] font-bold text-ink-soft hover:bg-canvas">{content.cta}</Link>
    </div>
  );
}

export default function InboxList({ project, inbox, onChanged, limit = null, compact = false }) {
  if (!inbox) return <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>;
  const items = limit ? inbox.items.slice(0, limit) : inbox.items;
  return (
    <div className="space-y-3">
      {inbox.running?.map(r => (
        <div key={r.sessionId} className="flex flex-wrap items-center gap-2 bg-ai-bg border border-ai-border rounded-2xl px-4 py-3">
          <Radio size={16} className="text-ai shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-[200px] text-sm font-semibold text-ai">{r.kind === 'delegate' ? 'Votre bras droit tient' : 'Les agents préparent'} « {r.task} ». Il revient vers vous à la fin.</p>
          <Link to={`/projects/${project.id}/meeting/${r.sessionId}`} className="text-[13px] font-bold">Suivre en direct</Link>
        </div>
      ))}
      {items.length === 0 ? (
        !inbox.running?.length && <p className="text-sm text-ink-muted py-6 text-center">Rien n’attend votre réponse. Votre bras droit vous préviendra.</p>
      ) : items.map(item => {
        const M = META[item.kind] || META.question;
        return (
          <article key={item.id} className={`bg-white border border-line rounded-2xl ${compact ? 'p-3.5' : 'p-4'} flex gap-3`}>
            <span className={`mt-0.5 shrink-0 ${M.tone}`}><M.icon size={18} aria-hidden="true" /></span>
            <div className="flex-1 min-w-0 space-y-1">
              {item.kind === 'question' && (
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint">
                  {item.agentName} · réunion « {item.sessionTask} »
                  {item.reserved && <span className="normal-case tracking-normal text-ai"> · gardée pour vous par le bras droit</span>}
                  {item.contestedAnswer && <span className="normal-case tracking-normal text-await"> · vous avez contesté « {item.contestedAnswer} »</span>}
                  {item.assignedByName && <span className="normal-case tracking-normal text-action"> · {item.assignedByName} vous demande votre avis</span>}
                </p>
              )}
              {item.kind === 'question' ? <QuestionItem projectId={project.id} item={item} onDone={onChanged} />
                : item.kind === 'mission_report' ? <MissionReportItem projectId={project.id} item={item} onDone={onChanged} />
                : item.kind === 'delegation_resume' ? <DelegationResumeItem projectId={project.id} item={item} onDone={onChanged} />
                : <SimpleItem projectId={project.id} item={item} />}
            </div>
          </article>
        );
      })}
      {limit && inbox.items.length > limit && (
        <Link to={`/projects/${project.id}/a-trancher`} className="block text-center text-sm font-bold">Tout voir · {inbox.items.length}</Link>
      )}
    </div>
  );
}
