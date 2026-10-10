import { Link } from 'react-router-dom';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import ProjectToolsPanel from '../../components/tools/ProjectToolsPanel';

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
      <ProjectToolsPanel projectId={project.id} onChanged={refreshCounts} />
    </>
  );
}
