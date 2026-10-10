import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Code2, RotateCcw, Plus, CornerDownRight } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Badge, Button } from '../../components/ui';
import SummaryDisplayModal from '../../components/SummaryDisplayModal';
import ExportModal from '../../components/ExportModal';

// Historique : les réunions tenues (refonte UX v5.1 — remplace la liste
// « Réunions » de l'ancienne page projet).

const TYPE_LABEL = { decision: 'Décision', claude_code: 'Claude Code', stack: 'Outils' };

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

function StatusBadge({ status }) {
  if (status === 'accepted' || status === 'complete') return <Badge tone="ok">Conclue</Badge>;
  if (status === 'open')      return <Badge tone="action">En cours</Badge>;
  if (status === 'abandoned') return <Badge tone="muted">Abandonnée</Badge>;
  return <Badge tone="await">Interrompue</Badge>;
}

function SessionItem({ session, projectId, onViewDeliverable }) {
  const navigate = useNavigate();
  const [reopening, setReopening] = useState(false);
  const type = intentionOf(session);
  const finished = session.status === 'accepted' || session.status === 'abandoned';
  const path = `/projects/${projectId}/meeting/${session.id}`;

  const reopen = async () => {
    if (reopening) return;
    setReopening(true);
    try {
      await api.post(`/projects/${projectId}/sessions/${session.id}/reopen`);
      navigate(path);
    } catch { setReopening(false); }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3" style={{ paddingLeft: 16 + session.depth * 20 }}>
      {session.depth > 0 && <CornerDownRight size={14} className="text-ink-faint shrink-0" aria-label="Suite de la réunion précédente" />}
      <div className="flex-1 min-w-[200px]">
        <Link to={path} className="text-sm font-bold text-ink hover:text-action">{session.task}</Link>
        <p className="text-xs text-ink-faint mt-0.5">
          {TYPE_LABEL[type] || 'Réunion'} · {session.agentCount ?? '–'} agents · {new Date(session.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </p>
      </div>
      <StatusBadge status={session.status} />
      <div className="flex items-center gap-1">
        {session.status === 'accepted' && (
          <Button size="sm" variant="ghost" onClick={() => onViewDeliverable(session)}>
            {type === 'claude_code' ? <><Code2 size={15} /> Prompt</> : <><FileText size={15} /> Compte-rendu</>}
          </Button>
        )}
        {finished ? (
          <Button size="sm" variant="ghost" onClick={reopen} disabled={reopening}><RotateCcw size={15} /> {reopening ? '…' : 'Reprendre'}</Button>
        ) : session.status === 'open' && (
          <Link to={path} className="h-9 px-3 inline-flex items-center rounded-[10px] text-[13px] font-bold text-action hover:bg-action-light">Rejoindre</Link>
        )}
      </div>
    </li>
  );
}

export default function ProjectHistory() {
  const { project } = useProject();
  const [sessions, setSessions] = useState(null);
  const [stats, setStats] = useState(null);
  const [deliverableSession, setDeliverableSession] = useState(null);

  useEffect(() => {
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => setSessions([]));
    api.get(`/projects/${project.id}/stats`).then(({ data }) => setStats(data)).catch(() => {});
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
            {buildThreads(sessions).map(s => (
              <SessionItem key={s.id} session={s} projectId={project.id} onViewDeliverable={setDeliverableSession} />
            ))}
          </ul>
        )}
      </div>

      {stats && stats.totalTokens > 0 && (
        <p className="mt-3 text-xs text-ink-faint">
          Consommation du projet : {stats.totalTokens.toLocaleString('fr-FR')} jetons sur {stats.sessionCount} réunion{stats.sessionCount !== 1 ? 's' : ''} · coût estimé ~{stats.estimatedCost.toFixed(2)} €
        </p>
      )}

      {dlg && intentionOf(dlg) === 'claude_code' && (
        <ExportModal directContent={dlg.deliverable || dlg.summary} projectId={project.id} onClose={() => setDeliverableSession(null)} />
      )}
      {dlg && intentionOf(dlg) !== 'claude_code' && (
        <SummaryDisplayModal title={dlg.task} date={dlgDate} content={dlg.summary} onClose={() => setDeliverableSession(null)} />
      )}
    </>
  );
}
