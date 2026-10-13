import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, RefreshCw, MessageCircle, Send, Trash2, ChevronDown, ChevronRight, CheckCircle2, Check, Undo2 } from 'lucide-react';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import ProjectToolsPanel from '../../components/tools/ProjectToolsPanel';
import RailwayConnector from '../../components/tools/RailwayConnector';
import { Button, Card, Badge } from '../../components/ui';
import Markdown from '../../components/Markdown';

const fmtDate = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Vérification en ligne d'un guide ou d'une réponse. Pas d'étiquette (anciens guides et
// anciens messages) = « à vérifier » : seul « verified » est présenté comme vérifié.
const checkOf = check => check?.status || 'unverified';
const CHECK_LABEL = {
  verified: 'Vérifié en ligne',
  truncated: 'Guide incomplet',
  unverified: 'Menus non vérifiés en ligne',
};
const checkLabel = status => CHECK_LABEL[status] || CHECK_LABEL.unverified;

function CheckBanner({ check, kind = 'guide' }) {
  const status = checkOf(check);
  if (status === 'verified') return null;
  const incomplete = status === 'truncated';
  return (
    <div role="status" className="mt-3 rounded-xl border border-await-border bg-await-bg px-3.5 py-2.5 flex items-start gap-2">
      <AlertTriangle size={16} className="text-await shrink-0 mt-0.5" aria-hidden="true" />
      <p className="text-sm text-ink-soft">
        <span className="font-bold text-await">{checkLabel(status)}.</span>{' '}
        {incomplete
          ? `Le texte a été coupé avant la fin : ${kind === 'guide' ? 'régénérez le guide' : 'redemandez à BlabIA'}.`
          : `Les noms des menus et des boutons n’ont pas été contrôlés sur Internet : ils peuvent avoir changé.`}
      </p>
    </div>
  );
}

function CheckNote({ check }) {
  const status = checkOf(check);
  return status === 'verified'
    ? <p className="text-xs text-ink-faint mt-1.5">Vérifié en ligne{check.searches ? ` (${check.searches} recherche${check.searches > 1 ? 's' : ''})` : ''}</p>
    : <p className="text-xs text-await font-bold mt-1.5 inline-flex items-center gap-1"><AlertTriangle size={12} aria-hidden="true" /> {checkLabel(status)}</p>;
}

function Sources({ sources }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 text-xs text-ink-muted">
      <p className="font-bold text-ink-soft mb-1">Sources consultées</p>
      <ul className="space-y-0.5">
        {sources.map(s => (
          <li key={s.url} className="break-words">
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-action hover:underline">{s.title || s.url}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Guide découpé par outil ──────────────────────────────────────────────────
// Sections « ## … » du guide ; chacune est rattachée aux outils retenus dont le nom figure
// dans son titre (consigne du guide : « ## Étape N — <outil> : <action> »). Outils tous
// cochés « Mis en place » (ou section « Déjà en place. ») : repliée, mention « Déjà en place ».
function splitGuide(text) {
  const intro = [];
  const sections = [];
  let cur = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) { cur = { title: m[1].trim(), body: [] }; sections.push(cur); }
    else (cur ? cur.body : intro).push(line);
  }
  return { intro: intro.join('\n').trim(), sections: sections.map(x => ({ ...x, body: x.body.join('\n').trim() })) };
}
const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Noms reconnaissables d'un outil : « API Claude (Anthropic) » → api claude ; « Node.js / Express » → node.js, express
const tokensOf = name => String(name || '').replace(/\(.*?\)/g, ' ').split('/').map(x => norm(x).trim()).filter(x => x.length >= 3);

function GuideSections({ text, tools, onSetDone }) {
  const kept = (tools || []).filter(t => t.status === 'validated');
  const { intro, sections } = useMemo(() => splitGuide(text), [text]);
  const items = sections.map((sec, i) => {
    // « Étape N — <outil> : <action> » : l'outil nommé avant « : » d'abord (« OVH : faire pointer
    // le domaine vers Railway » ne concerne qu'OVH), sinon tout le titre
    const head = norm(sec.title.match(/[—–-]\s*([^:]+):/)?.[1] || '');
    const title = norm(sec.title);
    const byHead = head ? kept.filter(t => tokensOf(t.name).some(tok => head.includes(tok))) : [];
    const matched = byHead.length ? byHead : kept.filter(t => tokensOf(t.name).some(tok => title.includes(tok)));
    const saysDone = /^d[ée]j[àa] en place/i.test(sec.body);
    const state = matched.length ? (matched.every(t => t.setupDone) || saysDone ? 'done' : 'todo') : saysDone ? 'done' : 'general';
    return { ...sec, key: `${i}-${sec.title}`, state, matched };
  });
  const firstTodo = items.find(x => x.state === 'todo')?.key;
  const [open, setOpen] = useState(() => new Set(firstTodo ? [firstTodo] : []));
  const toggle = key => setOpen(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const todo = items.filter(x => x.state === 'todo').length;
  const done = items.filter(x => x.state === 'done').length;

  if (!items.length) return <Markdown size="synthesis">{text}</Markdown>; // guide sans sections
  return (
    <div className="space-y-2">
      {intro && <Markdown size="synthesis">{intro}</Markdown>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {todo > 0 ? `${todo} étape${todo > 1 ? 's' : ''} à faire` : 'Plus rien à mettre en place'}{done > 0 ? ` · ${done} déjà en place` : ''}
        </p>
        <div className="flex gap-3 text-xs font-bold">
          <button type="button" className="text-action hover:underline" onClick={() => setOpen(new Set(items.map(x => x.key)))}>Tout déplier</button>
          <button type="button" className="text-ink-muted hover:underline" onClick={() => setOpen(new Set())}>Tout replier</button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {items.map(sec => {
          const isOpen = open.has(sec.key);
          return (
            <li key={sec.key} className={`rounded-xl border ${sec.state === 'done' ? 'border-line bg-canvas' : sec.state === 'todo' ? 'border-line bg-white' : 'border-line bg-white'}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-2.5">
                <button type="button" onClick={() => toggle(sec.key)} aria-expanded={isOpen}
                  className="flex-1 min-w-[200px] flex items-center gap-2 pl-3.5 py-2.5 text-left min-h-[44px]">
                  {isOpen ? <ChevronDown size={16} className="shrink-0 text-ink-muted" aria-hidden="true" /> : <ChevronRight size={16} className="shrink-0 text-ink-muted" aria-hidden="true" />}
                  <span className={`flex-1 min-w-0 text-sm font-extrabold ${sec.state === 'done' ? 'text-ink-muted' : 'text-ink'}`}>{sec.title}</span>
                </button>
                {sec.state === 'done' && <Badge tone="ok"><CheckCircle2 size={12} aria-hidden="true" /> Déjà en place</Badge>}
                {sec.state === 'todo' && <Badge tone="await">À faire</Badge>}
                {/* Valider l'étape depuis le guide : marque les outils de la section « mis en place »
                    (y compris ceux sans case sur la page Outils : React, Node.js, GitHub…) */}
                {onSetDone && sec.matched.length > 0 && sec.state === 'todo' && (
                  <Button size="sm" variant="secondary" className="!h-8" onClick={() => { onSetDone(sec.matched.map(t => t.id), true); setOpen(prev => { const n = new Set(prev); n.delete(sec.key); return n; }); }}>
                    <Check size={14} aria-hidden="true" /> C’est fait
                  </Button>
                )}
                {onSetDone && sec.state === 'done' && sec.matched.some(t => t.setupDone) && (
                  <Button size="sm" variant="ghost" className="!h-8" onClick={() => onSetDone(sec.matched.map(t => t.id), false)}>
                    <Undo2 size={14} aria-hidden="true" /> Remettre à faire
                  </Button>
                )}
              </div>
              {isOpen && <div className="px-3.5 pb-3.5 pt-1 border-t border-line"><Markdown size="synthesis">{sec.body}</Markdown></div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Guide de mise en place, sur demande : comment relier pas à pas les outils retenus
// (dépôt GitHub, hébergeur, nom de domaine…). Rédigé avec une recherche web, conservé.
function SetupGuide({ project, tools, onTools, onSetDone }) {
  const [guide, setGuide] = useState(undefined); // undefined = chargement, null = jamais demandé
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState([]);
  const [conflict, setConflict] = useState(null); // 409 : { previous, next } à arbitrer
  useEffect(() => {
    api.get(`/projects/${project.id}/tools`).then(({ data }) => { setGuide(data.guide || null); setChat(data.guideChat || []); onTools?.(data.tools || []); }).catch(() => setGuide(null));
  }, [project.id]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${project.id}/tools/guide`);
      setGuide(data); setOpen(true);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.needsConfirmation) setConflict(err.response.data);
      else notifyError(err, 'Le guide n’a pas pu être rédigé.');
    } finally { setBusy(false); }
  };
  // « Oui » : promeut le nouveau guide en attente (sans nouvel appel à l'IA) ; « Non » : l'écarte
  const resolve = async replace => {
    setBusy(true);
    try {
      if (replace) {
        const { data } = await api.post(`/projects/${project.id}/tools/guide`, { force: true });
        setGuide(data); setOpen(true);
      } else await api.delete(`/projects/${project.id}/tools/guide/draft`);
      setConflict(null);
    } catch (err) {
      if ([404, 410].includes(err.response?.status)) setConflict(null);
      notifyError(err, 'Action impossible.');
    } finally { setBusy(false); }
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
      {conflict && (
        <div role="alertdialog" aria-labelledby="guide-conflict" className="mt-3 rounded-xl border border-action bg-canvas px-3.5 py-3 space-y-2">
          <p id="guide-conflict" className="text-sm font-extrabold text-ink">Remplacer quand même ?</p>
          <p className="text-sm text-ink-soft">
            Le guide actuel est « {checkLabel(conflict.previous?.status)} ». Le nouveau est « {checkLabel(conflict.next?.status)} ».
            Il est mis de côté pendant 24 h : votre guide actuel reste en place tant que vous n’avez pas répondu.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => resolve(true)} disabled={busy}>Oui, remplacer</Button>
            <Button size="sm" variant="secondary" onClick={() => resolve(false)} disabled={busy}>Non, garder l’actuel</Button>
          </div>
        </div>
      )}
      {guide && <CheckBanner check={guide.check} />}
      {guide && open && (
        <div className="mt-4 pt-4 border-t border-line">
          <GuideSections key={guide.at} text={guide.text} tools={tools} onSetDone={onSetDone} />
          <Sources sources={guide.check?.sources} />
        </div>
      )}
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
              : (
                <div className="rounded-xl bg-ai-bg border border-ai-border p-3">
                  <Markdown size="synthesis">{m.content}</Markdown>
                  <CheckNote check={m.check} />
                  <Sources sources={m.check?.sources} />
                </div>
              )}
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
  const [tools, setTools] = useState(null);
  const [panelKey, setPanelKey] = useState(0); // recharge le panneau après une validation depuis le guide
  // « C'est fait » / « Remettre à faire » dans le guide : outils marqués mis en place (ou non)
  const setToolsDone = async (ids, done) => {
    if (!tools) return;
    const next = tools.map(t => (ids.includes(t.id) ? { ...t, setupDone: done } : t));
    setTools(next);
    try {
      await api.put(`/projects/${project.id}/tools`, { tools: next });
      setPanelKey(k => k + 1);
      refreshCounts?.();
    } catch (err) {
      setTools(tools);
      notifyError(err, 'L’étape n’a pas pu être enregistrée.');
    }
  };
  return (
    <>
      <PageHeader title="Outils" subtitle="Les outils nécessaires au projet, pré-remplis avec vos outils et modifiables.">
        <Link to="/outils" className="h-11 px-4 inline-flex items-center rounded-[10px] border border-line bg-white text-sm font-bold text-ink-soft hover:bg-canvas">
          Mes outils
        </Link>
      </PageHeader>
      {!project.isDemo && <div className="mb-4"><RailwayConnector project={project} onDone={() => setPanelKey(k => k + 1)} /></div>}
      {!project.isDemo && <div className="mb-4"><SetupGuide project={project} tools={tools} onTools={setTools} onSetDone={setToolsDone} /></div>}
      <ProjectToolsPanel key={panelKey} projectId={project.id} onChanged={next => { if (Array.isArray(next)) setTools(next); refreshCounts?.(); }} />
    </>
  );
}
