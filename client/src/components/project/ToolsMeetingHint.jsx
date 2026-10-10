import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import api from '../../utils/api';
import { Button } from '../ui';

// Avant tout développement (réunion Claude Code, page Développements) : si aucune réunion
// « outils » n'a été tenue, la suggérer — hébergement, nom de domaine… se décident avant
// que Claude Code ne construise. Démarre la réunion prévue au plan s'il y en a une.
export default function ToolsMeetingHint({ projectId }) {
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState(null);
  useEffect(() => {
    api.get(`/projects/${projectId}/tools`).then(({ data }) => setMeeting(data.toolsMeeting || null)).catch(() => {});
  }, [projectId]);
  if (!meeting || meeting.done) return null;

  const start = () => navigate(`/projects/${projectId}/meeting/new`, {
    state: meeting.planned
      ? { milestoneId: meeting.planned.id, milestoneTitle: meeting.planned.title, milestoneType: 'stack' }
      : { milestoneTitle: 'Choisir les outils du projet : hébergement, nom de domaine…', milestoneType: 'stack' },
  });
  return (
    <div className="rounded-xl bg-await-bg border-2 border-await-border p-4 flex flex-wrap items-center gap-3" data-tour="tools-meeting-hint">
      <Wrench size={20} className="text-await shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-[220px]">
        <p className="text-sm font-extrabold text-await">Avant de développer, choisissez les outils</p>
        <p className="text-xs text-ink-muted mt-0.5">
          Aucune réunion « outils » n’a encore été tenue. Vous y renseignez l’outil de chaque catégorie nécessaire (hébergement, nom de domaine…) : sans elle, Claude Code devra deviner.
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={start}>{meeting.planned ? `Démarrer « ${meeting.planned.title} »` : 'Démarrer une réunion « outils »'}</Button>
    </div>
  );
}
