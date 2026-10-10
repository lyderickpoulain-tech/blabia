import { ShieldAlert } from 'lucide-react';

// Contradicteur (v5.1) : avocat du diable sélectif — interrupteur commun à la
// création de projet, aux paramètres du projet et au démarrage d'une réunion.
export default function ChallengerToggle({ checked, onChange, hint, disabled = false }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border p-3.5 transition ${checked ? 'border-await-border bg-await-bg' : 'border-line'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <ShieldAlert size={20} className={`shrink-0 mt-0.5 ${checked ? 'text-await' : 'text-ink-muted'}`} aria-hidden="true" />
      <span className="flex-1">
        <span className="block text-sm font-extrabold text-ink">Contradicteur</span>
        <span className="block text-xs text-ink-muted mt-0.5">
          {hint || 'Signale un point de vigilance seulement sur les choix à fort enjeu que personne n’a remis en cause (2 fois par réunion au plus). Vous en tenez compte ou l’écartez.'}
        </span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 shrink-0 accent-action" />
    </label>
  );
}
