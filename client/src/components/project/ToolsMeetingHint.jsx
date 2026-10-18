import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import api from '../../utils/api';
import { Button } from '../ui';
import { notifyError, notifySuccess } from '../../utils/notify';

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

  // v5.1 (réunion « WorldOfMetal ») : pas de réunion « outils » sur un projet que personne n'a
  // encore décrit — on choisissait un hébergeur sans savoir ce que fait le site
  if (meeting.framingFirst) {
    return (
      <div className="rounded-xl bg-await-bg border-2 border-await-border p-4 flex flex-wrap items-center gap-3" data-tour="tools-meeting-hint">
        <Wrench size={20} className="text-await shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-sm font-extrabold text-await">D’abord, racontez votre projet</p>
          <p className="text-xs text-ink-muted mt-0.5">Les outils dépendent de ce que fera votre projet : les assistants ne peuvent pas les choisir avant de le connaître.</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/projects/${projectId}`)}>Raconter mon projet</Button>
      </div>
    );
  }

  // Débutant : BlabIA propose ses outils et leur coût, il valide d'un clic (pas de réunion technique)
  const usePack = async () => {
    try {
      await api.post(`/projects/${projectId}/tools/recommended-pack`);
      notifySuccess('Les outils recommandés par BlabIA sont retenus. Vous pouvez les revoir sur la page Outils.');
      setMeeting(m => ({ ...m, done: true }));
    } catch (err) { notifyError(err, 'Les outils n’ont pas pu être retenus.'); }
  };
  if (meeting.simple && meeting.pack) {
    const { tools, monthlyMin, monthlyMax } = meeting.pack;
    return (
      <div className="rounded-xl bg-await-bg border-2 border-await-border p-4 space-y-3" data-tour="tools-meeting-hint">
        <div className="flex gap-3">
          <Wrench size={20} className="text-await shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold text-await">Avant de construire : les outils de votre projet</p>
            <p className="text-xs text-ink-muted mt-0.5">BlabIA vous propose ceux qu’il connaît le mieux, pour environ {monthlyMin} à {monthlyMax} € par mois en tout :</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-ink-soft">
              {tools.map(t => <li key={t.name}><strong className="text-ink">{t.name}</strong> · {t.role}</li>)}
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={start}>En discuter en réunion</Button>
          <Button size="sm" variant="primary" onClick={usePack}>D’accord, utiliser ces outils</Button>
        </div>
      </div>
    );
  }

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
