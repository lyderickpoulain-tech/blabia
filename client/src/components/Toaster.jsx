import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { subscribe } from '../utils/notify';

// Notifications en bas de l'écran (utils/notify.js) : disparition automatique,
// fermeture manuelle, une même erreur n'est affichée qu'une fois à la fois.
const DURATION = 6000;

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => subscribe(t => {
    setToasts(prev => prev.some(x => x.message === t.message) ? prev : [...prev.slice(-3), t]);
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), DURATION);
  }), []);

  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[min(440px,calc(100vw-24px))] space-y-2 print:hidden">
      {toasts.map(t => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 shadow-lg text-sm ${
            t.tone === 'error' ? 'bg-white border-red-200 text-red-800' : 'bg-white border-ok-border text-ok'
          }`}>
          {t.tone === 'error'
            ? <AlertTriangle size={17} className="shrink-0 mt-0.5 text-red-600" aria-hidden="true" />
            : <CheckCircle2 size={17} className="shrink-0 mt-0.5" aria-hidden="true" />}
          <p className="flex-1">{t.message}</p>
          <button type="button" onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            aria-label="Fermer" className="shrink-0 -mr-1 w-6 h-6 inline-flex items-center justify-center rounded text-ink-faint hover:text-ink">
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
