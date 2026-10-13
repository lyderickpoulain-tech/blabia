import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GripVertical, Check, Play, ChevronRight, ChevronDown, ListChecks, FileText, Plus, CalendarDays, CircleDot, Lock } from 'lucide-react';
import { Button, Badge, Card, SectionLabel } from '../ui';
import { STATUS_LABELS, STATUS_TONE, TYPE_LABEL, MeetingTypeIcon, fmtDate } from '../meeting/MilestoneDrawers';
import { InsertButton, InsertForm } from '../meeting/MeetingInsertControls';
import usePlanOrdering, { isLockedMilestone } from '../../hooks/usePlanOrdering';

// Page Plan (refonte v5.1) : les réunions à venir, numérotées dans l'ordre où les tenir,
// la prochaine mise en avant ; les réunions terminées repliées en dessous.
// Les données et les fenêtres (détail, livrables, choix Claude Code) restent dans ProjectTimelinePanel.

const DELIVERABLE_SHORT = { decision: 'Compte-rendu', claude_code: 'Prompt', stack: 'Outils' };

// Bouton principal d'une réunion à venir, selon la réunion liée
function primaryLabel(linked) {
  if (linked?.status === 'open') return 'Reprendre';
  if (linked?.status === 'abandoned') return 'Voir';
  return 'Préparer';
}

function MeetingMeta({ m, linked }) {
  const agendaCount = Array.isArray(m.agenda) ? m.agenda.length : 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <Badge tone="muted"><MeetingTypeIcon type={m.type} size={13} /> {TYPE_LABEL[m.type] || 'Réunion'}</Badge>
      {m.status !== 'pending' && m.status !== 'done' && <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</Badge>}
      {linked?.status === 'open' && <Badge tone="action"><CircleDot size={12} aria-hidden="true" /> Réunion ouverte</Badge>}
      {linked?.status === 'abandoned' && <Badge tone="await">Réunion abandonnée</Badge>}
      {agendaCount > 0 && (
        <Badge tone="await"><ListChecks size={13} aria-hidden="true" /> Ordre du jour : {agendaCount} point{agendaCount > 1 ? 's' : ''}</Badge>
      )}
      {m.dueDate && (
        <span className="inline-flex items-center gap-1 text-xs text-ink-muted"><CalendarDays size={13} aria-hidden="true" /> {fmtDate(m.dueDate)}</span>
      )}
    </div>
  );
}

function UpcomingCard({ m, rank, linked, isNext, tourAnchor, ordering, onOpen, onStart }) {
  const { dragId, dragOverId, startDrag, overDrag, endDrag, drop } = ordering;
  const dropTarget = dragOverId === m.id && dragId !== m.id;
  const { id: projectId } = useParams();
  // Actions à mener avant cette réunion, encore ouvertes : elle ne peut pas se tenir
  const blocked = (m.blockingActions || []).length > 0;
  return (
    <div
      onDragOver={e => overDrag(e, m)}
      onDrop={e => { e.preventDefault(); drop(m.id); }}
      onDragEnd={endDrag}
      data-tour={tourAnchor ? 'plan-current' : undefined}
      className={`group relative flex items-start gap-3 sm:gap-4 rounded-2xl border bg-white p-4 sm:p-5 transition cursor-pointer hover:border-action-border ${
        isNext ? 'border-action-border shadow-card' : 'border-line'
      } ${dropTarget ? 'ring-2 ring-action ring-offset-2' : ''} ${dragId === m.id ? 'opacity-50' : ''}`}
      onClick={() => onOpen(m, linked)}
    >
      <span
        draggable
        onDragStart={e => startDrag(e, m.id)}
        onClick={e => e.stopPropagation()}
        title="Glisser pour changer l'ordre"
        aria-hidden="true"
        className="hidden sm:flex absolute -left-0.5 top-1/2 -translate-y-1/2 h-10 w-5 items-center justify-center text-ink-faint opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition"
      >
        <GripVertical size={16} />
      </span>

      <span className={`mt-0.5 w-8 h-8 shrink-0 rounded-full text-sm font-extrabold inline-flex items-center justify-center ${
        isNext ? 'bg-action text-white' : 'bg-action-light text-action'
      }`} aria-label={`Réunion ${rank}`}>{rank}</span>

      <div className="flex-1 min-w-0">
        {isNext && <p className="text-xs font-extrabold uppercase tracking-wider text-action mb-1">Prochaine réunion</p>}
        <h3 className="text-[15px] font-bold text-ink leading-snug">{m.title}</h3>
        {m.description && <p className="text-sm text-ink-soft leading-relaxed mt-1 line-clamp-2">{m.description}</p>}
        <MeetingMeta m={m} linked={linked} />
        {blocked && (
          <div className="mt-2 rounded-lg border border-await-border bg-await-bg px-3 py-2 text-xs" onClick={e => e.stopPropagation()}>
            <p className="font-bold text-await flex items-center gap-1.5">
              <Lock size={13} aria-hidden="true" /> Bloquée : {m.blockingActions.length === 1 ? 'une action à mener' : `${m.blockingActions.length} actions à mener`} avant
            </p>
            <ul className="mt-1 space-y-0.5 text-ink-soft">
              {m.blockingActions.slice(0, 4).map(a => <li key={a.id}>• {a.title}</li>)}
              {m.blockingActions.length > 4 && <li className="text-ink-faint">… et {m.blockingActions.length - 4} autre{m.blockingActions.length - 4 > 1 ? 's' : ''}</li>}
            </ul>
            <Link to={`/projects/${projectId}/actions`} className="inline-block mt-1 font-bold text-action hover:underline">Voir les actions</Link>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1 self-center" onClick={e => e.stopPropagation()}>
        <Button size="sm" variant={(isNext && !blocked) || linked?.status === 'open' ? 'primary' : 'secondary'}
          disabled={blocked && !linked} title={blocked && !linked ? 'Menez d’abord les actions prévues avant cette réunion' : undefined}
          onClick={() => onStart(m, linked)}>
          <Play size={14} aria-hidden="true" /> <span className="hidden sm:inline">{primaryLabel(linked)}</span>
        </Button>
        <button type="button" onClick={() => onOpen(m, linked)} aria-label="Détail de la réunion" title="Détail de la réunion"
          className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-[10px] text-ink-muted hover:bg-muted-light hover:text-ink transition">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

function DoneRow({ m, rank, linked, onOpen, onShowDeliverable }) {
  return (
    <li onClick={() => onOpen(m, linked)}
      className="flex items-center gap-3 sm:gap-4 rounded-xl border border-line bg-white px-4 py-3 cursor-pointer hover:bg-canvas transition">
      <span className="w-7 h-7 shrink-0 rounded-full bg-ok-light text-ok inline-flex items-center justify-center" aria-label={`Réunion ${rank}, terminée`}>
        <Check size={15} strokeWidth={3} aria-hidden="true" />
      </span>
      <MeetingTypeIcon type={m.type} size={18} className="shrink-0 text-ink-faint" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink-soft leading-snug">{m.title}</p>
        <p className="text-xs text-ink-faint mt-0.5">
          {TYPE_LABEL[m.type] || 'Réunion'}{linked?.createdAt ? ` · ${fmtDate(linked.createdAt)}` : ''}
        </p>
      </div>
      {linked?.status === 'accepted' && (
        <Button size="sm" variant="ghost" className="!h-8 !text-ai hover:!bg-ai-bg shrink-0"
          onClick={e => { e.stopPropagation(); onShowDeliverable(linked, m.type); }}>
          <FileText size={14} aria-hidden="true" /> <span className="hidden sm:inline">{DELIVERABLE_SHORT[m.type] || 'Livrable'}</span>
        </Button>
      )}
    </li>
  );
}

export default function PlanBoard({ projectId, milestones, milestoneSessions, loading, onOpen, onStart, onShowDeliverable, onAdd, onRefresh }) {
  const ordering = usePlanOrdering(projectId, milestones, onRefresh);
  const [insertingAt, setInsertingAt] = useState(null); // id de la réunion après laquelle insérer, 'first'
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  if (loading && milestones.length === 0) {
    return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>;
  }

  const rankOf = Object.fromEntries(milestones.map((m, i) => [m.id, i + 1]));
  const upcoming = milestones.filter(m => !isLockedMilestone(m));
  const done = milestones.filter(isLockedMilestone);
  const pct = milestones.length ? Math.round((done.length / milestones.length) * 100) : 0;
  const insert = async (data, prevM, nextM) => { if (await ordering.insertBetween(data, prevM, nextM)) setInsertingAt(null); };
  const lastDone = done[done.length - 1] || null;
  // Visite guidée : la réunion en cours, sinon la prochaine
  const currentId = (upcoming.find(m => m.status === 'in_progress') || upcoming[0])?.id;

  return (
    <div className="space-y-6">
      {milestones.length > 0 && (
        <Card className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-[140px]">
            <p className="text-2xl font-extrabold text-ink leading-none">{done.length}<span className="text-ink-faint text-lg"> / {milestones.length}</span></p>
            <p className="text-xs text-ink-muted mt-1">réunion{milestones.length > 1 ? 's' : ''} tenue{done.length > 1 ? 's' : ''}</p>
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="bg-muted-light rounded-full h-2.5 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement du plan">
              <div className="h-full rounded-full bg-ok transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-ink-muted mt-1.5">
              {upcoming.length === 0 ? 'Toutes les réunions du plan sont tenues.' : `${upcoming.length} à venir`}
            </p>
          </div>
        </Card>
      )}

      {milestones.length === 0 && !adding && (
        <Card className="text-center py-12 px-6">
          <p className="text-sm font-bold text-ink mb-1">Aucune réunion au plan</p>
          <p className="text-sm text-ink-muted">Ajoutez une première réunion, ou laissez BlabIA proposer un plan à partir du brief du projet.</p>
        </Card>
      )}

      {upcoming.length > 0 && (
        <section data-tour="plan-list">
          <SectionLabel className="mb-2">À venir · {upcoming.length}</SectionLabel>
          {insertingAt === 'first'
            ? <InsertForm onSave={d => insert(d, lastDone, upcoming[0])} onCancel={() => setInsertingAt(null)} />
            : <InsertButton onClick={() => setInsertingAt('first')} />}
          {upcoming.map((m, i) => (
            <div key={m.id}>
              <UpcomingCard m={m} rank={rankOf[m.id]} linked={milestoneSessions[m.id]} isNext={i === 0} tourAnchor={m.id === currentId}
                ordering={ordering} onOpen={onOpen} onStart={onStart} />
              {insertingAt === m.id
                ? <InsertForm onSave={d => insert(d, m, upcoming[i + 1] || null)} onCancel={() => setInsertingAt(null)} />
                : i < upcoming.length - 1 && <InsertButton onClick={() => setInsertingAt(m.id)} />}
            </div>
          ))}
        </section>
      )}

      <div>
        {adding ? (
          <InsertForm submitLabel="Ajouter au plan" onSave={async d => { await onAdd(d); setAdding(false); }} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl border border-dashed border-line text-sm font-bold text-ink-muted hover:text-action hover:border-action-border hover:bg-action-light transition">
            <Plus size={16} aria-hidden="true" /> Ajouter une réunion en fin de plan
          </button>
        )}
      </div>

      {done.length > 0 && (
        <section data-tour={upcoming.length === 0 ? 'plan-list' : undefined} className="space-y-2">
          <button type="button" onClick={() => setShowDone(v => !v)} aria-expanded={showDone}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-ok hover:underline">
            <ChevronDown size={14} className={`transition-transform ${showDone ? 'rotate-180' : ''}`} aria-hidden="true" />
            Terminées · {done.length}
          </button>
          {showDone && (
            <ul className="space-y-2">
              {done.map(m => (
                <DoneRow key={m.id} m={m} rank={rankOf[m.id]} linked={milestoneSessions[m.id]} onOpen={onOpen} onShowDeliverable={onShowDeliverable} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
