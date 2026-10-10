import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw } from 'lucide-react';
import api from '../../utils/api';
import { notifyError } from '../../utils/notify';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import ProjectToolsPanel from '../../components/tools/ProjectToolsPanel';
import { Button, Card } from '../../components/ui';
import Markdown from '../../components/Markdown';

const fmtDate = d => new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// Guide de mise en place, sur demande : comment relier pas à pas les outils retenus
// (dépôt GitHub, hébergeur, nom de domaine…). Rédigé avec une recherche web, conservé.
function SetupGuide({ project }) {
  const [guide, setGuide] = useState(undefined); // undefined = chargement, null = jamais demandé
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/projects/${project.id}/tools`).then(({ data }) => setGuide(data.guide || null)).catch(() => setGuide(null));
  }, [project.id]);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${project.id}/tools/guide`);
      setGuide(data); setOpen(true);
    } catch (err) { notifyError(err, 'Le guide n’a pas pu être rédigé.'); } finally { setBusy(false); }
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
      {guide && open && <div className="mt-4 pt-4 border-t border-line"><Markdown size="synthesis">{guide.text}</Markdown></div>}
    </Card>
  );
}

// Outils : les outils du projet, organisés par besoin
export default function ProjectTools() {
  const { project, refreshCounts } = useProject();
  return (
    <>
      <PageHeader title="Outils" subtitle="Les outils nécessaires au projet, pré-remplis avec vos outils et modifiables.">
        <Link to="/outils" className="h-11 px-4 inline-flex items-center rounded-[10px] border border-line bg-white text-sm font-bold text-ink-soft hover:bg-canvas">
          Mes outils
        </Link>
      </PageHeader>
      {!project.isDemo && <div className="mb-4"><SetupGuide project={project} /></div>}
      <ProjectToolsPanel projectId={project.id} onChanged={refreshCounts} />
    </>
  );
}
