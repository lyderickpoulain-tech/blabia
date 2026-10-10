import { useProject, PageHeader } from '../../components/project/ProjectShell';
import DecisionRegistryPanel from '../../components/DecisionRegistryPanel';

// Décisions : le registre de ce qui est tranché pour le projet
export default function ProjectDecisions() {
  const { project, refreshCounts } = useProject();
  return (
    <>
      <PageHeader title="Décisions" subtitle="Ce qui est tranché pour ce projet. Les agents ne reposent pas ces questions ; remettez une décision en question pour qu'ils la retraitent." />
      <div data-tour="dec-registry">
        <DecisionRegistryPanel projectId={project.id} onChanged={refreshCounts} />
      </div>
    </>
  );
}
