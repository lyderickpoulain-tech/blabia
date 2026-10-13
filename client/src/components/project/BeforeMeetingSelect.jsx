import { useEffect, useState } from 'react';
import api from '../../utils/api';

// « À faire avant la réunion… » (v5.1) : une action peut conditionner une réunion du plan,
// qui ne pourra pas se tenir tant que l'action n'est ni faite ni supprimée.
// Repères R1, R2… : numéros de la page Plan (ordre du plan, réunions tenues comprises).

// Réunions à venir du plan, avec leur repère
export function usePlanMeetings(projectId) {
  const [meetings, setMeetings] = useState([]);
  useEffect(() => {
    if (!projectId) return;
    api.get(`/projects/${projectId}/plan`)
      .then(({ data }) => setMeetings((data.milestones || [])
        .map((m, i) => ({ id: m.id, ref: `R${i + 1}`, title: m.title, status: m.status }))
        .filter(m => m.status !== 'done')))
      .catch(() => setMeetings([])); // facultatif : sans plan, pas de choix
  }, [projectId]);
  return meetings;
}

export default function BeforeMeetingSelect({ meetings, value, onChange, disabled, className = '' }) {
  if (!meetings?.length) return null;
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value || null)} disabled={disabled}
      aria-label="À faire avant la réunion" title="La réunion choisie ne pourra pas se tenir tant que l’action n’est pas faite"
      className={`text-xs text-ink-soft border border-line rounded-md px-2 h-8 outline-none bg-white max-w-[260px] ${className}`}>
      <option value="">Avant une réunion : non</option>
      {meetings.map(m => <option key={m.id} value={m.id}>Avant {m.ref} « {m.title.length > 40 ? `${m.title.slice(0, 40)}…` : m.title} »</option>)}
    </select>
  );
}
