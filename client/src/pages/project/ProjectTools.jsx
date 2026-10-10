import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw, MessageCircle, Send, Trash2 } from 'lucide-react';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import ProjectToolsPanel from '../../components/tools/ProjectToolsPanel';
import { Button, Card } from '../../components/ui';
import Markdown from '../../components/Markdown';

const fmtDate = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Guide de mise en place, sur demande : comment relier pas à pas les outils retenus
// (dépôt GitHub, hébergeur, nom de domaine…). Rédigé avec une recherche web, conservé.
function SetupGuide({ project }) {
  const [guide, setGuide] = useState(undefined); // undefined = chargement, null = jamais demandé
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState([]);
  useEffect(() => {
    api.get(`/projects/${project.id}/tools`).then(({ data }) => { setGuide(data.guide || null); setChat(data.guideChat || []); }).catch(() => setGuide(null));
  }, [project.id]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${project.id}/tools/guide`);
      setGuide(data); setOpen(true);
    } catch (err) { notifyError(err, 'Le guide n’a pas pu être rédigé.'); } finally { setBusy(false); }
  };
  if (guide === undefined) return null;

  return (
    <Card className="p-5" data-tour="tools-guide">
      <div className="flex flex-wrap items-start gap-3">
        <BookOpen size={20} className="text-action shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <h2 className="text-base font-extrabold text-ink">Guide de mise en place</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {guide
              ? `Rédigé le ${fmtDate(guide.at)} à partir des outils retenus. Régénérez-le si vous changez d’outils.`
              : 'Comment relier pas à pas les outils retenus : dépôt du code, hébergeur, nom de domaine, e-mails… Quelques secondes à une minute.'}
          </p>
        </div>
        <div className="flex gap-2">
          {guide && <Button size="sm" variant="secondary" onClick={() => setOpen(v => !v)}>{open ? 'Masquer' : 'Afficher'}</Button>}
          <Button size="sm" variant={guide ? 'ghost' : 'primary'} onClick={generate} disabled={busy}>
            {guide && <RefreshCw size={14} aria-hidden="true" />} {busy ? 'Rédaction…' : guide ? 'Régénérer' : 'Rédiger le guide'}
          </Button>
        </div>
      </div>
      {guide && open && <div className="mt-4 pt-4 border-t border-line"><Markdown size="synthesis">{guide.text}</Markdown></div>}
      <GuideChat projectId={project.id} chat={chat} setChat={setChat} hasGuide={!!guide} />
    </Card>
  );
}

// Discussion sous le guide : une question, ou un message d'erreur collé tel quel (ex. le
// diagnostic d'un hébergeur). BlabIA répond avec le guide, la structure réelle du dépôt et
// une recherche web ; les échanges sont repris au prochain « Régénérer ».
function GuideChat({ projectId, chat, setChat, hasGuide }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(chat.length > 0);
  useEffect(() => { if (chat.length) setOpen(true); }, [chat.length]);
  const send = async e => {
    e.preventDefault();
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setChat(c => [...c, { role: 'user', content: text, at: new Date().toISOString(), pending: true }]);
    setMessage('');
    try {
      const { data } = await api.post(`/projects/${projectId}/tools/guide/chat`, { message: text });
      setChat(data.chat);
    } catch (err) {
      setChat(c => c.filter(m => !m.pending));
      setMessage(text);
      notifyError(err, 'Pas de réponse pour l’instant.');
    } finally { setSending(false); }
  };
  const clear = async () => {
    if (!confirm('Effacer la discussion ? Elle ne sera plus reprise dans le prochain guide.')) return;
    try { setChat((await api.delete(`/projects/${projectId}/tools/guide/chat`)).data.chat); } catch (err) { notifyError(err, 'Effacement impossible.'); }
  };

  if (!open) {
    return (
      <button className="mt-4 text-sm font-bold text-action inline-flex items-center gap-1.5 min-h-[44px]" onClick={() => setOpen(true)}>
        <MessageCircle size={16} aria-hidden="true" /> Une question, une erreur ? Demandez à BlabIA
      </button>
    );
  }
  return (
    <div className="mt-4 pt-4 border-t border-line" data-tour="tools-guide-chat">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-extrabold text-ink inline-flex items-center gap-1.5"><MessageCircle size={16} aria-hidden="true" /> Une question, une erreur ?</p>
        {chat.length > 0 && <button className="text-xs font-bold text-ink-muted inline-flex items-center gap-1 hover:text-ink" onClick={clear}><Trash2 size={13} aria-hidden="true" /> Effacer</button>}
      </div>
      {chat.length === 0 && (
        <p className="text-xs text-ink-muted mb-2">
          Collez ici un message d’erreur tel quel (celui de votre hébergeur par exemple) ou posez votre question{hasGuide ? ' sur une étape du guide' : ''}. BlabIA connaît le dépôt du projet et les outils retenus. Ne collez jamais de mot de passe ni de clé.
        </p>
      )}
      <ul className="space-y-3 mb-3">
        {chat.map((m, i) => (
          <li key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user'
              ? <div className="max-w-[85%] rounded-xl bg-action text-white px-3 py-2 text-sm whitespace-pre-wrap break-words">{m.content}</div>
              : <div className="rounded-xl bg-ai-bg border border-ai-border p-3"><Markdown size="synthesis">{m.content}</Markdown></div>}
          </li>
        ))}
        {sending && <li className="text-xs text-ink-muted">BlabIA cherche la solution (jusqu’à une minute)…</li>}
      </ul>
      <form onSubmit={send} className="flex gap-2 items-end">
        <label htmlFor="guide-chat" className="sr-only">Votre question ou le message d’erreur</label>
        <textarea id="guide-chat" value={message} onChange={e => setMessage(e.target.value)} rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); }}
          placeholder="Ex. : Railway affiche « The build failed because the repo root only contains a README »…"
          className="flex-1 min-w-0 px-3 py-2 border border-line rounded-[10px] text-sm text-ink bg-white resize-y" />
        <Button type="submit" variant="primary" disabled={sending || !message.trim()} aria-label="Envoyer"><Send size={16} aria-hidden="true" /></Button>
      </form>
      {chat.length > 0 && hasGuide && <p className="text-xs text-ink-faint mt-2">« Régénérer » le guide reprend ces échanges pour le corriger.</p>}
    </div>
  );
}

// Outils : les outils du projet, organisés par besoin
export default function ProjectTools() {
  const { project, refreshCounts } = useProject();
  return (
    <>
      <PageHeader title="Outils" subtitle="Les outils nécessaires au projet, pré-remplis avec vos outils et modifiables.">
        <Link to="/outils" className="h-11 px-4 inline-flex items-center rounded-[10px] border border-line bg-white text-sm font-bold text-ink-soft hover:bg-canvas">
          Mes outils
        </Link>
      </PageHeader>
      {!project.isDemo && <div className="mb-4"><SetupGuide project={project} /></div>}
      <ProjectToolsPanel projectId={project.id} onChanged={refreshCounts} />
    </>
  );
}
