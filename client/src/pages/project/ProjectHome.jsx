import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject } from '../../components/project/ProjectShell';
import ProjectWork from './ProjectWork';
import ProjectDashboard from './ProjectDashboard';
import { useAuth } from '../../contexts/AuthContext';

// v6 : l'accueil d'un projet. Un projet qui a sa version (ou qui l'écrit) ouvre « Mon
// projet » ; un projet d'avant la v6 garde son tableau de bord, avec en tête la proposition
// de créer sa version à partir de ce qui a déjà été dit et décidé.

function FromHistory({ onStarted }) {
  const { project } = useProject();
  const [busy, setBusy] = useState(false);
  if (project.isDemo) return null;
  const start = async () => {
    setBusy(true);
    try { await api.post(`/projects/${project.id}/work/first`, { fromHistory: true }); onStarted(); }
    catch (err) { notifyError(err, 'La première version n’a pas pu démarrer'); setBusy(false); }
  };
  return (
    <Card className="p-5 mb-5 border-ai/30 bg-ai-light/40">
      <h2 className="text-base font-extrabold text-ink flex items-center gap-2"><Sparkles size={18} className="text-ai" aria-hidden="true" /> Voir votre projet, tout de suite</h2>
      <p className="text-sm text-ink-soft mt-1">
        BlabIA rassemble votre récit, ce qui a été décidé et ce qui s’est dit en réunion, et en fait une première version complète de votre projet, que vous pourrez corriger.
      </p>
      <Button variant="primary" className="mt-3" onClick={start} disabled={busy}>
        {busy ? 'Démarrage…' : 'Créer mon projet à partir de l’historique'}
      </Button>
    </Card>
  );
}

export default function ProjectHome() {
  const { project } = useProject();
  const { user } = useAuth();
  const [work, setWork] = useState(undefined);
  const load = useCallback(() => api.get(`/projects/${project.id}/work`).then(({ data }) => setWork(data)).catch(() => setWork(null)), [project.id]);
  useEffect(() => { setWork(undefined); load(); }, [load]);

  if (work === undefined) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-action border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (work?.exists && (work.current || work.build?.status !== 'idle')) return <ProjectWork key={project.id} initial={work} onReload={load} />;
  // v6 phase 4 : sans le mode avancé, pas de tableau de bord v5.1 (plan, coûts, outils) ; les
  // réunions passées restent dans « Réunions »
  return (
    <>
      <FromHistory onStarted={load} />
      {user?.advancedMode ? <ProjectDashboard /> : (
        <p className="text-sm text-ink-muted">Les réunions déjà tenues sur ce projet sont dans « Réunions ».</p>
      )}
    </>
  );
}
