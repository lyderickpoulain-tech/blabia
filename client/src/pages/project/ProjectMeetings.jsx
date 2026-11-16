import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import api from '../../utils/api';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import { Badge, Button, Card } from '../../components/ui';
import { notifyError } from '../../utils/notify';

// v6 phase 4 : « Réunions » sans le mode avancé. Une réunion se lance en un clic (« Demander
// l'avis de l'équipe ») ; la liste montre les réunions du projet, sans plan, type, modèle ni coût.
// Le mode avancé garde le plan et l'historique v5.1 (ProjectPlan, ProjectHistory).

const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function statusOf(s) {
  if (s.status === 'open') return { tone: 'action', label: 'En cours' };
  if (s.status === 'accepted' || s.status === 'complete') return { tone: 'ok', label: 'Terminée' };
  if (s.status === 'postponed') return { tone: 'await', label: 'Reportée' };
  return { tone: 'muted', label: 'Arrêtée' };
}

export default function ProjectMeetings() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [hasVersion, setHasVersion] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/projects/${project.id}/sessions`).then(({ data }) => setSessions(data)).catch(() => setSessions([]));
    api.get(`/projects/${project.id}/work`).then(({ data }) => setHasVersion(!!data.current)).catch(() => {});
  }, [project.id]);

  const review = async () => {
    setBusy(true);
    try { const { data } = await api.post(`/projects/${project.id}/work/review`); navigate(`/projects/${project.id}/meeting/${data.sessionId}`); }
    catch (err) { notifyError(err, 'La réunion n’a pas pu s’ouvrir'); setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Réunions" subtitle="Deux ou trois assistants relisent votre projet avec vous ; à la fin, la version suivante vous est proposée.">
        {hasVersion && !project.isDemo && (
          <Button variant="primary" onClick={review} disabled={busy}><Users size={16} aria-hidden="true" /> Demander l’avis de l’équipe</Button>
        )}
      </PageHeader>
      {!hasVersion && sessions && (
        <p className="text-sm text-ink-muted mb-4">Les réunions commencent quand votre projet a sa première version (« Mon projet »).</p>
      )}
      {sessions === null ? <p className="text-sm text-ink-muted">Chargement…</p> : sessions.length === 0 ? (
        <Card className="p-5 text-sm text-ink-muted">Aucune réunion pour l’instant.</Card>
      ) : (
        <ul className="space-y-2">
          {sessions.map(s => {
            const st = statusOf(s);
            return (
              <li key={s.id}>
                <Link to={`/projects/${project.id}/meeting/${s.id}`}
                  className="flex flex-wrap items-center gap-3 bg-white border border-line rounded-xl px-4 py-3 hover:border-action-border">
                  <span className="flex-1 min-w-[200px]">
                    <span className="block text-[15px] font-bold text-ink">{s.task}</span>
                    <span className="block text-xs text-ink-muted">{fmtDate(s.createdAt)}</span>
                  </span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
