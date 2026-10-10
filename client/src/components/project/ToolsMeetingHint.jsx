import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import api from '../../utils/api';
import { Button } from '../ui';

// Avant tout développement (réunion Claude Code, page Développements) : si les outils
// nécessaires pour construire et publier ne sont pas choisis — ni réunion « outils »
// conclue, ni outils validés sur la page Outils (routes/tools.js) —, le suggérer, en
// nommant les catégories manquantes. Démarre la réunion prévue au plan s'il y en a une.
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
        <p className="text-sm font-extrabold text-await">{meeting.missing?.length ? 'Avant de développer, complétez les outils' : 'Avant de développer, choisissez les outils'}</p>
        <p className="text-xs text-ink-muted mt-0.5">
          {meeting.missing?.length
            ? <>Aucun outil n’est encore retenu pour : <strong>{meeting.missing.join(', ')}</strong>. Renseignez-le sur la page <Link className="underline" to={`/projects/${projectId}/outils`}>Outils</Link> ou en réunion « outils » : sinon, Claude Code devra deviner.</>
            : 'Aucun outil n’est encore retenu pour ce projet. En réunion « outils », vous renseignez celui de chaque catégorie nécessaire (hébergement, nom de domaine…) : sinon, Claude Code devra deviner.'}
        </p>
      </div>
      <Button size="sm" variant="secondary" onClick={start}>{meeting.planned ? `Démarrer « ${meeting.planned.title} »` : 'Démarrer une réunion « outils »'}</Button>
    </div>
  );
}
