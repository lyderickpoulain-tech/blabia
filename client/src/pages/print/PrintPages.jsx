import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, X, Check } from 'lucide-react';
import api from '../../utils/api';
import Markdown from '../../components/Markdown';

// Pages d'impression (v5.1) : export PDF par « Imprimer → Enregistrer en PDF ».
// Ouvertes dans un nouvel onglet ; l'impression se lance dès que le contenu est prêt.

const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const TYPE_LABEL = { decision: 'Relevé de décisions', claude_code: 'Prompt Claude Code', stack: 'Ajout d’un service' };
const intentionOf = s => { const i = s?.intention; if (Array.isArray(i)) return i[0]; try { return JSON.parse(i || '[]')[0]; } catch { return null; } };

function PrintFrame({ ready, error, children }) {
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 400); // laisse le rendu se terminer
    return () => clearTimeout(t);
  }, [ready]);
  return (
    <div className="min-h-screen bg-white text-ink">
      <div className="print:hidden sticky top-0 bg-canvas border-b border-line px-4 py-2 flex items-center gap-2 text-sm">
        <span className="flex-1 text-ink-muted">Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF ».</span>
        <button type="button" onClick={() => window.print()} disabled={!ready}
          className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] bg-action text-white font-bold disabled:opacity-40">
          <Printer size={15} aria-hidden="true" /> Imprimer / PDF
        </button>
        <button type="button" onClick={() => window.close()} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-[10px] border border-line font-bold text-ink-soft">
          <X size={15} aria-hidden="true" /> Fermer
        </button>
      </div>
      <main className="max-w-[760px] mx-auto px-8 py-10 print:px-0 print:py-0">
        {error ? <p className="text-red-700">{error}</p> : !ready ? <p className="text-ink-faint">Préparation…</p> : children}
      </main>
    </div>
  );
}

const Header = ({ title, sub }) => (
  <header className="mb-6 pb-4 border-b-2 border-ink">
    <p className="text-xs font-extrabold uppercase tracking-wider text-ink-faint">BlabIA</p>
    <h1 className="text-2xl font-extrabold leading-tight mt-1">{title}</h1>
    {sub && <p className="text-sm text-ink-muted mt-1">{sub}</p>}
  </header>
);

export function PrintSession() {
  const { id, sid } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/sessions/${sid}`)])
      .then(([p, s]) => { setData({ project: p.data, session: s.data }); document.title = `Compte-rendu — ${s.data.task}`; })
      .catch(() => setError('Réunion introuvable.'));
  }, [id, sid]);
  const s = data?.session;
  return (
    <PrintFrame ready={!!data} error={error}>
      {s && (
        <>
          <Header title={s.task} sub={`${data.project.name} · réunion du ${fmtDate(s.createdAt)} · ${TYPE_LABEL[intentionOf(s)] || 'Réunion'}`} />
          <Markdown size="synthesis">{s.summary || '_Pas de compte-rendu._'}</Markdown>
          {s.deliverable && intentionOf(s) === 'claude_code' && (
            <section className="mt-8">
              <h2 className="text-lg font-extrabold mb-2">Prompt Claude Code</h2>
              <pre className="whitespace-pre-wrap text-xs font-mono border border-line rounded-lg p-3">{s.deliverable}</pre>
            </section>
          )}
        </>
      )}
    </PrintFrame>
  );
}

export function PrintRegistry() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([api.get(`/projects/${id}`), api.get(`/projects/${id}/decisions`), api.get(`/projects/${id}/actions`)])
      .then(([p, d, a]) => { setData({ project: p.data, decisions: d.data, actions: a.data }); document.title = `Décisions et actions — ${p.data.name}`; })
      .catch(() => setError('Projet introuvable.'));
  }, [id]);
  const today = new Date().toISOString().slice(0, 10);
  const group = s => (data?.decisions || []).filter(d => d.status === s);
  const open = (data?.actions || []).filter(a => a.status !== 'done');
  const done = (data?.actions || []).filter(a => a.status === 'done');
  const Decision = ({ d }) => (
    <li className="mb-3 break-inside-avoid">
      <p className="font-bold">{d.statement}</p>
      {d.rationale && <p className="text-sm text-ink-soft">{d.rationale}</p>}
      {d.rejectedOptions?.length > 0 && <p className="text-xs text-ink-muted">Écarté : {d.rejectedOptions.join(', ')}</p>}
      {d.status === 'reopened' && d.reopenNote && <p className="text-xs text-await">Remise en question : {d.reopenNote}</p>}
      <p className="text-xs text-ink-faint">{d.origin === 'human' ? 'Votre arbitrage' : 'Hypothèse des assistants'} · {fmtDate(d.createdAt)}{d.sessionTask ? ` · ${d.sessionTask}` : ''}</p>
    </li>
  );
  return (
    <PrintFrame ready={!!data} error={error}>
      {data && (
        <>
          <Header title={`Décisions et actions — ${data.project.name}`} sub={`Export du ${fmtDate(new Date())}`} />
          <h2 className="text-xl font-extrabold mt-2 mb-3">Registre des décisions</h2>
          {data.decisions.length === 0 && <p className="text-ink-muted">Aucune décision pour l'instant.</p>}
          {[['reopened', 'Remises en question'], ['active', 'En vigueur'], ['superseded', 'Remplacées']].map(([k, label]) => group(k).length > 0 && (
            <section key={k} className="mb-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-ink-muted mb-2">{label}</h3>
              <ul className="list-disc pl-5">{group(k).map(d => <Decision key={d.id} d={d} />)}</ul>
            </section>
          ))}
          <h2 className="text-xl font-extrabold mt-8 mb-3">Actions entre les réunions</h2>
          {data.actions.length === 0 && <p className="text-ink-muted">Aucune action pour l'instant.</p>}
          {open.length > 0 && (
            <ol className="list-decimal pl-5 mb-4">
              {open.map(a => {
                const late = a.dueDate && String(a.dueDate).slice(0, 10) < today;
                return <li key={a.id} className="mb-1">{a.title}{a.dueDate && <span className={late ? 'text-await font-bold' : 'text-ink-muted'}> — {late ? 'en retard, ' : ''}{fmtDate(a.dueDate)}</span>}</li>;
              })}
            </ol>
          )}
          {done.length > 0 && (
            <>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-ink-muted mb-2">Faites</h3>
              <ul className="pl-5">{done.map(a => <li key={a.id} className="text-ink-muted"><Check size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />{a.title}</li>)}</ul>
            </>
          )}
        </>
      )}
    </PrintFrame>
  );
}
