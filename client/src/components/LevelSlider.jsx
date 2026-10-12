import { Meh, Smile, Laugh, SmilePlus, PartyPopper } from 'lucide-react';
// Curseur 1→5 réutilisé pour "maîtrise du sujet" et "humour" (création/édition
// de projet, démarrage de réunion, MeetingHeader en cours de réunion).
export default function LevelSlider({ label, value, onChange, labels, icons, disabled }) {
  const idx = Math.min(Math.max(value, 1), 5) - 1;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-bold text-ink-soft">{label}</label>
        <span className="text-xs font-bold text-action bg-action-light rounded-full px-2 py-0.5 flex items-center gap-1">
          {icons && (() => { const Icon = icons[idx]; return <Icon size={13} strokeWidth={2} aria-hidden="true" />; })()}
          {labels[idx]}
        </span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-action disabled:opacity-50"
      />
      <div className="flex justify-between text-[10px] text-ink-faint mt-0.5 px-0.5">
        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
      </div>
    </div>
  );
}

export const EXPERTISE_LABELS = ['Découverte', 'Initié', 'Intermédiaire', 'Avancé', 'Expert'];
export const HUMOR_LABELS     = ['Sobre', 'Détendu', 'Complice', 'Taquin', 'Réunion de potes'];
export const HUMOR_ICONS      = [Meh, Smile, Laugh, SmilePlus, PartyPopper];
