import { RotateCcw } from 'lucide-react';
import { Button } from '../ui';

// Confirmation de la réinitialisation d'une réunion (extrait de pages/MeetingRoom.jsx)
export default function ResetMeetingModal({ busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="reset-title" className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-await-light text-await inline-flex items-center justify-center shrink-0">
            <RotateCcw size={20} aria-hidden="true" />
          </span>
          <div>
            <h3 id="reset-title" className="text-lg font-extrabold text-ink">Réinitialiser cette réunion ?</h3>
            <p className="text-sm text-ink-muted">Elle repartira de zéro, avec le même objectif et les mêmes agents.</p>
          </div>
        </div>
        <ul className="text-sm text-ink-soft space-y-1.5 bg-await-bg border border-await-border rounded-xl p-3.5">
          <li>• Tous les échanges de cette réunion sont effacés</li>
          <li>• Sa contribution à la mémoire du projet est retirée</li>
          <li>• La mémoire des étapes suivantes est réinitialisée</li>
        </ul>
        <p className="text-xs text-ink-faint">Les étapes précédentes sont conservées.</p>
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onCancel} disabled={busy}>Annuler</Button>
          <Button variant="await" className="flex-1" onClick={onConfirm} disabled={busy}>
            {busy ? 'Réinitialisation…' : <><RotateCcw size={15} aria-hidden="true" /> Réinitialiser</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
