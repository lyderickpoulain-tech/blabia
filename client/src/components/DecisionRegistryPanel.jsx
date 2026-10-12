import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RotateCcw, Undo2, Replace, ChevronDown, AlertTriangle, CalendarPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { Button, IconButton, Badge, Card, SectionLabel, AutoTextarea } from './ui';

// Registre des décisions du projet : ce qui est tranché (les agents ne le
// redemandent pas) ; l'humain peut modifier, remettre en question ou supprimer.

const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const inputCls = 'w-full text-sm text-ink border border-line rounded-[10px] px-3 py-2 outline-none bg-white focus:ring-2 focus:ring-action focus:border-transparent';

const MAX_AGENDA = 4; // points à l'ordre du jour d'une réunion (services/agenda.js)

// Mettre une décision remise en question à l'ordre du jour : réunion dédiée (par défaut),
// ou réunion de décision déjà prévue au plan (sujets liés)
function AgendaPicker({ projectId, decision, onDone, onCancel }) {
  const [meetings, setMeetings] = useState(null);
  const [choice, setChoice] = useState('new');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/projects/${projectId}/plan`).then(({ data }) => setMeetings((data.milestones || [])
      .filter(m => m.type === 'decision' && m.status !== 'done' && (Array.isArray(m.agenda) ? m.agenda.length : 0) < MAX_AGENDA)))
      .catch(() => setMeetings([]));
  }, [projectId]);
  const submit = async () => {
    setBusy(true); setError('');
    try {
      await api.post(`/projects/${projectId}/decisions/${decision.id}/agenda`, choice === 'new' ? {} : { milestoneId: choice });
      onDone();
    } catch (err) { setError(err.response?.data?.error || 'Impossible de la mettre à l’ordre du jour.'); setBusy(false); }
  };
  return (
    <div className="space-y-2 bg-white border border-line rounded-[10px] p-3">
      <p className="text-xs font-bold text-ink">Retraiter cette décision dans :</p>
      <label className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
        <input type="radio" name={`agenda-${decision.id}`} checked={choice === 'new'} onChange={() => setChoice('new')} className="mt-1 accent-action" />
        <span><strong>Une nouvelle réunion</strong>, dédiée à ce point (ajoutée à la fin du plan)</span>
      </label>
      {(meetings || []).map(m => (
        <label key={m.id} className="flex items-start gap-2 text-sm text-ink-soft cursor-pointer">
          <input type="radio" name={`agenda-${decision.id}`} checked={choice === m.id} onChange={() => setChoice(m.id)} className="mt-1 accent-action" />
          <span>La réunion prévue « {m.title} »{m.agenda?.length ? ` (${m.agenda.length} point${m.agenda.length > 1 ? 's' : ''} déjà)` : ''}</span>
        </label>
      ))}
      {meetings?.length > 0 && <p className="text-[11px] text-ink-faint">Regroupez seulement des sujets liés : {MAX_AGENDA} points au plus par réunion.</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={busy || meetings === null} onClick={submit}><CalendarPlus size={14} aria-hidden="true" /> {busy ? '…' : 'Mettre à l’ordre du jour'}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function DecisionItem({ decision, onPatch, onDelete, projectId, onReload }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'reopen' | 'agenda'
  const [statement, setStatement] = useState(decision.statement);
  const [rationale, setRationale] = useState(decision.rationale || '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => { setBusy(true); try { await fn(); setMode(null); } finally { setBusy(false); } };
  const reopened = decision.status === 'reopened';
  const superseded = decision.status === 'superseded';

  return (
    <div className={`border rounded-xl p-3.5 space-y-2 transition ${
      reopened ? 'border-await-border bg-await-bg' : superseded ? 'border-line bg-canvas opacity-70' : 'border-line bg-white'
    }`}>
      {mode === 'edit' ? (
        <div className="space-y-2">
          <AutoTextarea value={statement} onChange={e => setStatement(e.target.value)} aria-label="Décision" className={`${inputCls} !h-auto py-2`} />
          <AutoTextarea value={rationale} onChange={e => setRationale(e.target.value)} placeholder="Pourquoi (optionnel)" aria-label="Pourquoi" className={`${inputCls} !h-auto py-2 text-xs`} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={busy || !statement.trim()} onClick={() => run(() => onPatch(decision.id, { statement, rationale }))}>Enregistrer</Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Annuler</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0 space-y-1">
            <p className={`text-sm font-bold text-ink ${superseded ? 'line-through' : ''}`}>{decision.statement}</p>
            {decision.rationale && <p className="text-xs text-ink-soft">{decision.rationale}</p>}
            {decision.rejectedOptions?.length > 0 && <p className="text-[11px] text-ink-faint">Écarté : {decision.rejectedOptions.join(', ')}</p>}
            {reopened && (
              <p className="text-xs text-await font-semibold flex items-start gap-1.5">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>Remise en question{decision.reopenNote ? ` : ${decision.reopenNote}` : ''}. {decision.agendaMilestone
                  ? <>À l’ordre du jour de la réunion « <Link className="underline" to={`/projects/${projectId}/reunions`}>{decision.agendaMilestone.title}</Link> » : elle y sera retraitée, puis remplacée par la nouvelle décision.</>
                  : 'Mettez-la à l’ordre du jour d’une réunion pour qu’elle soit retraitée.'}</span>
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-faint pt-0.5">
              <Badge tone={decision.origin === 'human' ? 'action' : 'ai'} className="!text-[10px] !px-2 !py-0.5">
                {decision.origin === 'human' ? 'Votre arbitrage' : 'Hypothèse des agents'}
              </Badge>
              <span>{fmtDate(decision.createdAt)}</span>
              {decision.sessionTask && <span className="truncate max-w-[240px]">· {decision.sessionTask}</span>}
            </div>
          </div>
          {mode === null && (
            <div className="flex shrink-0 -mr-1 -mt-1">
              <IconButton size="sm" label="Modifier" onClick={() => setMode('edit')}><Pencil size={15} aria-hidden="true" /></IconButton>
              <IconButton size="sm" label="Supprimer" disabled={busy} className="hover:!text-red-600"
                onClick={() => { if (confirm('Supprimer cette décision du registre ?')) run(() => onDelete(decision.id)); }}>
                <Trash2 size={15} aria-hidden="true" />
              </IconButton>
            </div>
          )}
        </div>
      )}

      {mode === 'agenda' && (
        <AgendaPicker projectId={projectId} decision={decision} onCancel={() => setMode(null)} onDone={() => { setMode(null); onReload(); }} />
      )}

      {mode === 'reopen' && (
        <div className="space-y-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} autoFocus aria-label="Motif de la remise en question"
            placeholder="Pourquoi la remettre en question ? (les agents en tiendront compte)"
            className="w-full text-sm text-ink border border-await-border rounded-[10px] px-3 py-2 outline-none focus:ring-2 focus:ring-await-border resize-none bg-white" />
          <div className="flex gap-2">
            <Button size="sm" variant="await" disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'reopened', reopenNote: note }))}>
              <RotateCcw size={14} aria-hidden="true" /> Remettre en question
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Annuler</Button>
          </div>
        </div>
      )}

      {mode === null && (
        <div className="flex gap-1.5 flex-wrap">
          {decision.status === 'active' && (
            <Button size="sm" variant="ghost" className="!h-8 !text-await hover:!bg-await-bg" onClick={() => setMode('reopen')}>
              <RotateCcw size={14} aria-hidden="true" /> Remettre en question
            </Button>
          )}
          {decision.status !== 'active' && (
            <Button size="sm" variant="ghost" className="!h-8 !text-ok hover:!bg-ok-light" disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'active' }))}>
              <Undo2 size={14} aria-hidden="true" /> Rétablir
            </Button>
          )}
          {reopened && !decision.agendaMilestone && (
            <Button size="sm" variant="await" className="!h-8" onClick={() => setMode('agenda')}>
              <CalendarPlus size={14} aria-hidden="true" /> Mettre à l’ordre du jour
            </Button>
          )}
          {reopened && (
            <Button size="sm" variant="ghost" className="!h-8" disabled={busy} onClick={() => run(() => onPatch(decision.id, { status: 'superseded' }))}>
              <Replace size={14} aria-hidden="true" /> Marquer comme remplacée
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DecisionRegistryPanel({ projectId, onChanged }) {
  const [decisions, setDecisions] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [newStatement, setNewStatement] = useState('');
  const [newRationale, setNewRationale] = useState('');
  const [showSuperseded, setShowSuperseded] = useState(false);

  const load = () => api.get(`/projects/${projectId}/decisions`)
    .then(({ data }) => { setDecisions(data); onChanged?.(data); })
    .catch(() => setError('Impossible de charger le registre des décisions.'));

  useEffect(() => { load(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = async (id, body) => {
    try { await api.patch(`/projects/${projectId}/decisions/${id}`, body); await load(); }
    catch (err) { setError(err.response?.data?.error || 'Erreur lors de la modification'); }
  };
  const remove = async (id) => {
    try { await api.delete(`/projects/${projectId}/decisions/${id}`); await load(); }
    catch { setError('Erreur lors de la suppression'); }
  };
  const add = async () => {
    try {
      await api.post(`/projects/${projectId}/decisions`, { statement: newStatement, rationale: newRationale });
      setNewStatement(''); setNewRationale(''); setAdding(false);
      await load();
    } catch (err) { setError(err.response?.data?.error || 'Erreur lors de l\'ajout'); }
  };

  const reopened   = (decisions || []).filter(d => d.status === 'reopened');
  const active     = (decisions || []).filter(d => d.status === 'active');
  const superseded = (decisions || []).filter(d => d.status === 'superseded');

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

      {adding ? (
        <Card className="p-4 space-y-2 border-action-border">
          <input autoFocus value={newStatement} onChange={e => setNewStatement(e.target.value)} placeholder="La décision, en une phrase" aria-label="Décision" className={inputCls} />
          <input value={newRationale} onChange={e => setNewRationale(e.target.value)} placeholder="Pourquoi (optionnel)" aria-label="Pourquoi" className={`${inputCls} text-xs`} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={add} disabled={!newStatement.trim()}>Ajouter au registre</Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Annuler</Button>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden="true" /> Ajouter une décision</Button>
      )}

      {decisions === null && !error && (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
      )}

      {decisions && decisions.length === 0 && (
        <Card className="text-center py-10 px-6">
          <p className="text-sm font-bold text-ink mb-1">Aucune décision pour l'instant</p>
          <p className="text-sm text-ink-muted">Elles s'ajoutent à la conclusion de chaque réunion, après votre validation.</p>
        </Card>
      )}

      {reopened.length > 0 && (
        <section className="space-y-2">
          <SectionLabel className="!text-await">Remises en question · {reopened.length}</SectionLabel>
          {reopened.map((d, i) => <div key={d.id} data-tour={i === 0 ? 'dec-reopened' : undefined}><DecisionItem decision={d} onPatch={patch} onDelete={remove} projectId={projectId} onReload={load} /></div>)}
        </section>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <SectionLabel className="!text-ok">En vigueur · {active.length}</SectionLabel>
          {active.map(d => <DecisionItem key={d.id} decision={d} onPatch={patch} onDelete={remove} />)}
        </section>
      )}

      {superseded.length > 0 && (
        <section className="space-y-2">
          <button type="button" onClick={() => setShowSuperseded(s => !s)} aria-expanded={showSuperseded}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ink-muted hover:text-ink">
            <ChevronDown size={14} className={`transition-transform ${showSuperseded ? 'rotate-180' : ''}`} aria-hidden="true" />
            Remplacées · {superseded.length}
          </button>
          {showSuperseded && superseded.map(d => <DecisionItem key={d.id} decision={d} onPatch={patch} onDelete={remove} />)}
        </section>
      )}
    </div>
  );
}
