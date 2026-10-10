// ── Bannières suggest_close (orchestrateur) ───────────────────────────────────

export function MeetingSuggestCloseBanner({
  suggestClose,
  setSuggestClose,
  isClosed,
  currentIntention,
  setShowCloseModal,
  hasDevRepo = false, // dépôt GitHub relié : le développement se lance à la conclusion
}) {
  if (!suggestClose || isClosed) return null;

  if (currentIntention === 'claude_code') {
    return (
      <div className="shrink-0 mx-3 mt-2 mb-1 bg-blabia-blue-light border border-blabia-blue rounded-xl px-4 py-3 space-y-2">
        <div className="flex items-start gap-2">
          <span className="text-blabia-blue text-base shrink-0 mt-0.5">✅</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-blabia-blue">
              Les agents estiment que les besoins sont clarifiés.
            </p>
            {suggestClose.reason && (
              <p className="text-xs text-gray-600 mt-0.5 leading-snug">
                Points couverts : {suggestClose.reason}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowCloseModal(true); setSuggestClose(null); }}
            className="flex-1 text-xs font-semibold bg-blabia-blue hover:bg-blabia-blue-dark text-white px-3 py-2 rounded-lg transition"
          >
            🚀 {hasDevRepo ? 'Générer le prompt et lancer le développement' : 'Générer le prompt et clore'}
          </button>
          <button
            onClick={() => setSuggestClose(null)}
            className="text-xs font-medium text-blabia-blue hover:text-blabia-blue-dark border border-blabia-blue hover:bg-white px-3 py-2 rounded-lg transition"
          >
            Continuer les échanges
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 mx-3 mt-2 mb-1 flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
      <span className="text-green-600 text-base shrink-0 mt-0.5">✅</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-green-800">
          Les agents estiment que l'objectif est atteint.
        </p>
        {suggestClose.reason && (
          <p className="text-xs text-green-600 mt-0.5 leading-snug">{suggestClose.reason}</p>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => { setShowCloseModal(true); setSuggestClose(null); }}
          className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg transition"
        >
          🏁 Clore
        </button>
        <button
          onClick={() => setSuggestClose(null)}
          className="text-xs font-medium text-green-700 hover:text-green-900 border border-green-200 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
