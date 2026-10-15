import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Send, Trash2, CalendarClock, AlertTriangle } from 'lucide-react';
import api from '../../utils/api';
import { useProject } from '../../components/project/ProjectShell';
import { Button, Card } from '../../components/ui';
import Markdown from '../../components/Markdown';
import useMissions from '../../hooks/useMissions';
import { notifyError } from '../../utils/notify';

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

function Proposal({ proposal, onPrepare, onHold }) {
  return (
    <div className="border border-line rounded-xl px-3.5 py-3 flex flex-wrap items-center gap-3 bg-white">
      <div className="flex-1 min-w-[220px]">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai">Réunion {proposal.ref} · à tenir</p>
        <p className="text-[15px] font-extrabold text-ink">{proposal.title}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => onPrepare(proposal)}>Les agents la préparent</Button>
      <Button size="sm" variant="primary" onClick={() => onHold(proposal)}>Vous tenez la réunion</Button>
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

  useEffect(() => {
    api.get(`/projects/${project.id}/assistant`).then(({ data }) => setMessages(data.messages)).catch(err => { notifyError(err, 'La conversation n’a pas pu être chargée.'); setMessages([]); });
    api.get(`/projects/${project.id}/plan`).then(({ data }) => setPlan(data)).catch(() => setPlan({ milestones: [] }));
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => {});
  }, [project.id]);
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

  const milestones = [...(plan?.milestones || [])].sort((a, b) => a.displayOrder - b.displayOrder);
  const nextIdx = milestones.findIndex(m => m.status !== 'done');
  const next = nextIdx >= 0 ? milestones[nextIdx] : null;
  // Ce qui attend l'humain (mêmes sources que le tableau de bord)
  const waiting = [
    ...sessions.filter(s => s.prepReady).map(s => ({ key: s.id, text: `Conclusions préparées : « ${s.task} »`, to: `/projects/${project.id}/meeting/${s.id}` })),
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
                  {m.proposal && !project.isDemo && (
                    <Proposal proposal={m.proposal} onPrepare={p => startMeeting(p, true)} onHold={p => startMeeting(p, false)} />
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
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={() => startMeeting(next, true)} disabled={project.isDemo}>Les agents la préparent</Button>
                <Button size="sm" variant="primary" onClick={() => startMeeting(next, false)} disabled={project.isDemo}>Vous tenez la réunion</Button>
              </div>
            </>
          ) : <p className="text-sm text-ink-muted mt-2">{milestones.length ? 'Toutes les réunions du plan sont tenues.' : 'Pas encore de plan.'} <Link to={`/projects/${project.id}`}>Tableau de bord</Link></p>}
        </Card>
        <Card className={`p-4 ${waiting.length ? 'bg-await-bg border-await-border' : ''}`}>
          <h2 className={`text-sm font-extrabold flex items-center gap-2 ${waiting.length ? 'text-await' : 'text-ink'}`}><AlertTriangle size={16} aria-hidden="true" /> Vous attend · {waiting.length}</h2>
          {waiting.length === 0 ? <p className="text-sm text-ink-muted mt-2">Rien pour l’instant.</p> : (
            <ul className="mt-2 space-y-1.5">
              {waiting.map(w => <li key={w.key}><Link to={w.to} className="text-sm font-semibold">{w.text}</Link></li>)}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}
