import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Send, Sparkles } from 'lucide-react';
import { Button, Card } from '../components/ui';
import { AgentAvatar } from '../components/ui/icons';
import Markdown from '../components/Markdown';
import WorkDocument from '../components/work/WorkDocument';
import api from '../utils/api';
import { notifyError } from '../utils/notify';
import { useAuth } from '../contexts/AuthContext';

// v6 phase 2 : la réunion de revue (« Demander l'avis de l'équipe », depuis « Mon projet »).
// Elle s'ouvre sur l'avis du porteur, en texte libre ; deux ou trois assistants réagissent à
// la version, chacun depuis son regard ; le porteur termine, et la version suivante lui est
// proposée sur « Mon projet ». Salle allégée : aucun réglage, aucun modèle, aucun compteur.

const POLL_MS = 1500;
const versionName = n => (n === 1 ? 'la première version' : `la version ${n}`);

function Bubble({ m }) {
  if (m.role === 'human') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-action text-white px-4 py-2.5 text-[15px] whitespace-pre-wrap">{m.content}</div>
      </div>
    );
  }
  if (m.role === 'system') {
    return <Card className="p-4 bg-ai-light/40 border-ai/20 text-[15px] text-ink whitespace-pre-wrap">{m.content}</Card>;
  }
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar agent={{ name: m.agentName }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold text-ink">{m.agentName}</p>
        <div className="text-[15px] text-ink-soft"><Markdown>{m.content}</Markdown></div>
      </div>
    </div>
  );
}

export default function ReviewRoom() {
  const { id: pid, sid } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [project, setProject] = useState(null);
  const [version, setVersion] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const endRef = useRef(null);

  const load = useCallback(() => api.get(`/projects/${pid}/sessions/${sid}/review`).then(({ data }) => setState(data)), [pid, sid]);
  useEffect(() => {
    load().catch(err => notifyError(err, 'La réunion n’a pas pu être ouverte'));
    api.get(`/projects/${pid}`).then(({ data }) => setProject(data)).catch(() => {});
  }, [load, pid]);
  useEffect(() => {
    if (!state?.reviewOfVersion) return;
    api.get(`/projects/${pid}/work/versions/${state.reviewOfVersion}`).then(({ data }) => setVersion(data)).catch(() => {});
  }, [pid, state?.reviewOfVersion]);
  // Pendant que l'équipe parle : relecture régulière
  useEffect(() => {
    if (!state?.speaking) return undefined;
    const t = setInterval(() => load().catch(() => {}), POLL_MS);
    return () => clearInterval(t);
  }, [state?.speaking, load]);
  const count = state?.messages?.length || 0;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [count, state?.speaking]);

  if (!state) {
    return <div className="flex justify-center py-24"><div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>;
  }
  const open = state.status === 'open';
  const speaking = state.speaking;
  const somethingSaid = state.messages.some(m => m.role !== 'system');
  const teamSpoke = state.messages.some(m => m.role === 'agent');

  const speak = async message => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${pid}/sessions/${sid}/review/message`, { text: message }); setState(data); setText(''); }
    catch (err) { notifyError(err, 'Votre message n’a pas pu être envoyé'); }
    finally { setBusy(false); }
  };
  const conclude = async () => {
    setBusy(true);
    try { await api.post(`/projects/${pid}/sessions/${sid}/review/conclude`); navigate(`/projects/${pid}`); }
    catch (err) { notifyError(err, 'La réunion n’a pas pu se terminer'); setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-white border-b border-line">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <Link to={`/projects/${pid}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
            <ArrowLeft size={16} aria-hidden="true" /> Mon projet
          </Link>
          <div className="flex-1 min-w-[200px]">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint">{project?.name || 'Votre projet'}</p>
            <h1 className="text-lg font-extrabold text-ink">L’avis de l’équipe sur {versionName(state.reviewOfVersion)}</h1>
          </div>
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setShowVersion(v => !v)}>
            <BookOpen size={15} aria-hidden="true" /> {showVersion ? 'Revenir à la réunion' : 'Voir la version'}
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] items-start">
        <main className={`space-y-4 min-w-0 ${showVersion ? 'hidden lg:block' : ''}`} data-tour="rr-feed">
          <p className="text-sm text-ink-muted">
            Avec vous : {state.agents.map(a => a.name).join(', ')}.
          </p>
          {state.messages.map(m => <Bubble key={m.id} m={m} />)}
          {speaking && (
            <p className="flex items-center gap-2 text-sm text-ink-muted" role="status" aria-live="polite">
              <span className="w-4 h-4 border-2 border-ai border-t-transparent rounded-full animate-spin" aria-hidden="true" />
              {speaking.agentName ? `${speaking.agentName} lit la version et prépare son avis…` : 'L’équipe lit la version…'}
            </p>
          )}
          {state.error && <p className="text-sm font-semibold text-await" role="alert">{state.error}</p>}

          {open ? (
            <Card className="p-4 space-y-3">
              <label htmlFor="review-text" className="sr-only">Votre message</label>
              <textarea id="review-text" value={text} onChange={e => setText(e.target.value)} rows={3}
                disabled={!!speaking || busy}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) speak(text.trim()); }}
                placeholder={teamSpoke ? 'Répondez à l’équipe : d’accord, pas d’accord, autre chose…' : 'Ce qui vous plaît, ce qui manque, ce qui ne va pas…'}
                className="w-full px-3 py-2 border border-line rounded-[10px] text-[15px] text-ink bg-white outline-none focus:ring-2 focus:ring-action disabled:bg-canvas" data-tour="rr-input" />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" onClick={() => speak(text.trim())} disabled={!text.trim() || !!speaking || busy}>
                  <Send size={15} aria-hidden="true" /> Envoyer
                </Button>
                {!somethingSaid && (
                  <Button variant="secondary" onClick={() => speak('')} disabled={!!speaking || busy}>Écouter l’équipe d’abord</Button>
                )}
                <span className="flex-1" />
                <Button variant={teamSpoke ? 'primary' : 'secondary'} onClick={conclude} disabled={!somethingSaid || !!speaking || busy} data-tour="rr-conclude">
                  <Sparkles size={15} aria-hidden="true" /> Terminer et préparer la version suivante
                </Button>
              </div>
              <p className="text-xs text-ink-muted">En terminant, la version suivante s’écrit avec ce que vous avez retenu. Vous la verrez sur « Mon projet » avant de la garder.</p>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm font-bold text-ink">Réunion terminée.</p>
              {state.summary && <p className="text-sm text-ink-soft mt-1 whitespace-pre-wrap">{state.summary}</p>}
              <Link to={`/projects/${pid}`} className="inline-block mt-3 text-sm font-bold text-action hover:underline">Voir mon projet</Link>
            </Card>
          )}
          {user?.advancedMode && <p className="text-xs text-ink-faint">Mode avancé : réunion de revue, sans carte de décision ni recherche web.</p>}
          <div ref={endRef} />
        </main>

        <aside className={`min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto ${showVersion ? '' : 'hidden lg:block'}`} aria-label="La version relue">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint mb-2">La version relue</p>
          {version ? <WorkDocument content={version.content} readOnly /> : <p className="text-sm text-ink-muted">Chargement…</p>}
        </aside>
      </div>
    </div>
  );
}
