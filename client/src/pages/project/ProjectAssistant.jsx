import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, Trash2, CalendarClock, AlertTriangle, Check, Hourglass, Radio } from 'lucide-react';
import api from '../../utils/api';
import { useProject } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';
import Markdown from '../../components/Markdown';
import useMissions from '../../hooks/useMissions';
import { notifyError, notifySuccess } from '../../utils/notify';
import DelegateMeetingModal from '../../components/DelegateMeetingModal';
import { stopPreparation } from '../../utils/preparation';

// Bras droit (v5.1, 16/10/2026, étape 1) : l'interlocuteur principal de l'humain sur le projet,
// en tête-à-tête (routes/assistant.js). Il connaît tout le projet, cite ses sources et propose
// la prochaine réunion utile ; il ne modifie rien lui-même. Sur un bouton, l'acteur est
// toujours nommé (« le bras droit », « vous ») : la première personne est réservée à ses messages.

const SUGGESTIONS = [
  'Où en est le projet ?',
  'Qu’avait-on décidé sur le budget ?',
  'Quelle est la prochaine étape, et pourquoi ?',
];

function Avatar({ size = 'md' }) {
  const s = size === 'lg' ? 'w-12 h-12 text-lg' : 'w-8 h-8 text-xs';
  return <span aria-hidden="true" className={`${s} shrink-0 rounded-full bg-ai text-white inline-flex items-center justify-center font-extrabold`}>BD</span>;
}

// Trois façons de tenir une réunion ; l'acteur est toujours nommé
function MeetingChoices({ meeting, onDelegate, onPrepare, onHold, stacked = false }) {
  return (
    <div className={`flex flex-wrap gap-2 ${stacked ? 'mt-3' : ''}`}>
      <Button size="sm" variant="primary" onClick={() => onDelegate(meeting)}>Le bras droit tient la réunion</Button>
      <Button size="sm" variant="secondary" onClick={() => onPrepare(meeting)}>Les agents la préparent</Button>
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

// Note de retour d'une réunion tenue par le bras droit (v5.1, étape 2)
function DelegationReport({ projectId, report, onOpen }) {
  const [contested, setContested] = useState(() => new Set());
  const contest = async d => {
    try {
      await api.post(`/projects/${projectId}/sessions/${report.sessionId}/contest-decision`, { messageId: d.id });
      setContested(s => new Set(s).add(d.id));
      notifySuccess('Contesté : la question vous revient dans la réunion.');
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
                <span className="flex-1 min-w-[220px] text-ink-soft"><strong className="text-ink">{d.question}</strong> → {d.answer}{d.reason && <span className="block text-xs text-ink-muted">{d.reason}</span>}</span>
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
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => onOpen(report, waitingCount === 0)}>
          {waitingCount ? 'Trancher dans la réunion' : 'Valider et conclure la réunion'}
        </Button>
      </div>
    </div>
  );
}

export default function ProjectAssistant() {
  const { project, counts } = useProject();
  const navigate = useNavigate();
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [plan, setPlan] = useState(null);
  const [sessions, setSessions] = useState([]);
  const { missions } = useMissions(project.id);
  const feedRef = useRef(null);
  const [delegating, setDelegating] = useState(null); // réunion à confier au bras droit

  const loadMessages = () => api.get(`/projects/${project.id}/assistant`).then(({ data }) => setMessages(data.messages));
  const loadSessions = () => api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => {});
  useEffect(() => {
    loadMessages().catch(err => { notifyError(err, 'La conversation n’a pas pu être chargée.'); setMessages([]); });
    api.get(`/projects/${project.id}/plan`).then(({ data }) => setPlan(data)).catch(() => setPlan({ milestones: [] }));
    loadSessions();
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Réunion tenue par le bras droit : suivi jusqu'à sa note de retour
  const delegatedRunning = sessions.filter(s => s.prepRunning && s.runKind === 'delegate');
  useEffect(() => {
    if (!delegatedRunning.length) return undefined;
    const t = setInterval(async () => {
      const { data } = await api.get(`/projects/${project.id}/sessions`).catch(() => ({ data: null }));
      if (!data) return;
      setSessions(data);
      if (!data.some(s => s.prepRunning && s.runKind === 'delegate')) loadMessages().catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [delegatedRunning.length, project.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending]);

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
    } catch (err) {
      notifyError(err, 'Le bras droit n’a pas pu répondre.');
      setMessages(prev => prev.filter(m => m.id !== temp.id));
      setDraft(message);
    }
    setSending(false);
  };

  const clear = async () => {
    if (!confirm('Effacer votre conversation avec le bras droit ? Le projet (réunions, décisions, actions) n’est pas touché.')) return;
    try { await api.delete(`/projects/${project.id}/assistant`); setMessages([]); }
    catch (err) { notifyError(err, 'La conversation n’a pas pu être effacée.'); }
  };

  const startMeeting = (m, prepare) => navigate(`/projects/${project.id}/meeting/new`, {
    state: { milestoneId: m.milestoneId || m.id, milestoneTitle: m.title, milestoneType: m.type, autoPrepare: prepare },
  });
  const choices = {
    onDelegate: m => setDelegating(m),
    onPrepare: m => startMeeting(m, true),
    onHold: m => startMeeting(m, false),
  };
  const openReport = async (report, conclude) => {
    await api.post(`/projects/${project.id}/sessions/${report.sessionId}/delegation/ack`).catch(() => {});
    navigate(`/projects/${project.id}/meeting/${report.sessionId}`, { state: conclude ? { openClosure: true } : {} });
  };

  const milestones = [...(plan?.milestones || [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const nextIdx = milestones.findIndex(m => m.status !== 'done');
  const next = nextIdx >= 0 ? milestones[nextIdx] : null;
  // Ce qui attend l'humain (mêmes sources que le tableau de bord)
  const waiting = [
    ...sessions.filter(s => s.prepReady).map(s => ({ key: s.id, text: `Conclusions préparées : « ${s.task} »`, to: `/projects/${project.id}/meeting/${s.id}` })),
    ...sessions.filter(s => s.status === 'open' && s.delegation && ['done', 'stopped'].includes(s.delegation.status) && !s.delegation.reviewed)
      .map(s => ({ key: `d-${s.id}`, text: `Note de retour du bras droit : « ${s.task} »`, to: `/projects/${project.id}/meeting/${s.id}` })),
    ...missions.filter(m => m.status === 'done' && !m.outcome).map(m => ({ key: m.id, text: `Compte rendu de mission à examiner : « ${m.title} »`, to: 'actions' })),
    ...missions.filter(m => m.status === 'proposed').map(m => ({ key: m.id, text: `Mission proposée à valider : « ${m.title} »`, to: 'actions' })),
    counts.decisionsReopened > 0 && { key: 'reopened', text: `${counts.decisionsReopened} décision${counts.decisionsReopened > 1 ? 's remises' : ' remise'} en question`, to: 'decisions' },
    counts.actionsOverdue > 0 && { key: 'late', text: `${counts.actionsOverdue} action${counts.actionsOverdue > 1 ? 's' : ''} en retard`, to: 'actions' },
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap gap-5 items-start">
      <section className="flex-[999_1_560px] min-w-0 flex flex-col gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-extrabold text-ink">Votre bras droit</h1>
            <p className="text-sm text-ink-muted mt-0.5">Il connaît tout le projet, vérifie avant de répondre et vous propose la suite. Il ne modifie rien sans vous.</p>
          </div>
          {messages?.length > 0 && (
            <Button size="sm" variant="ghost" onClick={clear} title="Effacer la conversation"><Trash2 size={15} aria-hidden="true" /> <span className="hidden sm:inline">Effacer</span></Button>
          )}
        </div>

        <Card className="p-0 overflow-hidden">
          <div ref={feedRef} role="log" aria-label="Conversation avec le bras droit" className="max-h-[60vh] min-h-[320px] overflow-y-auto p-5 space-y-4">
            {messages === null ? (
              <div className="flex justify-center py-10"><span className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
            ) : messages.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-ink-muted">Posez une question sur le projet, demandez un point ou la prochaine étape.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" onClick={() => send(s)} className="h-9 px-3 rounded-full border border-line bg-white text-[13px] font-bold text-ink-soft hover:border-action-border hover:text-action">{s}</button>
                  ))}
                </div>
              </div>
            ) : messages.map(m => (m.role === 'human' ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[75%] bg-action text-white rounded-[14px] rounded-br-[4px] px-3.5 py-2 text-[15px] leading-[1.45] whitespace-pre-wrap">{m.content}</p>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2.5 max-w-[88%]">
                <Avatar />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="bg-ai-bg border border-ai-border rounded-[14px] rounded-tl-[4px] px-3.5 py-2.5 text-[15px] leading-[1.5] text-ink-soft">
                    <Markdown size="bubble">{m.content}</Markdown>
                  </div>
                  {m.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="Sources">
                      {m.sources.map(s => <span key={s} className="text-xs font-bold text-ink-muted bg-muted-light rounded-full px-2.5 py-1">{s}</span>)}
                    </div>
                  )}
                  {m.proposal?.kind === 'delegation_report' ? (
                    <DelegationReport projectId={project.id} report={m.proposal} onOpen={openReport} />
                  ) : m.proposal && !project.isDemo && (
                    <Proposal proposal={m.proposal} {...choices} />
                  )}
                </div>
              </div>
            )))}
            {sending && (
              <div className="flex gap-2.5 items-center text-sm text-ai font-semibold">
                <Avatar /> Le bras droit vérifie dans le projet…
              </div>
            )}
          </div>
          <form className="border-t border-line p-3 flex gap-2" onSubmit={e => { e.preventDefault(); send(); }}>
            <label htmlFor="bd-input" className="sr-only">Votre message au bras droit</label>
            <input id="bd-input" value={draft} onChange={e => setDraft(e.target.value)} disabled={sending || project.isDemo} maxLength={4000}
              placeholder={project.isDemo ? 'Projet exemple : le bras droit n’est pas sollicité.' : 'Posez une question, demandez un point, la prochaine étape…'}
              className="flex-1 h-11 border border-line rounded-[10px] px-3.5 text-[15px] bg-white outline-none focus:ring-2 focus:ring-action-border disabled:bg-canvas" />
            <Button type="submit" variant="primary" disabled={!draft.trim() || sending || project.isDemo} aria-label="Envoyer"><Send size={16} aria-hidden="true" /></Button>
          </form>
        </Card>
      </section>

      <aside aria-label="Ce qui vous attend" className="flex-[1_1_260px] max-w-full lg:max-w-[320px] flex flex-col gap-3">
        <Card className="p-4">
          <h2 className="text-sm font-extrabold text-ink flex items-center gap-2"><CalendarClock size={16} className="text-action" aria-hidden="true" /> Prochaine réunion</h2>
          {next ? (
            <>
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint mt-2">R{nextIdx + 1}</p>
              <p className="text-[15px] font-extrabold text-ink">{next.title}</p>
              {!project.isDemo && <MeetingChoices meeting={{ ...next, ref: `R${nextIdx + 1}` }} stacked {...choices} />}
            </>
          ) : <p className="text-sm text-ink-muted mt-2">{milestones.length ? 'Toutes les réunions du plan sont tenues.' : 'Pas encore de plan.'} <Link to={`/projects/${project.id}`}>Tableau de bord</Link></p>}
        </Card>
        {delegatedRunning.length > 0 && (
          <Card className="p-4 bg-ai-bg border-ai-border">
            <h2 className="text-sm font-extrabold text-ai flex items-center gap-2"><Radio size={16} aria-hidden="true" /> Le bras droit tient la réunion</h2>
            {delegatedRunning.map(s => (
              <div key={s.id} className="mt-2">
                <p className="text-sm font-bold text-ink">{s.task}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-[13px]">
                  <Link to={`/projects/${project.id}/meeting/${s.id}`} className="font-bold">Suivre en direct</Link>
                  <button type="button" className="font-bold text-await hover:underline" onClick={async () => {
                    try { await stopPreparation(project.id, s.id); notifySuccess('Réunion arrêtée : le bras droit vous rend compte de ce qui a été fait.'); setTimeout(() => { loadSessions(); loadMessages().catch(() => {}); }, 3000); }
                    catch (err) { notifyError(err, 'La réunion n’a pas pu être arrêtée.'); }
                  }}>Arrêter</button>
                </div>
              </div>
            ))}
          </Card>
        )}
        <Card className={`p-4 ${waiting.length ? 'bg-await-bg border-await-border' : ''}`}>
          <h2 className={`text-sm font-extrabold flex items-center gap-2 ${waiting.length ? 'text-await' : 'text-ink'}`}><AlertTriangle size={16} aria-hidden="true" /> Vous attend · {waiting.length}</h2>
          {waiting.length === 0 ? <p className="text-sm text-ink-muted mt-2">Rien pour l’instant.</p> : (
            <ul className="mt-2 space-y-1.5">
              {waiting.map(w => <li key={w.key}><Link to={w.to} className="text-sm font-semibold">{w.text}</Link></li>)}
            </ul>
          )}
        </Card>
      </aside>

      {delegating && (
        <DelegateMeetingModal project={project} milestone={delegating} onClose={() => setDelegating(null)}
          onLaunched={() => { setDelegating(null); loadSessions(); }} />
      )}
    </div>
  );
}
