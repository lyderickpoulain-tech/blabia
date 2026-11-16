import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock, Gift, History, Lightbulb, ListChecks, Pencil, RotateCcw, Sparkles, TriangleAlert, Users, Wand2, X } from 'lucide-react';
import ExportButtons from '../../components/ExportButtons';
import SiteCard from '../../components/site/SiteCard';
import { Badge, Button, Card, SectionLabel } from '../../components/ui';
import WorkDocument, { countVerify, splitSections } from '../../components/work/WorkDocument';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject } from '../../components/project/ProjectShell';

// v6 « l'ouvrage d'abord » : « Mon projet ». La version en cours en grand ; à côté, les idées
// du porteur et leur présence, ce que BlabIA a supposé (modifiable : la version suivante
// l'applique), « Ce sera fini quand… », les versions précédentes.
// Mots de l'écran : « Votre projet », « Ce que j'ai supposé », « Première version »,
// « Version 2 » — jamais « ouvrage », « pari », « V0 ».
// Phase 2 : deux gestes pour faire avancer le projet — écrire ce qu'on veut changer (le bras
// droit fait la retouche) ou demander l'avis de l'équipe (une réunion). Chaque version
// suivante est d'abord PROPOSÉE : le porteur voit ce qui change, puis la garde, la corrige
// ou la refuse.

export const versionLabel = n => (n === 1 ? 'Première version' : `Version ${n}`);
const POLL_MS = 3000;

const STAGES = {
  first: {
    reading: 'Je lis votre récit.',
    writing: 'J’écris la première version complète : tout ce que vous avez demandé, et ce que j’ai dû supposer.',
    saving:  'Je range la version et vos idées.',
  },
  next: {
    reading: 'Je relis la version en cours et ce que vous voulez changer.',
    writing: 'J’écris la version suivante, complète.',
    saving:  'Je prépare la comparaison avec la version en cours.',
  },
};

function elapsedLabel(startedAt, now) {
  const s = Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
}

function Waiting({ build, isFirst }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const texts = STAGES[isFirst ? 'first' : 'next'];
  const order = ['reading', 'writing', 'saving'];
  const at = Math.max(0, order.indexOf(build.stage));
  return (
    <Card className="p-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-ai border-t-transparent rounded-full animate-spin shrink-0" aria-hidden="true" />
        <h2 className="text-lg font-extrabold text-ink">{isFirst ? 'Votre projet prend forme' : 'La version suivante se prépare'}</h2>
      </div>
      <ol className="mt-4 space-y-2">
        {order.map((k, i) => (
          <li key={k} className={`flex items-start gap-2 text-sm ${i < at ? 'text-ok' : i === at ? 'text-ink font-semibold' : 'text-ink-faint'}`}>
            {i < at ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : <span className="w-4 h-4 mt-0.5 rounded-full border-2 border-current shrink-0" aria-hidden="true" />}
            {texts[k]}
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink-muted mt-4 flex items-center gap-1.5">
        <Clock size={14} aria-hidden="true" />
        {build.startedAt ? `Depuis ${elapsedLabel(build.startedAt, now)}. ` : ''}Cela prend en général deux à trois minutes. Vous pouvez quitter cette page : la version vous attendra.
      </p>
    </Card>
  );
}

function Ideas({ ideas, onToggle }) {
  if (!ideas.length) return null;
  return (
    <Card className="p-4" data-tour="pw-ideas">
      <SectionLabel className="flex items-center gap-1.5"><Lightbulb size={14} aria-hidden="true" /> Vos idées</SectionLabel>
      <ul className="mt-3 space-y-3">
        {ideas.map(i => (
          <li key={i.id} className={`text-sm ${i.state === 'set_aside' ? 'opacity-60' : ''}`}>
            <p className="text-ink">« {i.text} »</p>
            <p className="text-xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {i.state === 'set_aside' ? <span className="text-ink-muted">Mise de côté par vous</span>
                : i.presence?.present ? <span className="text-ok font-semibold">Dans « {i.presence.where} »</span>
                : <span className="text-await font-semibold">Pas encore dans votre projet{i.presence?.where ? ` : ${i.presence.where}` : ''}</span>}
              <button type="button" onClick={() => onToggle(i)} className="text-ink-muted hover:text-ink underline">
                {i.state === 'set_aside' ? 'Reprendre' : 'Mettre de côté'}
              </button>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Assumption({ a, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(a.value);
  useEffect(() => setValue(a.value), [a.value]);
  return (
    <li className="text-sm">
      <p className="text-ink-muted">{a.statement}</p>
      {editing ? (
        <form className="mt-1 flex gap-2" onSubmit={async e => { e.preventDefault(); if (value.trim()) { await onSave(a, value.trim()); setEditing(false); } }}>
          <label className="sr-only" htmlFor={`a-${a.id}`}>{a.statement}</label>
          <input id={`a-${a.id}`} value={value} onChange={e => setValue(e.target.value)} autoFocus
            className="flex-1 min-w-0 px-2.5 py-1.5 border border-line rounded-lg text-sm outline-none focus:ring-2 focus:ring-action" />
          <Button size="sm" type="submit" variant="primary">OK</Button>
        </form>
      ) : (
        <p className="flex items-start gap-2">
          <span className="font-bold text-ink flex-1">{a.value}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-action hover:underline text-xs font-semibold shrink-0 inline-flex items-center gap-1">
            <Pencil size={12} aria-hidden="true" /> Changer
          </button>
        </p>
      )}
      {a.state === 'changed' && <p className="text-xs text-await font-semibold mt-0.5">Changé par vous : sera appliqué à la prochaine version</p>}
      {a.state === 'applied' && <p className="text-xs text-ok font-semibold mt-0.5">Choisi par vous</p>}
    </li>
  );
}

function Criteria({ criteria, onSave }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  return (
    <Card className="p-4" data-tour="pw-criteria">
      <SectionLabel className="flex items-center gap-1.5"><ListChecks size={14} aria-hidden="true" /> Ce sera fini quand…</SectionLabel>
      {editing ? (
        <div className="mt-3 space-y-2">
          <label className="sr-only" htmlFor="criteria">Une phrase par ligne</label>
          <textarea id="criteria" value={text} onChange={e => setText(e.target.value)} rows={5}
            className="w-full px-2.5 py-2 border border-line rounded-lg text-sm outline-none focus:ring-2 focus:ring-action" />
          <p className="text-xs text-ink-muted">Une phrase par ligne.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={async () => { await onSave(text.split('\n')); setEditing(false); }}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <>
          {criteria.length > 0 && (
            <p className="text-xs text-ink-muted mt-1">{criteria.filter(c => c.status === 'met').length} sur {criteria.length} atteint{criteria.filter(c => c.status === 'met').length > 1 ? 's' : ''}</p>
          )}
          <ul className="mt-3 space-y-2">
            {criteria.map(c => (
              <li key={c.id} className="text-sm flex gap-2">
                {c.status === 'met'
                  ? <Check size={16} className="text-ok mt-0.5 shrink-0" aria-label="Atteint" />
                  : <span className="w-3.5 h-3.5 mt-[3px] rounded-full border-2 border-await shrink-0" aria-label="Pas encore" />}
                <span>
                  <span className={c.status === 'met' ? 'text-ink' : 'text-ink font-semibold'}>{c.text}</span>
                  {c.status !== 'met' && c.note && <span className="block text-xs text-await">Il manque : {c.note}</span>}
                </span>
              </li>
            ))}
            {!criteria.length && <li className="text-sm text-ink-muted">Rien pour l’instant.</li>}
          </ul>
          <button type="button" onClick={() => { setText(criteria.map(c => c.text).join('\n')); setEditing(true); }}
            className="mt-3 text-xs font-semibold text-action hover:underline inline-flex items-center gap-1"><Pencil size={12} aria-hidden="true" /> Corriger</button>
        </>
      )}
    </Card>
  );
}

// Parties changées entre deux versions : titre → « Modifiée » | « Nouvelle » ; parties retirées
export function sectionChanges(before, after) {
  const old = new Map(splitSections(before).map(s => [s.title || '', s.body]));
  const next = splitSections(after);
  const marks = new Map();
  for (const s of next) {
    const key = s.title || '';
    if (!old.has(key)) marks.set(key, 'Nouvelle');
    else if (old.get(key).trim() !== s.body.trim()) marks.set(key, 'Modifiée');
  }
  const kept = new Set(next.map(s => s.title || ''));
  const removed = [...old.keys()].filter(k => k && !kept.has(k));
  return { marks, removed };
}

const ORIGIN = {
  review: 'Écrite avec ce qui s’est dit en réunion.',
  retouch: 'Écrite avec la retouche que vous avez demandée.',
  changes: 'Écrite avec vos changements.',
};

function ProposalBar({ proposal, changes, showingCurrent, onToggle, onAccept, onRefuse, onCorrect, busy }) {
  const [correcting, setCorrecting] = useState(false);
  const [text, setText] = useState('');
  const quoted = keys => keys.map(k => `« ${k || 'Introduction'} »`).join(', ');
  const touched = quoted([...changes.marks.keys()]);
  const removed = quoted(changes.removed);
  return (
    <Card className="p-5 border-ai/40 bg-ai-light/40" data-tour="pw-proposal">
      <p className="text-[11px] font-extrabold uppercase tracking-wider text-ai">Proposition · {versionLabel(proposal.number)}</p>
      <h2 className="text-lg font-extrabold text-ink mt-0.5">Voici ce qui change</h2>
      {proposal.changeSummary && <p className="text-[15px] text-ink-soft mt-1 whitespace-pre-wrap">{proposal.changeSummary}</p>}
      <p className="text-xs text-ink-muted mt-2">
        {ORIGIN[proposal.origin] || ORIGIN.changes}
        {touched && <> Parties touchées : {touched}.</>}
        {removed && <> {changes.removed.length > 1 ? 'Parties retirées' : 'Partie retirée'} : {removed}.</>}
      </p>
      {proposal.criteriaChanges && (
        <div className="mt-2 text-xs text-ink-soft">
          <p className="font-bold text-ink">« Ce sera fini quand… » suit votre projet :</p>
          <ul className="mt-1 space-y-0.5">
            {proposal.criteriaChanges.removed.map(t => <li key={`-${t}`} className="line-through text-ink-muted">{t}</li>)}
            {proposal.criteriaChanges.added.map(t => <li key={`+${t}`}>{t}</li>)}
          </ul>
        </div>
      )}
      {correcting ? (
        <div className="mt-3 space-y-2">
          <label htmlFor="proposal-correct" className="text-sm font-bold text-ink">Qu’est-ce qui ne va pas ?</label>
          <textarea id="proposal-correct" value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
            placeholder="Avec vos mots : ce qu’il faut changer dans cette proposition."
            className="w-full px-3 py-2 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={!text.trim() || busy} onClick={() => onCorrect(text.trim())}>Corriger la proposition</Button>
            <Button variant="ghost" size="sm" onClick={() => setCorrecting(false)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={onAccept} disabled={busy}><Check size={16} aria-hidden="true" /> Garder cette version</Button>
          <Button variant="secondary" onClick={() => setCorrecting(true)} disabled={busy}><Pencil size={15} aria-hidden="true" /> Corriger</Button>
          <Button variant="ghost" onClick={onRefuse} disabled={busy}><X size={15} aria-hidden="true" /> Refuser</Button>
          <span className="flex-1" />
          <button type="button" onClick={onToggle} className="text-sm font-semibold text-action hover:underline">
            {showingCurrent ? 'Voir la proposition' : 'Comparer avec la version en cours'}
          </button>
        </div>
      )}
    </Card>
  );
}

// Phase 3 : la ou les deux prochaines étapes, déduites de ce qui manque, chacune avec son geste
function NextSteps({ steps, onRetouch, onReview, openReview, busy, isDemo }) {
  if (!steps?.length) return null;
  return (
    <Card className="p-4 border-action/30" data-tour="pw-next">
      <SectionLabel className="flex items-center gap-1.5"><ArrowRight size={14} aria-hidden="true" /> La suite</SectionLabel>
      <ul className="mt-3 space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-[15px] text-ink flex-1 min-w-[220px]">{s.text}</p>
            {s.kind === 'retouche' && (
              <Button size="sm" variant="primary" disabled={busy || isDemo} onClick={() => onRetouch(s.text)}><Wand2 size={15} aria-hidden="true" /> Faire cette retouche</Button>
            )}
            {s.kind === 'equipe' && (openReview
              ? <Link to={openReview.to} className="text-sm font-bold text-action hover:underline">Reprendre la réunion en cours</Link>
              : <Button size="sm" variant="secondary" disabled={busy || isDemo} onClick={onReview}><Users size={15} aria-hidden="true" /> Demander l’avis de l’équipe</Button>)}
            {s.kind === 'vous' && <span className="text-xs font-bold text-await">À faire de votre côté</span>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Phase 3 : tout ce que le porteur a fixé est atteint → le dossier final ; livré → téléchargements
function Delivery({ work, pid, onDeliver, busy, isDemo }) {
  const delivered = work.delivered?.current;
  if (!work.allMet && !delivered) return null;
  return (
    <Card className="p-5 border-ok-border bg-ok-light/50" data-tour="pw-delivery">
      <h2 className="text-lg font-extrabold text-ink flex items-center gap-2"><Gift size={18} className="text-ok" aria-hidden="true" />
        {delivered ? 'Votre dossier final est prêt' : 'Tout ce que vous aviez fixé est atteint'}</h2>
      <p className="text-sm text-ink-soft mt-1">
        {delivered
          ? `Livré le ${new Date(work.delivered.at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Vous pouvez encore le faire évoluer : une nouvelle version vous sera proposée comme d’habitude.`
          : 'Votre projet peut être livré : vous recevez le dossier complet, à imprimer ou à partager.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!delivered && <Button variant="primary" onClick={onDeliver} disabled={busy || isDemo}><Gift size={16} aria-hidden="true" /> Recevoir le dossier final</Button>}
        {delivered && <ExportButtons size="md" pdfPath={`/projects/${pid}/imprimer/projet`} wordPath={`/projects/${pid}/work/export/word`} />}
      </div>
    </Card>
  );
}

// Les deux gestes : la retouche (le bras droit la fait) et l'avis de l'équipe (une réunion)
function MoveForward({ openReview, onRetouch, onReview, busy, isDemo }) {
  const [text, setText] = useState('');
  const off = busy || isDemo;
  return (
    <Card className="p-4 space-y-3" data-tour="pw-forward">
      <SectionLabel>Faire avancer votre projet</SectionLabel>
      <div>
        <label htmlFor="retouch" className="text-sm font-bold text-ink">Que voulez-vous changer ?</label>
        <textarea id="retouch" value={text} onChange={e => setText(e.target.value)} rows={2}
          placeholder="Par exemple : ajoutez une partie sur le budget."
          className="mt-1 w-full px-3 py-2 border border-line rounded-[10px] text-sm text-ink bg-white outline-none focus:ring-2 focus:ring-action" />
        <Button variant="primary" size="sm" className="mt-1.5" disabled={!text.trim() || off}
          onClick={async () => { if (await onRetouch(text.trim())) setText(''); }}>
          <Wand2 size={15} aria-hidden="true" /> Faire la retouche
        </Button>
      </div>
      <div className="border-t border-line pt-3">
        {openReview ? (
          <Link to={openReview.to} className="inline-flex items-center gap-2 text-sm font-bold text-action hover:underline">
            <Users size={15} aria-hidden="true" /> Reprendre la réunion en cours
          </Link>
        ) : (
          <Button variant="secondary" size="sm" onClick={onReview} disabled={off} data-tour="pw-review">
            <Users size={15} aria-hidden="true" /> Demander l’avis de l’équipe
          </Button>
        )}
        <p className="text-xs text-ink-muted mt-1">Deux ou trois assistants relisent cette version avec vous ; à la fin, la version suivante vous est proposée.</p>
        {isDemo && <p className="text-xs text-await font-semibold mt-1">Projet exemple : créez votre projet pour faire travailler l’équipe.</p>}
      </div>
    </Card>
  );
}

export default function ProjectWork({ initial, onReload }) {
  const { project, reloadProject } = useProject();
  const [work, setWork] = useState(initial);
  const [viewing, setViewing] = useState(null); // version précédente affichée { number, content, changeSummary }
  const [busy, setBusy] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false); // proposition en attente : voir la version en cours
  const navigate = useNavigate();
  const pid = project.id;
  const wasBuilding = useRef(initial?.build?.status === 'building');

  const load = useCallback(() => api.get(`/projects/${pid}/work`).then(({ data }) => setWork(data)), [pid]);

  // Pendant l'écriture : relecture régulière ; à la fin, le nom du projet a pu changer
  useEffect(() => {
    if (work?.build?.status !== 'building') {
      if (wasBuilding.current) { wasBuilding.current = false; reloadProject?.(); }
      return undefined;
    }
    wasBuilding.current = true;
    const t = setInterval(() => load().catch(() => {}), POLL_MS); // nouvel essai au tour suivant
    return () => clearInterval(t);
  }, [work?.build?.status, load, reloadProject]);

  const act = async (fn, message) => {
    try { const { data } = await fn(); if (data?.exists !== undefined) setWork(data); else await load(); return true; }
    catch (err) { notifyError(err, message); return false; }
  };

  if (!work) return null;
  const building = work.build?.status === 'building';
  const failed = work.build?.status === 'failed';
  const current = work.current;
  const pendingCount = (work.pending?.assumptions || 0) + (work.pending?.comments || 0);
  const proposal = !building ? work.proposal : null;
  const onProposal = !!proposal && !viewing && !showCurrent;
  const shown = viewing || (onProposal ? proposal : current);
  const verify = countVerify(shown?.content);
  const changes = proposal && current ? sectionChanges(current.content, proposal.content) : { marks: new Map(), removed: [] };
  const isDemo = !!project.isDemo;

  const nextVersion = async () => {
    setBusy(true);
    await act(() => api.post(`/projects/${pid}/work/next`), 'La version suivante n’a pas pu démarrer');
    setBusy(false);
  };
  const retry = () => act(() => api.post(`/projects/${pid}/work/retry`), 'Le nouvel essai n’a pas pu démarrer').then(onReload);
  const answer = async (kind, body) => {
    setBusy(true);
    const ok = await act(() => api.post(`/projects/${pid}/work/proposals/${proposal.id}/${kind}`, body), 'Votre réponse n’a pas pu être enregistrée');
    if (ok) { setShowCurrent(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    setBusy(false);
  };
  const retouch = async text => {
    setBusy(true);
    const ok = await act(() => api.post(`/projects/${pid}/work/retouch`, { text }), 'La retouche n’a pas pu démarrer');
    setBusy(false);
    return ok;
  };
  const review = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${pid}/work/review`); navigate(`/projects/${pid}/meeting/${data.sessionId}`); }
    catch (err) { notifyError(err, 'La réunion n’a pas pu s’ouvrir'); setBusy(false); }
  };
  const showVersion = async n => {
    if (n === current?.number) { setViewing(null); return; }
    try { const { data } = await api.get(`/projects/${pid}/work/versions/${n}`); setViewing(data); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    catch (err) { notifyError(err, 'Cette version n’a pas pu être ouverte'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink-faint">Votre projet</p>
        <h1 className="text-2xl font-extrabold text-ink">{project.name}</h1>
      </div>

      {building && <Waiting build={work.build} isFirst={!current} />}

      {failed && (
        <Card className="p-5 border-await-border bg-await-bg" role="alert">
          <p className="text-sm font-semibold text-ink flex items-start gap-2"><TriangleAlert size={16} className="text-await mt-0.5 shrink-0" aria-hidden="true" /> {work.build.error}</p>
          <Button variant="primary" size="sm" className="mt-3" onClick={retry}><RotateCcw size={15} aria-hidden="true" /> Réessayer</Button>
        </Card>
      )}

      {proposal && !viewing && (
        <ProposalBar proposal={proposal} changes={changes} showingCurrent={showCurrent} busy={busy}
          onToggle={() => setShowCurrent(v => !v)}
          onAccept={() => answer('accept')}
          onRefuse={() => answer('refuse')}
          onCorrect={text => answer('correct', { text })} />
      )}

      {/* BlabIA + : le dossier décrit un site → le construire, le voir, le retoucher */}
      {work.template === 'site' && current && !viewing && <SiteCard projectId={pid} dossierVersion={current.number} isDemo={isDemo} />}

      {current && !building && !viewing && !proposal && (
        <>
          <Delivery work={work} pid={pid} busy={busy} isDemo={isDemo}
            onDeliver={async () => { setBusy(true); await act(() => api.post(`/projects/${pid}/work/deliver`), 'Le dossier n’a pas pu être livré'); setBusy(false); }} />
          {!work.allMet && <NextSteps steps={current.nextSteps} busy={busy} isDemo={isDemo} onRetouch={retouch} onReview={review}
            openReview={work.openReview ? { to: `/projects/${pid}/meeting/${work.openReview.id}` } : null} />}
        </>
      )}

      {pendingCount > 0 && !building && !viewing && !proposal && (
        <Card className="p-4 border-action/30 bg-action-light/50 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink flex-1 min-w-[220px]">
            Vos changements ({[
              work.pending.assumptions && `${work.pending.assumptions} supposition${work.pending.assumptions > 1 ? 's' : ''}`,
              work.pending.comments && `${work.pending.comments} remarque${work.pending.comments > 1 ? 's' : ''}`,
            ].filter(Boolean).join(', ')}) seront pris en compte dans la prochaine version.
          </p>
          <Button variant="primary" onClick={nextVersion} disabled={busy}><Sparkles size={16} aria-hidden="true" /> Préparer la version suivante</Button>
        </Card>
      )}

      {shown && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="space-y-4 min-w-0" data-tour="pw-version">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={viewing ? 'muted' : 'ai'}>{versionLabel(shown.number)}{viewing ? ' (ancienne)' : onProposal ? ' (proposée)' : proposal ? ' (en cours)' : ''}</Badge>
              {verify > 0 && <Badge tone="await"><TriangleAlert size={12} aria-hidden="true" /> {verify} point{verify > 1 ? 's' : ''} à vérifier</Badge>}
              {viewing && <Button size="sm" variant="secondary" onClick={() => setViewing(null)}>Revenir à la version en cours</Button>}
              {!onProposal && (
                <ExportButtons className="ml-auto" pdfPath={`/projects/${pid}/imprimer/projet?version=${shown.number}`} wordPath={`/projects/${pid}/work/export/word?version=${shown.number}`} />
              )}
            </div>
            {shown.changeSummary && !onProposal && <p className="text-[15px] text-ink-soft">{shown.changeSummary}</p>}
            <WorkDocument
              content={shown.content}
              comments={viewing || onProposal ? [] : work.comments}
              marks={onProposal ? changes.marks : null}
              readOnly={!!viewing || building || onProposal}
              onComment={(section, content) => act(() => api.post(`/projects/${pid}/work/comments`, { section, content }), 'Votre remarque n’a pas pu être enregistrée')}
              onDeleteComment={id => act(() => api.delete(`/projects/${pid}/work/comments/${id}`), 'La remarque n’a pas pu être retirée')}
            />
            {shown.sources?.length > 0 && (
              <details className="text-sm text-ink-muted">
                <summary className="cursor-pointer font-semibold">Sources consultées ({shown.sources.length})</summary>
                <ul className="mt-2 space-y-1">
                  {shown.sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-action underline break-words">{s.title}</a></li>)}
                </ul>
              </details>
            )}
          </div>

          <aside className="space-y-4" aria-label="Autour de votre projet">
            {!viewing && !proposal && !building && (
              <MoveForward busy={busy} isDemo={isDemo} onRetouch={retouch} onReview={review}
                openReview={work.openReview ? { to: `/projects/${pid}/meeting/${work.openReview.id}` } : null} />
            )}
            <Ideas ideas={work.ideas} onToggle={i => act(() => api.patch(`/projects/${pid}/work/ideas/${i.id}`, { state: i.state === 'set_aside' ? 'active' : 'set_aside' }), 'L’idée n’a pas pu être mise à jour')} />

            {work.assumptions.length > 0 && (
              <Card className="p-4" data-tour="pw-assumptions">
                <SectionLabel>Ce que j’ai supposé</SectionLabel>
                <p className="text-xs text-ink-muted mt-1">Vous ne l’aviez pas dit : changez ce qui ne vous convient pas.</p>
                <ul className="mt-3 space-y-3">
                  {work.assumptions.map(a => (
                    <Assumption key={a.id} a={a} onSave={(x, value) => act(() => api.patch(`/projects/${pid}/work/assumptions/${x.id}`, { value }), 'Le changement n’a pas pu être enregistré')} />
                  ))}
                </ul>
              </Card>
            )}

            <Criteria criteria={work.criteria} onSave={lines => act(() => api.put(`/projects/${pid}/work/criteria`, { criteria: lines }), 'La liste n’a pas pu être enregistrée')} />

            {work.versions.length > 1 && (
              <Card className="p-4">
                <SectionLabel className="flex items-center gap-1.5"><History size={14} aria-hidden="true" /> Les versions</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {work.versions.map(v => (
                    <li key={v.number}>
                      <button type="button" onClick={() => showVersion(v.number)}
                        className={`text-left text-sm w-full rounded-lg px-2 py-1.5 hover:bg-canvas ${(viewing?.number ?? current?.number) === v.number ? 'bg-canvas font-bold text-ink' : 'text-ink-soft'}`}>
                        {versionLabel(v.number)}{v.number === current?.number ? ' (en cours)' : ''}
                        <span className="block text-xs text-ink-muted">{new Date(v.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
