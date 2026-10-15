import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Code2, RotateCcw, Plus, CornerDownRight, Trash2 } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Badge, Button, Card } from '../../components/ui';
import { formatUSD, kindLabel } from '../../utils/cost';
import SummaryDisplayModal from '../../components/SummaryDisplayModal';
import ExportModal from '../../components/ExportModal';
import { notifyError, notifySuccess } from '../../utils/notify';

// Historique : les réunions tenues (refonte UX v5.1 — remplace la liste
// « Réunions » de l'ancienne page projet).

const TYPE_LABEL = { decision: 'Décision', claude_code: 'Claude Code', stack: 'Services' };

function intentionOf(session) {
  const i = session?.intention;
  if (Array.isArray(i) && i.length) return i[0];
  try { const p = JSON.parse(i || '[]'); return p[0] || ''; } catch { return ''; }
}

// Aplatit les réunions en fil indenté (réunion → continuations)
function buildThreads(sessions) {
  const map = {};
  sessions.forEach(s => { map[s.id] = { ...s, children: [] }; });
  const roots = [];
  sessions.forEach(s => {
    if (s.parentSessionId && map[s.parentSessionId]) map[s.parentSessionId].children.push(map[s.id]);
    else roots.push(map[s.id]);
  });
  roots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const flatten = (node, depth) => [{ ...node, depth }, ...node.children
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .flatMap(c => flatten(c, depth + 1))];
  return roots.flatMap(r => flatten(r, 0));
}

function StatusBadge({ status, session }) {
  if (status === 'accepted' || status === 'complete') return <Badge tone="ok">Conclue</Badge>;
  if (status === 'open' && session?.prepRunning) return <Badge tone="ai">{session.runKind === 'delegate' ? 'Tenue par le bras droit' : 'Préparation en cours'}</Badge>;
  if (status === 'open' && session?.delegation && ['done', 'stopped'].includes(session.delegation.status)) return <Badge tone="ok">Tenue par le bras droit, à conclure</Badge>;
  if (status === 'open' && session?.prepReady)   return <Badge tone="ok">Préparée, à consulter</Badge>;
  if (status === 'open')      return <Badge tone="action">En cours</Badge>;
  if (status === 'abandoned') return <Badge tone="muted">Abandonnée</Badge>;
  if (status === 'postponed') return <Badge tone="await">Reportée</Badge>;
  return <Badge tone="await">Interrompue</Badge>;
}

function SessionItem({ session, projectId, cost, onViewDeliverable, tour, canDelete, onDeleted }) {
  const navigate = useNavigate();
  const [reopening, setReopening] = useState(false);
  const type = intentionOf(session);
  const finished = session.status === 'accepted' || session.status === 'abandoned';
  const postponed = session.status === 'postponed'; // en attente d'une mission : reprise prévue au plan
  const path = `/projects/${projectId}/meeting/${session.id}`;

  // Suppression (propriétaire) : la réunion et ce que les agents en retiennent
  const [deleting, setDeleting] = useState(false);
  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const { data: scope } = await api.get(`/projects/${projectId}/sessions/${session.id}/deletion`);
      if (scope.devRunning) { notifyError(null, 'Le développement de cette réunion est en cours : attendez qu’il se termine pour la supprimer.'); return; }
      const parts = ['son compte rendu, retiré de la mémoire du projet (les agents ne s’en serviront plus)'];
      if (scope.decisions) parts.push(`${scope.decisions} décision${scope.decisions > 1 ? 's' : ''} inscrite${scope.decisions > 1 ? 's' : ''} au registre`);
      if (scope.actions) parts.push(`${scope.actions} action${scope.actions > 1 ? 's' : ''} créée${scope.actions > 1 ? 's' : ''} à sa conclusion`);
      if (!confirm(`Supprimer définitivement la réunion « ${session.task} » ?\n\nSeront aussi supprimés :\n• ${parts.join('\n• ')}\n\nRestent : les développements déjà lancés et le coût de l’IA. Cette suppression est définitive.`)) return;
      await api.delete(`/projects/${projectId}/sessions/${session.id}`);
      notifySuccess('Réunion supprimée.');
      onDeleted?.(session.id);
    } catch (err) { notifyError(err, 'La réunion n’a pas pu être supprimée.'); } finally { setDeleting(false); }
  };

  const reopen = async () => {
    if (reopening) return;
    setReopening(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${session.id}/reopen`);
      navigate(path);
    } catch { setReopening(false); }
  };

  return (
    <li data-tour={tour} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" style={{ paddingLeft: 16 + session.depth * 20 }}>
      {session.depth > 0 && <CornerDownRight size={14} className="text-ink-faint shrink-0" aria-label="Suite de la réunion précédente" />}
      <div className="flex-1 min-w-[200px]">
        <Link to={path} className="text-sm font-bold text-ink hover:text-action">{session.task}</Link>
        <p className="text-xs text-ink-faint mt-0.5">
          {TYPE_LABEL[type] || 'Réunion'} · {session.agentCount ?? '–'} agents · {new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
          {cost > 0 && <span title="Coût réel de l'IA pour cette réunion"> · {formatUSD(cost)}</span>}
        </p>
      </div>
      <StatusBadge status={session.status} session={session} />
      <div className="flex items-center gap-1">
        {session.status === 'accepted' && (
          <Button size="sm" variant="ghost" onClick={() => onViewDeliverable(session)}>
            {type === 'claude_code' ? <><Code2 size={15} /> Prompt</> : <><FileText size={15} /> Compte-rendu</>}
          </Button>
        )}
        {finished ? (
          <Button size="sm" variant="ghost" onClick={reopen} disabled={reopening}><RotateCcw size={15} /> {reopening ? '…' : 'Reprendre'}</Button>
        ) : postponed ? (
          <Link to={`/projects/${projectId}/reunions`} className="h-9 px-3 inline-flex items-center rounded-[10px] text-[13px] font-bold text-await hover:bg-await-bg">Voir la reprise au plan</Link>
        ) : session.status === 'open' && (
          <Link to={path} className="h-9 px-3 inline-flex items-center rounded-[10px] text-[13px] font-bold text-action hover:bg-action-light">Rejoindre</Link>
        )}
        {canDelete && (
          <Button size="sm" variant="ghost" onClick={remove} disabled={deleting} aria-label={`Supprimer la réunion « ${session.task} »`} title="Supprimer la réunion">
            <Trash2 size={15} aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

// Coût de l'IA pour le projet : réel (chaque appel journalisé), détaillé par usage
function CostCard({ stats }) {
  const max = Math.max(...(stats.byKind || []).map(k => k.costUSD), 0.000001);
  const since = stats.trackedSince
    ? new Date(stats.trackedSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  return (
    <Card className="mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold text-ink">Coût de l'IA</h2>
        <p className="text-2xl font-extrabold text-ink">{formatUSD(stats.realCostUSD + stats.legacyCostUSD)}</p>
      </div>
      <p className="text-xs text-ink-muted mt-0.5">
        {stats.realCostUSD > 0 && <>{formatUSD(stats.realCostUSD)} réels{since && <> depuis le {since}</>} ({stats.calls} appel{stats.calls > 1 ? 's' : ''})</>}
        {stats.realCostUSD > 0 && stats.legacyCostUSD > 0 && ' · '}
        {stats.legacyCostUSD > 0 && <>{formatUSD(stats.legacyCostUSD)} estimés pour les réunions antérieures au suivi</>}
      </p>
      {stats.byKind?.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {stats.byKind.map(k => (
            <li key={k.kind} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-xs">
              <span className="text-ink-soft font-semibold truncate">{kindLabel(k.kind)}</span>
              <span className="h-2 rounded-full bg-canvas overflow-hidden" aria-hidden="true">
                <span className="block h-full rounded-full bg-ai" style={{ width: `${Math.max(3, (k.costUSD / max) * 100)}%` }} />
              </span>
              <span className="text-ink-muted font-bold tabular-nums text-right min-w-[64px]">{formatUSD(k.costUSD)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-ink-faint mt-3">Tarifs Anthropic en dollars US, calculés à partir des tokens exacts de chaque appel.</p>
    </Card>
  );
}

export default function ProjectHistory() {
  const { project, isOwner, refreshCounts } = useProject();
  const [sessions, setSessions] = useState(null);
  // Réunion supprimée : ses suites restent (rattachées à rien), la liste est relue
  const onDeleted = () => {
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => {});
    refreshCounts?.();
  };
  const [stats, setStats] = useState(null);
  const [deliverableSession, setDeliverableSession] = useState(null);
  // La liste ne porte pas le texte des comptes rendus : il est lu à l'ouverture (la fenêtre restait vide)
  const openDeliverable = async session => {
    try {
      const { data } = await api.get(`/projects/${project.id}/sessions/${session.id}`);
      setDeliverableSession({ ...session, summary: data.summary, deliverable: data.deliverable });
    } catch (err) { notifyError(err, 'Le compte rendu n’a pas pu être chargé.'); }
  };

  useEffect(() => {
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => setSessions([]));
    api.get(`/projects/${project.id}/stats`).then(({ data }) => setStats(data)).catch(err => notifyError(err, 'Coût de l’IA indisponible.'));
  }, [project.id]);

  const dlg = deliverableSession;
  const dlgDate = dlg?.createdAt ? new Date(dlg.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <>
      <PageHeader title="Historique" subtitle="Les réunions déjà tenues, avec leur compte-rendu et leur livrable.">
        {project.status === 'active' && (
          <Link to={`/projects/${project.id}/meeting/new`} className="h-11 px-4 inline-flex items-center gap-2 rounded-[10px] bg-action text-white text-sm font-bold hover:bg-action-dark">
            <Plus size={16} /> Nouvelle réunion
          </Link>
        )}
      </PageHeader>

      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        {sessions === null ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-faint text-center py-10">Aucune réunion pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-line">
            {(() => {
              const threads = buildThreads(sessions);
              const firstDone = threads.find(s => s.status === 'accepted')?.id; // ancre de la visite guidée
              return threads.map(s => (
              <SessionItem key={s.id} tour={s.id === firstDone ? 'hist-first' : undefined} session={s} projectId={project.id} cost={stats?.bySession?.[s.id] || 0} onViewDeliverable={openDeliverable}
                canDelete={isOwner && !project.isDemo} onDeleted={onDeleted} />
            ));
            })()}
          </ul>
        )}
      </div>

      {stats && (stats.realCostUSD > 0 || stats.legacyCostUSD > 0) && <CostCard stats={stats} />}

      {dlg && intentionOf(dlg) === 'claude_code' && (
        <ExportModal directContent={dlg.deliverable || dlg.summary} projectId={project.id} onClose={() => setDeliverableSession(null)} />
      )}
      {dlg && intentionOf(dlg) !== 'claude_code' && (
        <SummaryDisplayModal title={dlg.task} date={dlgDate} content={dlg.summary} onClose={() => setDeliverableSession(null)}
          formatsPath={project.isDemo ? null : `/projects/${project.id}/sessions/${dlg.id}/summary-format`}
          exports={{ pdfPath: `/projects/${project.id}/imprimer/reunion/${dlg.id}`, wordPath: `/projects/${project.id}/export/sessions/${dlg.id}/word` }} />
      )}
    </>
  );
}
