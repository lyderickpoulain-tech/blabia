import { CircleCheck, Rocket, Flag } from 'lucide-react';
import { Button } from '../ui';
// ── Bannière suggest_close (orchestrateur) ────────────────────────────────────
// v5.1 (15/10/2026) : charte v5 (jetons ok / ai, boutons du kit), à la place du
// vert et du bleu de la v4. Conclure ouvre la fenêtre de conclusion ; une fois la
// réunion conclue, on revient au tableau de bord du projet (MeetingRoom).

export function MeetingSuggestCloseBanner({
  suggestClose,
  setSuggestClose,
  isClosed,
  currentIntention,
  setShowCloseModal,
  hasDevRepo = false, // dépôt GitHub relié : le développement se lance à la conclusion
}) {
  if (!suggestClose || isClosed) return null;

  const code = currentIntention === 'claude_code';
  const conclude = () => { setShowCloseModal(true); setSuggestClose(null); };

  return (
    <div role="status" className={`shrink-0 mx-3 mt-2 mb-1 rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${code ? 'bg-ai-bg border-ai-border' : 'bg-ok-light border-ok-border'}`}>
      <CircleCheck size={20} strokeWidth={1.75} className={`shrink-0 ${code ? 'text-ai' : 'text-ok'}`} aria-hidden="true" />
      <div className="flex-1 min-w-[200px]">
        <p className={`text-sm font-extrabold ${code ? 'text-ai' : 'text-ok'}`}>
          {code ? 'Les agents estiment que les besoins sont clarifiés.' : 'Les agents estiment que l’objectif est atteint.'}
        </p>
        {suggestClose.reason && <p className="text-[13px] text-ink-soft mt-0.5 leading-snug">{suggestClose.reason}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={() => setSuggestClose(null)}>Continuer les échanges</Button>
        <Button size="sm" variant="primary" onClick={conclude}>
          {code
            ? <><Rocket size={15} aria-hidden="true" /> {hasDevRepo ? 'Générer le prompt et lancer le développement' : 'Générer le prompt et conclure'}</>
            : <><Flag size={15} aria-hidden="true" /> Conclure la réunion</>}
        </Button>
      </div>
    </div>
  );
}
