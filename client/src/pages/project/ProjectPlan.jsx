import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useProject, PageHeader } from '../../components/project/ProjectShell';
import ProjectTimelinePanel from '../../components/ProjectTimelinePanel';
import GenerateTimelineModal from '../../components/GenerateTimelineModal';
import { Button } from '../../components/ui';

// Plan : les réunions à venir, dans l'ordre (refonte UX v5.1 — remplace le
// panneau « Réunions » de droite de l'ancienne page projet)
export default function ProjectPlan() {
  const { project } = useProject();
  const [showGenerate, setShowGenerate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <PageHeader title="Plan" subtitle="Les réunions du projet, dans l'ordre où les tenir : la prochaine en tête, les terminées repliées en bas. Glissez une carte pour la déplacer.">
        {project.brief && (
          <Button data-tour="plan-generate" variant="secondary" onClick={() => setShowGenerate(true)} className="text-ai border-ai-border">
            <Sparkles size={16} /> Proposer un plan avec l'IA
          </Button>
        )}
      </PageHeader>
      <ProjectTimelinePanel projectId={project.id} variant="page" refreshKey={refreshKey} />
      {showGenerate && (
        <GenerateTimelineModal
          project={project}
          existingCount={0}
          onClose={() => setShowGenerate(false)}
          onAdded={() => { setShowGenerate(false); setRefreshKey(k => k + 1); }}
        />
      )}
    </>
  );
}
