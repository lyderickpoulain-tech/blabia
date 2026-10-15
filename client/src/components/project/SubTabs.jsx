import { NavLink } from 'react-router-dom';
import { useProject } from './ProjectShell';

// Onglets d'une rubrique du menu (v5.1, 16/10/2026) : le menu regroupe des pages voisines —
// « Réunions » (Plan, Historique) et « Décisions et actions » (Registre, Actions et missions).
const GROUPS = {
  meetings: [{ to: 'reunions', label: 'Plan' }, { to: 'historique', label: 'Historique' }],
  follow:   [{ to: 'decisions', label: 'Registre des décisions' }, { to: 'actions', label: 'Actions et missions' }],
};

export default function SubTabs({ group }) {
  const { project } = useProject();
  return (
    <nav aria-label="Onglets de la rubrique" className="flex gap-1 mb-4 border-b border-line">
      {GROUPS[group].map(t => (
        <NavLink key={t.to} to={`/projects/${project.id}/${t.to}`}
          className={({ isActive }) => `h-10 px-3 inline-flex items-center text-sm border-b-2 -mb-px transition ${
            isActive ? 'border-action text-action font-extrabold' : 'border-transparent text-ink-muted font-semibold hover:text-ink'}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
