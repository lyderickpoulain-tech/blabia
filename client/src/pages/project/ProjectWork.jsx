import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Clock, History, Lightbulb, ListChecks, Pencil, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, SectionLabel } from '../../components/ui';
import WorkDocument, { countVerify } from '../../components/work/WorkDocument';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject } from '../../components/project/ProjectShell';

// v6 « l'ouvrage d'abord » : « Mon projet ». La version en cours en grand ; à côté, les idées
// du porteur et leur présence, ce que BlabIA a supposé (modifiable : la version suivante
// l'applique), « Ce sera fini quand… », les versions précédentes.
// Mots de l'écran : « Votre projet », « Ce que j'ai supposé », « Première version »,
// « Version 2 » — jamais « ouvrage », « pari », « V0 ».

export const versionLabel = n => (n === 1 ? 'Première version' : `Version ${n}`);
const POLL_MS = 3000;

const STAGES = {
  first: {
    reading: 'Je lis votre récit.',
    writing: 'J’écris la première version complète : tout ce que vous avez demandé, et ce que j’ai dû supposer.',
    saving:  'Je range la version et vos idées.',
  },
  next: {
    reading: 'Je relis la version en cours et vos changements.',
    writing: 'J’écris la version suivante avec vos changements.',
    saving:  'Je range la nouvelle version.',
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
          <ul className="mt-3 space-y-1.5">
            {criteria.map(c => <li key={c.id} className="text-sm text-ink flex gap-2"><span className="w-1.5 h-1.5 rounded-full bg-action mt-[0.5em] shrink-0" aria-hidden="true" />{c.text}</li>)}
            {!criteria.length && <li className="text-sm text-ink-muted">Rien pour l’instant.</li>}
          </ul>
          <button type="button" onClick={() => { setText(criteria.map(c => c.text).join('\n')); setEditing(true); }}
            className="mt-3 text-xs font-semibold text-action hover:underline inline-flex items-center gap-1"><Pencil size={12} aria-hidden="true" /> Corriger</button>
        </>
      )}
    </Card>
  );
}

export default function ProjectWork({ initial, onReload }) {
  const { project, reloadProject } = useProject();
  const [work, setWork] = useState(initial);
  const [viewing, setViewing] = useState(null); // version précédente affichée { number, content, changeSummary }
  const [busy, setBusy] = useState(false);
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
    try { const { data } = await fn(); if (data?.exists !== undefined) setWork(data); else await load(); }
    catch (err) { notifyError(err, message); }
  };

  if (!work) return null;
  const building = work.build?.status === 'building';
  const failed = work.build?.status === 'failed';
  const current = work.current;
  const pendingCount = (work.pending?.assumptions || 0) + (work.pending?.comments || 0);
  const shown = viewing || current;
  const verify = countVerify(shown?.content);

  const nextVersion = async () => {
    setBusy(true);
    await act(() => api.post(`/projects/${pid}/work/next`), 'La version suivante n’a pas pu démarrer');
    setBusy(false);
  };
  const retry = () => act(() => api.post(`/projects/${pid}/work/${current ? 'next' : 'first'}`, {}), 'Le nouvel essai n’a pas pu démarrer').then(onReload);
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

      {pendingCount > 0 && !building && !viewing && (
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
              <Badge tone={viewing ? 'muted' : 'ai'}>{versionLabel(shown.number)}{viewing ? ' (ancienne)' : ''}</Badge>
              {verify > 0 && <Badge tone="await"><TriangleAlert size={12} aria-hidden="true" /> {verify} point{verify > 1 ? 's' : ''} à vérifier</Badge>}
              {viewing && <Button size="sm" variant="secondary" onClick={() => setViewing(null)}>Revenir à la version en cours</Button>}
            </div>
            {shown.changeSummary && <p className="text-[15px] text-ink-soft">{shown.changeSummary}</p>}
            <WorkDocument
              content={shown.content}
              comments={viewing ? [] : work.comments}
              readOnly={!!viewing || building}
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
