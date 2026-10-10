import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';

const DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const dayName = d => DAYS[(Number(d) || 1) - 1];

// Rappels hebdomadaires des actions (v5.1) : réglage du projet (désactivé par défaut).
// Le jour d'envoi se règle dans le profil de chaque personne.
export default function RemindersToggle({ checked, onChange, reminderDay, disabled = false, compact = false }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border transition ${compact ? 'px-3 py-2' : 'p-3.5'} ${checked ? 'border-action-border bg-action-light/50' : 'border-line bg-white'} ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
      <Mail size={compact ? 17 : 20} className={`shrink-0 mt-0.5 ${checked ? 'text-action' : 'text-ink-muted'}`} aria-hidden="true" />
      <span className="flex-1">
        <span className="block text-sm font-extrabold text-ink">Rappel hebdomadaire par e-mail</span>
        <span className="block text-xs text-ink-muted mt-0.5">
          Actions en retard, de la semaine et prochaines, chaque {dayName(reminderDay)} matin
          (<Link to="/profile" className="font-bold text-action hover:underline" onClick={e => e.stopPropagation()}>changer le jour</Link>).
          Envoyé au propriétaire et aux membres du projet.
        </span>
      </span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}
        className="mt-1 w-5 h-5 shrink-0 accent-action" aria-label="Rappel hebdomadaire par e-mail" />
    </label>
  );
}
