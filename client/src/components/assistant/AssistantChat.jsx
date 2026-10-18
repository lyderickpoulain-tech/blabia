import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, Sparkles, Radio, ArrowUpDown } from 'lucide-react';
import api from '../../utils/api';
import { Button } from '../ui';
import Markdown from '../Markdown';
import { notifyError, notifySuccess } from '../../utils/notify';
import DelegateMeetingModal from '../DelegateMeetingModal';
import { quickStartMeeting, quickStartError } from '../../utils/quickMeeting';
import { launchPreparation } from '../../utils/preparation';
import { useProject } from '../project/ProjectShell';
import ArtifactCard from '../meeting/ArtifactCard';

// Conversation avec le bras droit (v5.1) : page « Bras droit » et panneau toujours disponible
// (BrasDroitDock). Sur un bouton, l'acteur est toujours nommé (« le bras droit », « vous ») :
// la première personne est réservée à ses messages.

// Dernier message du bras droit vu (par projet) : la bulle de BrasDroitDock ne rappelle que
// ce que vous n'avez pas lu, ici ou dans le panneau
const seenKey = projectId => `blabia:bd-seen:${projectId}`;
export const readSeen = projectId => { try { return localStorage.getItem(seenKey(projectId)); } catch { return null; } };
export const writeSeen = (projectId, id) => { try { localStorage.setItem(seenKey(projectId), id); } catch { /* stockage indisponible : la bulle reviendra */ } };

const SUGGESTIONS = [
  'Qu’est-ce que je dois trancher ?',
  'Où en est le projet ?',
  'Quelle est la prochaine étape, et pourquoi ?',
];

export function Avatar({ size = 'md' }) {
  const s = size === 'lg' ? 'w-12 h-12 text-lg' : size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-8 h-8 text-xs';
  return <span aria-hidden="true" className={`${s} shrink-0 rounded-full bg-ai text-white inline-flex items-center justify-center font-extrabold`}>BD</span>;
}

// Trois façons de tenir une réunion
export function MeetingChoices({ meeting, onDelegate, onPrepare, onHold, stacked = false }) {
  return (
    <div className={`flex flex-wrap gap-2 ${stacked ? 'mt-3' : ''}`}>
      <Button size="sm" variant="primary" onClick={() => onDelegate(meeting)}>Le bras droit tient la réunion</Button>
      <Button size="sm" variant="secondary" onClick={() => onPrepare(meeting)}>Les assistants la préparent</Button>
      <Button size="sm" variant="ghost" onClick={() => onHold(meeting)}>Vous tenez la réunion</Button>
    </div>
  );
}

function Proposal({ proposal, ...choices }) {
  return (
    <div className="border border-line rounded-xl px-3.5 py-3 space-y-2.5 bg-white">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai">Réunion {proposal.ref} · à tenir</p>
        <p className="text-[15px] font-extrabold text-ink">{proposal.title}</p>
      </div>
      <MeetingChoices meeting={proposal} {...choices} />
    </div>
  );
}

const MEETING_KIND = { decision: 'Décider', claude_code: 'Construire', stack: 'Outils' };

// « Occupe-toi de la prochaine réunion » (v5.1, F2) : le bras droit la tient aussitôt
function DelegateCard({ projectId, proposal, onFallback }) {
  if (proposal.status === 'started') {
    return (
      <div className="border border-ai-border bg-white rounded-xl px-3.5 py-3 flex flex-wrap items-center gap-2">
        <Radio size={16} className="text-ai shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[200px] text-sm text-ink-soft">Je tiens « <strong className="text-ink">{proposal.title}</strong> » à votre place. Je reviens vers vous à la fin.</p>
        {proposal.sessionId && <Link to={`/projects/${projectId}/meeting/${proposal.sessionId}`} className="text-[13px] font-bold">Suivre en direct</Link>}
      </div>
    );
  }
  if (proposal.status === 'failed') {
    return (
      <div className="border border-await-border bg-await-bg rounded-xl px-3.5 py-3 space-y-2">
        <p className="text-sm font-bold text-await">Je n’ai pas pu lancer « {proposal.title} »{proposal.error ? ` : ${proposal.error}` : '.'}</p>
        <MeetingChoices meeting={proposal} {...onFallback} />
      </div>
    );
  }
  return <p className="text-sm font-semibold text-ai flex items-center gap-2"><span className="w-4 h-4 border-2 border-ai border-t-transparent rounded-full animate-spin" aria-hidden="true" /> Je lance la réunion…</p>;
}

// Déplacer une réunion dans le plan, sur proposition du bras droit (v5.1, F2)
function ReorderCard({ projectId, messageId, proposal, onDecided }) {
  const [busy, setBusy] = useState(false);
  const decide = async accept => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/assistant/${messageId}/reorder`, { accept });
      onDecided(data.message, accept);
      if (accept) notifySuccess(`« ${proposal.move.title} » passe avant « ${proposal.before.title} ».`);
    } catch (err) { notifyError(err, 'Le plan n’a pas pu être modifié.'); }
    setBusy(false);
  };
  return (
    <div className="border border-ai-border bg-white rounded-xl px-3.5 py-3 space-y-2.5">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai flex items-center gap-1.5"><ArrowUpDown size={13} aria-hidden="true" /> Changer l’ordre du plan</p>
      <p className="text-sm text-ink-soft">Tenir « <strong className="text-ink">{proposal.move.title}</strong> » juste avant « <strong className="text-ink">{proposal.before.title}</strong> ».</p>
      {proposal.status === 'pending' ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>D’accord, changer l’ordre</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>Pas maintenant</Button>
        </div>
      ) : (
        <p className={`text-xs font-bold ${proposal.status === 'applied' ? 'text-ok' : 'text-ink-muted'}`}>{proposal.status === 'applied' ? 'Fait : le plan est à jour.' : 'Vous avez gardé l’ordre actuel.'}</p>
      )}
    </div>
  );
}

// Le projet évolue (v5.1, étape C du test « Gérard ») : ce que propose le bras droit, appliqué
// seulement sur l'accord de l'humain (brief, réunions insérées dans le plan, site ou appli)
function EvolutionProposal({ projectId, messageId, proposal, onDecided }) {
  const [busy, setBusy] = useState(false);
  const decide = async accept => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/assistant/${messageId}/evolution`, { accept });
      onDecided(data.message, accept);
      if (accept) notifySuccess(proposal.meetings.length ? 'Projet mis à jour : les réunions sont ajoutées au plan.' : 'Projet mis à jour.');
    } catch (err) { notifyError(err, 'Le projet n’a pas pu être mis à jour.'); }
    setBusy(false);
  };
  const done = proposal.status !== 'pending';
  return (
    <div className={`border rounded-xl px-3.5 py-3 space-y-2.5 bg-white ${done ? 'border-line' : 'border-ai-border'}`}>
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai flex items-center gap-1.5"><Sparkles size={13} aria-hidden="true" /> Faire évoluer le projet</p>
      {proposal.summary && <p className="text-[15px] font-extrabold text-ink">{proposal.summary}</p>}
      <ul className="space-y-1.5 text-sm text-ink-soft">
        {proposal.brief && <li><strong className="text-ink">Ajouté au brief :</strong> {proposal.brief}</li>}
        {proposal.meetings.map(m => (
          <li key={m.title} className="flex items-start gap-2">
            <span className="shrink-0 mt-0.5 text-[11px] font-bold text-ink-muted bg-muted-light rounded-full px-2 py-0.5">{MEETING_KIND[m.type] || 'Décider'}</span>
            <span><strong className="text-ink">Réunion « {m.title} »</strong>{m.why && <span className="block text-xs text-ink-muted">{m.why}</span>}</span>
          </li>
        ))}
        {proposal.meetings.length > 0 && <li className="text-xs text-ink-muted">{proposal.after ? `Placées juste après « ${proposal.after.title} ».` : 'Placées à la fin du plan.'}</li>}
        {proposal.technical && <li className="text-xs text-ink-muted">Le projet devient un site ou une appli à construire : la page Outils apparaît.</li>}
      </ul>
      {done ? (
        <p className={`text-xs font-bold ${proposal.status === 'applied' ? 'text-ok' : 'text-ink-muted'}`}>
          {proposal.status === 'applied' ? 'Vous avez accepté : le projet est à jour.' : 'Vous avez écarté cette proposition.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>D’accord, mettre le projet à jour</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>Pas maintenant</Button>
        </div>
      )}
    </div>
  );
}

// Note de retour d'une réunion tenue par le bras droit
function DelegationReport({ projectId, report, onOpen }) {
  const [contested, setContested] = useState(() => new Set());
  const contest = async d => {
    try {
      await api.post(`/projects/${projectId}/sessions/${report.sessionId}/contest-decision`, { messageId: d.id });
      setContested(s => new Set(s).add(d.id));
      notifySuccess('Contesté : la question vous revient (page « À trancher »).');
    } catch (err) { notifyError(err, 'La contestation n’a pas abouti.'); }
  };
  const waitingCount = report.waiting.length + contested.size;
  return (
    <div className="space-y-2.5">
      {report.takenOver ? <p className="text-xs font-bold text-await">Vous avez repris la main en cours de réunion.</p>
        : report.stoppedOnBlock && <p className="text-xs font-bold text-await">La réunion s’est arrêtée sur une question qui vous est réservée.</p>}
      {report.decided.length > 0 && (
        <div className="border border-ok-border bg-white rounded-xl px-3.5 py-3 space-y-2">
          <p className="text-[13px] font-extrabold text-ok">Décidé à votre place, dans votre cadre · {report.decided.length}</p>
          <ul className="space-y-2">
            {report.decided.map(d => (
              <li key={d.id} className="flex flex-wrap items-start gap-2 text-sm">
                <span className="flex-1 min-w-[200px] text-ink-soft"><strong className="text-ink">{d.question}</strong> → {d.answer}{d.reason && <span className="block text-xs text-ink-muted">{d.reason}</span>}</span>
                {contested.has(d.id)
                  ? <span className="text-xs font-bold text-await">Contesté</span>
                  : <Button size="sm" variant="ghost" className="!h-8 !text-await" onClick={() => contest(d)}>Contester</Button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.waiting.length > 0 && (
        <div className="border border-await-border bg-await-bg rounded-xl px-3.5 py-3 space-y-1.5">
          <p className="text-[13px] font-extrabold text-await">Vous attend · {report.waiting.length}</p>
          {report.waiting.map(w => <p key={w.id} className="text-sm font-semibold text-ink">{w.question}</p>)}
        </div>
      )}
      <Button size="sm" variant="primary" onClick={() => onOpen(report, waitingCount === 0)}>
        {waitingCount ? 'Trancher maintenant' : 'Valider et conclure la réunion'}
      </Button>
    </div>
  );
}

export default function AssistantChat({ project, compact = false, reloadKey = null, onChanged }) {
  const navigate = useNavigate();
  const projectCtx = useProject(); // absent hors des pages du projet (salle de réunion)
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [delegating, setDelegating] = useState(null);
  const feedRef = useRef(null);

  useEffect(() => {
    api.get(`/projects/${project.id}/assistant`).then(({ data }) => setMessages(data.messages))
      .catch(err => { notifyError(err, 'La conversation n’a pas pu être chargée.'); setMessages([]); });
  }, [project.id, reloadKey]);
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);
  // Affiché ici = lu
  useEffect(() => {
    const lastReply = [...(messages || [])].reverse().find(m => m.role === 'assistant');
    if (lastReply) writeSeen(project.id, lastReply.id);
  }, [messages, project.id]);

  const send = async text => {
    const message = String(text ?? draft).trim();
    if (!message || sending) return;
    setDraft('');
    setSending(true);
    const temp = { id: `tmp-${Date.now()}`, role: 'human', content: message };
    setMessages(prev => [...(prev || []), temp]);
    try {
      const { data } = await api.post(`/projects/${project.id}/assistant`, { message });
      setMessages(prev => [...prev.filter(m => m.id !== temp.id), data.human, data.reply]);
      if (data.reply.proposal?.kind === 'delegate' && data.reply.proposal.status === 'pending') startDelegation(data.reply);
    } catch (err) {
      notifyError(err, 'Le bras droit n’a pas pu répondre.');
      setMessages(prev => prev.filter(m => m.id !== temp.id));
      setDraft(message);
    }
    setSending(false);
  };

  // Un clic : réunion créée avec les assistants proposés (utils/quickMeeting.js)
  const startMeeting = async (m, prepare) => {
    try {
      const s = await quickStartMeeting(project, m, { prepare });
      if (s.alreadyOpen) { notifySuccess(`« ${m.title} » est déjà ouverte : vous la rejoignez.`); navigate(`/projects/${project.id}/meeting/${s.id}`); return; }
      if (prepare) {
        await launchPreparation(project.id, s.id);
        notifySuccess(`Les assistants préparent « ${m.title} ». Je vous préviens quand c’est prêt.`);
        onChanged?.();
        return;
      }
      navigate(`/projects/${project.id}/meeting/${s.id}`, { state: { autoStart: true } });
    } catch (err) { notifyError(err, quickStartError(err)); }
  };
  const choices = { onDelegate: m => setDelegating(m), onPrepare: m => startMeeting(m, true), onHold: m => startMeeting(m, false) };
  const openReport = async (report, conclude) => {
    await api.post(`/projects/${project.id}/sessions/${report.sessionId}/delegation/ack`).catch(() => {});
    onChanged?.();
    if (conclude) navigate(`/projects/${project.id}/meeting/${report.sessionId}`, { state: { openClosure: true } });
    else navigate(`/projects/${project.id}/a-trancher`);
  };

  const evolutionDecided = (updated, accepted) => {
    setMessages(prev => prev.map(x => (x.id === updated.id ? updated : x)));
    if (accepted) { projectCtx?.reloadProject?.(); onChanged?.(); }
  };

  // « Occupe-toi de… » : la réunion est créée avec le cadre par défaut et confiée au bras droit
  const startDelegation = async reply => {
    const p = reply.proposal;
    let patch;
    try {
      const s = await quickStartMeeting(project, p, { delegation: {} });
      await launchPreparation(project.id, s.id, { delegate: true });
      patch = { sessionId: s.id };
      onChanged?.();
    } catch (err) { patch = { failed: quickStartError(err) }; }
    try {
      const { data } = await api.post(`/projects/${project.id}/assistant/${reply.id}/delegated`, patch);
      setMessages(prev => prev.map(x => (x.id === data.message.id ? data.message : x)));
    } catch { setMessages(prev => prev.map(x => (x.id === reply.id ? { ...x, proposal: { ...p, status: patch.failed ? 'failed' : 'started', ...patch } } : x))); }
  };
  const proposalDecided = updated => setMessages(prev => prev.map(x => (x.id === updated.id ? updated : x)));

  const pad = compact ? 'p-3.5 space-y-3' : 'p-5 space-y-4';
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div ref={feedRef} role="log" aria-label="Conversation avec le bras droit"
        className={`flex-1 overflow-y-auto ${pad} ${compact ? 'min-h-0' : 'max-h-[60vh] min-h-[320px]'}`}>
        {messages === null ? (
          <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
        ) : messages.length === 0 ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm text-ink-muted">Posez une question sur le projet, demandez ce qui vous attend ou la prochaine étape.</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map(s => (
                <button key={s} type="button" onClick={() => send(s)} disabled={project.isDemo}
                  className="h-9 px-3 rounded-full border border-line bg-white text-[13px] font-bold text-ink-soft hover:border-action-border hover:text-action disabled:opacity-50">{s}</button>
              ))}
            </div>
          </div>
        ) : messages.map(m => (m.role === 'human' ? (
          <div key={m.id} className="flex justify-end">
            <p className={`max-w-[80%] bg-action text-white rounded-[14px] rounded-br-[4px] px-3.5 py-2 ${compact ? 'text-sm' : 'text-[15px]'} leading-[1.45] whitespace-pre-wrap`}>{m.content}</p>
          </div>
        ) : (
          <div key={m.id} className={`flex gap-2.5 ${compact ? '' : 'max-w-[88%]'}`}>
            <Avatar size={compact ? 'sm' : 'md'} />
            <div className="flex-1 min-w-0 space-y-2">
              <div className={`bg-ai-bg border border-ai-border rounded-[14px] rounded-tl-[4px] px-3.5 py-2.5 ${compact ? 'text-sm' : 'text-[15px]'} leading-[1.5] text-ink-soft`}>
                {m.proposal?.kind === 'delegation_report' && <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai mb-1">Réunion tenue · « {m.proposal.meetingTitle} »</p>}
                <Markdown size="bubble">{m.content}</Markdown>
              </div>
              {m.sources?.length > 0 && (
                <div className="flex flex-wrap gap-1.5" aria-label="Sources">
                  {m.sources.map(s => <span key={s} className="text-xs font-bold text-ink-muted bg-muted-light rounded-full px-2.5 py-1">{s}</span>)}
                </div>
              )}
              {m.proposal?.kind === 'delegation_report' ? (
                <DelegationReport projectId={project.id} report={m.proposal} onOpen={openReport} />
              ) : m.proposal?.kind === 'artifact' ? (
                // Illustration des choix faits (polices, couleurs…), à la demande (v5.1, retour du 18/10)
                <div className="border border-ai-border rounded-xl overflow-hidden bg-white"><ArtifactCard artifact={m.proposal.artifact} /></div>
              ) : m.proposal?.kind === 'delegate' && !project.isDemo ? (
                <DelegateCard projectId={project.id} proposal={m.proposal} onFallback={choices} />
              ) : m.proposal?.kind === 'reorder' && !project.isDemo ? (
                <ReorderCard projectId={project.id} messageId={m.id} proposal={m.proposal} onDecided={proposalDecided} />
              ) : m.proposal?.kind === 'evolution' ? (
                <EvolutionProposal projectId={project.id} messageId={m.id} proposal={m.proposal} onDecided={evolutionDecided} />
              ) : m.proposal && !project.isDemo && (
                <Proposal proposal={m.proposal} {...choices} />
              )}
            </div>
          </div>
        )))}
        {sending && (
          <div className="flex gap-2.5 items-center text-sm text-ai font-semibold">
            <Avatar size={compact ? 'sm' : 'md'} /> Le bras droit vérifie dans le projet…
          </div>
        )}
      </div>
      <form className="border-t border-line p-3 flex gap-2 shrink-0" onSubmit={e => { e.preventDefault(); send(); }}>
        <label htmlFor={compact ? 'bd-input-dock' : 'bd-input'} className="sr-only">Votre message au bras droit</label>
        <input id={compact ? 'bd-input-dock' : 'bd-input'} value={draft} onChange={e => setDraft(e.target.value)} disabled={sending || project.isDemo} maxLength={4000}
          placeholder={project.isDemo ? 'Projet exemple : le bras droit n’est pas sollicité.' : 'Demandez-lui ce que vous voulez…'}
          className="flex-1 min-w-0 h-11 border border-line rounded-[10px] px-3.5 text-[15px] bg-white outline-none focus:ring-2 focus:ring-action-border disabled:bg-canvas" />
        <Button type="submit" variant="primary" disabled={!draft.trim() || sending || project.isDemo} aria-label="Envoyer"><Send size={16} aria-hidden="true" /></Button>
      </form>

      {delegating && (
        <DelegateMeetingModal project={project} milestone={delegating} onClose={() => setDelegating(null)}
          onLaunched={() => { setDelegating(null); onChanged?.(); }} />
      )}
    </div>
  );
}
