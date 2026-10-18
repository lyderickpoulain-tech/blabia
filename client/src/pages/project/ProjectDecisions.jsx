import { useProject, PageHeader } from '../../components/project/ProjectShell';
import SubTabs from '../../components/project/SubTabs';
import DecisionRegistryPanel from '../../components/DecisionRegistryPanel';
import ExportButtons from '../../components/ExportButtons';

// Décisions : le registre de ce qui est tranché pour le projet
export default function ProjectDecisions() {
  const { project, refreshCounts } = useProject();
  return (
    <>
      <SubTabs group="follow" />
      <PageHeader title="Décisions" subtitle="Ce qui est tranché pour ce projet. Les assistants ne reposent pas ces questions ; remettez une décision en question pour qu'ils la retraitent.">
        <ExportButtons data-tour="export-registry" pdfPath={`/projects/${project.id}/imprimer/registre`} wordPath={`/projects/${project.id}/export/registry/word`} />
      </PageHeader>
      <div data-tour="dec-registry">
        <DecisionRegistryPanel projectId={project.id} onChanged={refreshCounts} />
      </div>
    </>
  );
}
